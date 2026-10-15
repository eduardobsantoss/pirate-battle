import type { GameController } from '../game/GameController';
import { randomSeed } from '../game/rng';

/**
 * Test / profiling instrumentation, enabled with URL params so it also works
 * against the production build:
 *
 *   ?e2e=1            expose `window.__pirate` (state inspection + clock)
 *   &seed=123         deterministic match seed
 *   &clock=manual     simulation only advances through `__pirate.advance(ms)`
 *
 * It only observes state and drives the clock; rules, input, collisions and
 * rendering run exactly as in normal play.
 */
const params = new URLSearchParams(globalThis.location?.search ?? '');

export const testMode = {
  enabled: params.get('e2e') === '1',
  seed: params.has('seed') ? Number(params.get('seed')) >>> 0 : null,
  manualClock: params.get('clock') === 'manual',
};

export function matchSeed(): number {
  return testMode.seed ?? randomSeed();
}

export interface PirateTestApi {
  controller: GameController | null;
  state(): unknown;
  advance(ms: number): void;
}

declare global {
  interface Window {
    __pirate?: PirateTestApi;
  }
}

export function exposeController(controller: GameController | null): void {
  if (!testMode.enabled) return;
  window.__pirate = {
    controller,
    advance: (ms) => controller?.advance(ms),
    state: () => {
      if (!controller) return null;
      const sim = controller.sim;
      const ship = (s: typeof sim.player) => ({
        id: s.id,
        kind: s.kind,
        x: s.x,
        y: s.y,
        angle: s.angle,
        speed: s.speed,
        health: s.health,
        radius: s.radius,
        cooldowns: { ...s.cooldowns },
      });
      return {
        phase: controller.phase,
        snapshot: controller.store.get(),
        summary: sim.summary(),
        remainingMs: sim.remainingMs,
        player: ship(sim.player),
        enemies: sim.enemies.map(ship),
        projectiles: sim.projectiles.map((p) => ({ team: p.team, x: p.x, y: p.y })),
        arena: { width: sim.arena.width, height: sim.arena.height, colliders: sim.obstacles.colliders },
        config: sim.config,
        render: controller.renderStats(),
      };
    },
  };
}
