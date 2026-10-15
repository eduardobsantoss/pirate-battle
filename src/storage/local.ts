import { DEFAULT_OPTIONS, sanitizeOptions, type PlayerOptions } from '../game/config';
import type { MatchRecordInput } from '../api/contracts';

/** All keys are namespaced so tests and "reset" can clear them safely. */
export const STORAGE_PREFIX = 'pirate-battle:';

const KEYS = {
  options: `${STORAGE_PREFIX}options`,
  player: `${STORAGE_PREFIX}player`,
  lastResult: `${STORAGE_PREFIX}last-result`,
  pending: `${STORAGE_PREFIX}pending-submissions`,
} as const;

export function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? null : (JSON.parse(raw) as T);
  } catch {
    return null;
  }
}

export function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or blocked (private mode): the game keeps working without persistence.
  }
}

export function removeKey(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

// ------------------------------------------------------------------ options

export function loadOptions(): PlayerOptions {
  return sanitizeOptions(readJson(KEYS.options) ?? DEFAULT_OPTIONS);
}

export function saveOptions(options: PlayerOptions): void {
  writeJson(KEYS.options, sanitizeOptions(options));
}

// ------------------------------------------------------------------- player

export interface PlayerIdentity {
  playerId: string;
  playerName: string;
}

export function newId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

/** Stable local player identity (created on first visit). */
export function loadPlayer(): PlayerIdentity {
  const stored = readJson<PlayerIdentity>(KEYS.player);
  if (stored?.playerId && stored.playerName) return stored;
  const playerId = newId();
  const identity = { playerId, playerName: `Captain ${playerId.slice(0, 4).toUpperCase()}` };
  writeJson(KEYS.player, identity);
  return identity;
}

// -------------------------------------------------------------- last result

export function loadLastResult(): MatchRecordInput | null {
  return readJson<MatchRecordInput>(KEYS.lastResult);
}

export function saveLastResult(result: MatchRecordInput): void {
  writeJson(KEYS.lastResult, result);
}

// ------------------------------------------------------ pending submissions

export function loadPending(): MatchRecordInput[] {
  const list = readJson<MatchRecordInput[]>(KEYS.pending);
  return Array.isArray(list) ? list : [];
}

export function savePending(list: readonly MatchRecordInput[]): void {
  writeJson(KEYS.pending, list);
}
