import type { MatchRecord } from '../api/contracts';
import { DEFAULT_OPTIONS } from '../game/config';
import { createRng } from '../game/rng';

const CAPTAINS = [
  'Anne Bonny',
  'Blackbeard',
  'Calico Jack',
  'Mary Read',
  "Grace O'Malley",
  'Henry Morgan',
  'Black Bart',
  'Ching Shih',
  'William Kidd',
  'Stede Bonnet',
  'Charles Vane',
  'Jean Lafitte',
  'Sadie the Goat',
  'Francis Drake',
];

const CONFIGS = [
  { sessionDurationSec: DEFAULT_OPTIONS.sessionDurationSec, spawnIntervalSec: DEFAULT_OPTIONS.spawnIntervalSec, count: 34 },
  { sessionDurationSec: 60, spawnIntervalSec: 2, count: 12 },
  { sessionDurationSec: 180, spawnIntervalSec: 3, count: 8 },
];

/** Fixed epoch so fixtures (and visual baselines) never change between runs. */
const FIXTURE_EPOCH = Date.UTC(2026, 9, 1, 12, 0, 0);

/**
 * Deterministic records from "other players". Shared by the MSW handlers in
 * development, the published demo and the Playwright tests.
 */
export function buildFixtures(): MatchRecord[] {
  const rng = createRng(20261013);
  const records: MatchRecord[] = [];
  let n = 0;
  for (const cfg of CONFIGS) {
    for (let i = 0; i < cfg.count; i++) {
      n += 1;
      const captain = CAPTAINS[Math.floor(rng.next() * CAPTAINS.length)]!;
      const died = rng.next() < 0.35;
      const durationMs = died
        ? Math.round(rng.range(0.3, 0.95) * cfg.sessionDurationSec * 1000)
        : cfg.sessionDurationSec * 1000;
      const maxScore = Math.round((durationMs / 1000 / cfg.spawnIntervalSec) * 0.8);
      const playedAt = new Date(FIXTURE_EPOCH - n * 3_600_000 * 7).toISOString();
      records.push({
        matchId: `fixture-${String(n).padStart(3, '0')}`,
        playerId: `fixture-${captain.toLowerCase().replace(/[^a-z]+/g, '-')}`,
        playerName: captain,
        playedAt,
        recordedAt: playedAt,
        score: Math.floor(rng.range(0, maxScore)),
        durationMs,
        endReason: died ? 'death' : 'time',
        config: { sessionDurationSec: cfg.sessionDurationSec, spawnIntervalSec: cfg.spawnIntervalSec },
      });
    }
  }
  return records;
}
