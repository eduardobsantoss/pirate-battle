import { expect, type Page } from '@playwright/test';

export const TEST_PLAYER = { playerId: 'e2e-player', playerName: 'Captain E2E' };

export interface ShipState {
  id: number;
  kind: string;
  x: number;
  y: number;
  angle: number;
  speed: number;
  health: number;
  radius: number;
  cooldowns: { front: number; left: number; right: number };
}

export interface GameState {
  phase: string;
  snapshot: { phase: string; pauseReason: string | null; score: number; health: number; remainingSec: number };
  summary: {
    status: string;
    endReason: string | null;
    score: number;
    elapsedMs: number;
    durationMs: number;
    kills: { chaser: number; shooter: number };
    spawned: { chaser: number; shooter: number };
  };
  remainingMs: number;
  player: ShipState;
  enemies: ShipState[];
  projectiles: { team: string; x: number; y: number }[];
  arena: { width: number; height: number; colliders: { x: number; y: number; width: number; height: number }[] };
  config: {
    spawn: { intervalSec: number; minDistanceFromPlayer: number; initialDelaySec: number };
    player: { frontCannon: { cooldownMs: number }; sideCannons: { cooldownMs: number; count: number } };
    shooter: { attackRange: number };
  };
  render: { ships: number; projectiles: number } | null;
}

interface OpenOptions {
  seed?: number;
  manualClock?: boolean;
  scenario?: string;
  extra?: Record<string, string>;
  options?: { sessionDurationSec: number; spawnIntervalSec: number };
}

/**
 * Opens the app with test instrumentation: deterministic seed, controllable
 * simulation clock, zero mock latency and a short API timeout. Each test runs
 * in a fresh browser context, so localStorage starts empty.
 */
export async function openApp(page: Page, opts: OpenOptions = {}): Promise<void> {
  const params = new URLSearchParams({
    e2e: '1',
    seed: String(opts.seed ?? 1),
    latency: '0',
    apiTimeout: '1000',
    ...(opts.manualClock === false ? {} : { clock: 'manual' }),
    ...(opts.scenario ? { scenario: opts.scenario } : {}),
    ...opts.extra,
  });
  await page.addInitScript(
    ({ player, options }) => {
      if (!localStorage.getItem('pirate-battle:player')) {
        localStorage.setItem('pirate-battle:player', JSON.stringify(player));
      }
      if (options && !localStorage.getItem('pirate-battle:options')) {
        localStorage.setItem('pirate-battle:options', JSON.stringify(options));
      }
    },
    { player: TEST_PLAYER, options: opts.options ?? null },
  );
  await page.goto(`/?${params.toString()}`);
  await expect(page.getByTestId('main-menu').or(page.getByTestId('result-screen'))).toBeVisible();
}

export async function startMatch(page: Page): Promise<void> {
  await page.getByTestId('play-button').or(page.getByTestId('play-again')).first().click();
  await expect(page.getByTestId('game-canvas')).toBeAttached();
  await expect.poll(() => gameState(page).then((s) => s?.phase)).toBe('running');
}

export function gameState(page: Page): Promise<GameState | null> {
  return page.evaluate(() => (window.__pirate?.state() ?? null) as never);
}

export async function state(page: Page): Promise<GameState> {
  const s = await gameState(page);
  if (!s) throw new Error('Game is not running');
  return s;
}

/** Advances the simulation clock (manual clock mode) through the real game loop. */
export async function advance(page: Page, ms: number): Promise<void> {
  await page.evaluate((m) => window.__pirate?.advance(m), ms);
}

/** Holds keyboard keys while advancing the simulation. */
export async function holdKeys(page: Page, keys: string[], ms: number): Promise<void> {
  for (const k of keys) await page.keyboard.down(k);
  await advance(page, ms);
  for (const k of keys) await page.keyboard.up(k);
}

export function distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Collects uncaught errors and console errors so tests can assert a clean console. */
export function trackConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  return errors;
}

/**
 * Simple test "bot": turns towards the nearest enemy with the real turn keys
 * and fires the front cannon. Runs for `ms` of simulation time.
 */
export async function huntEnemies(page: Page, ms: number, stopWhen?: (s: GameState) => boolean): Promise<GameState> {
  const slice = 150;
  let s = await state(page);
  await page.keyboard.down('Space');
  for (let t = 0; t < ms && s.phase === 'running'; t += slice) {
    const target = [...s.enemies].sort((a, b) => distance(a, s.player) - distance(b, s.player))[0];
    let key: string | null = null;
    if (target) {
      const desired = Math.atan2(target.x - s.player.x, -(target.y - s.player.y));
      let diff = desired - s.player.angle;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      if (Math.abs(diff) > 0.08) key = diff > 0 ? 'KeyD' : 'KeyA';
    }
    if (key) await page.keyboard.down(key);
    await advance(page, slice);
    if (key) await page.keyboard.up(key);
    s = await state(page);
    if (stopWhen?.(s)) break;
  }
  await page.keyboard.up('Space');
  return s;
}

/** Plays until the player's ship is sunk (use a short spawn interval). */
export async function finishMatchByDeath(page: Page): Promise<{ score: number; elapsedMs: number }> {
  await startMatch(page);
  for (let i = 0; i < 90; i++) {
    await advance(page, 2000);
    if ((await state(page)).phase === 'ended') break;
  }
  const s = await state(page);
  expect(s.phase).toBe('ended');
  await expect(page.getByTestId('result-screen')).toBeVisible();
  return { score: s.summary.score, elapsedMs: s.summary.elapsedMs };
}

declare global {
  interface Window {
    __pirate?: { state(): unknown; advance(ms: number): void };
  }
}
