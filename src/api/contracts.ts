/**
 * Typed REST contracts shared by the Axios client, the MSW handlers, the
 * fixtures and the tests.
 */

export type EndReason = 'time' | 'death';

/** Gameplay settings a match ran with. Ranking only compares equal configs. */
export interface MatchConfigSnapshot {
  sessionDurationSec: number;
  spawnIntervalSec: number;
}

/** A completed match, as submitted by the client. */
export interface MatchRecordInput {
  /** Client-generated id; doubles as the idempotency key. */
  matchId: string;
  playerId: string;
  playerName: string;
  /** ISO-8601 timestamp of when the match ended. */
  playedAt: string;
  score: number;
  /** Effective (active, unpaused) play time in ms. */
  durationMs: number;
  endReason: EndReason;
  config: MatchConfigSnapshot;
}

export interface MatchRecord extends MatchRecordInput {
  /** Server time the record was first stored. */
  recordedAt: string;
}

export interface RankingEntry {
  rank: number;
  matchId: string;
  playerId: string;
  playerName: string;
  score: number;
  durationMs: number;
  playedAt: string;
}

export interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export interface RankingQuery {
  page: number;
  pageSize: number;
  sessionDurationSec: number;
  spawnIntervalSec: number;
}

export interface HistoryQuery {
  playerId: string;
  page: number;
  pageSize: number;
}

/** `201` on first insert, `200` when the matchId already existed (idempotent replay). */
export interface SubmitMatchResponse {
  record: MatchRecord;
  created: boolean;
}

export interface ApiErrorBody {
  error: string;
  message: string;
}

export function configKey(config: MatchConfigSnapshot): string {
  return `${config.sessionDurationSec}s/${config.spawnIntervalSec}s`;
}
