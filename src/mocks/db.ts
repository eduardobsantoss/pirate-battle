import {
  configKey,
  type HistoryQuery,
  type MatchRecord,
  type MatchRecordInput,
  type Page,
  type RankingEntry,
  type RankingQuery,
} from '../api/contracts';
import { readJson, STORAGE_PREFIX, writeJson } from '../storage/local';
import { buildFixtures } from './fixtures';

const DB_KEY = `${STORAGE_PREFIX}mock-db`;

/**
 * The mock "server" database. Confirmed records persist in localStorage so
 * they survive a refresh (and the deployed demo behaves like a real backend).
 */
function load(): MatchRecord[] {
  const stored = readJson<MatchRecord[]>(DB_KEY);
  return Array.isArray(stored) ? stored : buildFixtures();
}

function save(records: MatchRecord[]): void {
  writeJson(DB_KEY, records);
}

export function resetDb(): void {
  save(buildFixtures());
}

function paginate<T>(items: T[], page: number, pageSize: number): Page<T> {
  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const start = (page - 1) * pageSize;
  return { items: items.slice(start, start + pageSize), page, pageSize, totalItems, totalPages };
}

/**
 * Ranking order (deterministic):
 *   1. higher score
 *   2. longer effective duration (survived longer)
 *   3. earlier `playedAt` (who reached it first)
 *   4. `matchId` (stable final tiebreak)
 * Only matches with the same configuration are compared.
 */
export function compareRanking(a: MatchRecord, b: MatchRecord): number {
  return (
    b.score - a.score ||
    b.durationMs - a.durationMs ||
    a.playedAt.localeCompare(b.playedAt) ||
    a.matchId.localeCompare(b.matchId)
  );
}

export function queryRanking(q: RankingQuery): Page<RankingEntry> {
  const key = configKey(q);
  const sorted = load()
    .filter((r) => configKey(r.config) === key)
    .sort(compareRanking);
  const page = paginate(sorted, q.page, q.pageSize);
  const offset = (q.page - 1) * q.pageSize;
  return {
    ...page,
    items: page.items.map((r, i) => ({
      rank: offset + i + 1,
      matchId: r.matchId,
      playerId: r.playerId,
      playerName: r.playerName,
      score: r.score,
      durationMs: r.durationMs,
      playedAt: r.playedAt,
    })),
  };
}

export function queryHistory(q: HistoryQuery): Page<MatchRecord> {
  const mine = load()
    .filter((r) => r.playerId === q.playerId)
    .sort((a, b) => b.playedAt.localeCompare(a.playedAt) || b.matchId.localeCompare(a.matchId));
  return paginate(mine, q.page, q.pageSize);
}

/** Idempotent insert keyed by `matchId`. */
export function insertMatch(input: MatchRecordInput): { record: MatchRecord; created: boolean } {
  const records = load();
  const existing = records.find((r) => r.matchId === input.matchId);
  if (existing) return { record: existing, created: false };
  const record: MatchRecord = { ...input, recordedAt: new Date().toISOString() };
  records.push(record);
  save(records);
  return { record, created: true };
}
