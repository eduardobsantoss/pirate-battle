import { describe, expect, it } from 'vitest';
import { ARENA, type ArenaDef } from '../arena';
import { createMatchConfig, DEFAULT_CONFIG, type GameConfig } from '../config';
import { Simulation, STEP_MS } from './Simulation';
import { IDLE_CONTROLS, type ShipControls } from './types';

const OPEN_ARENA: ArenaDef = { ...ARENA, islands: [] };

function controls(partial: Partial<ShipControls>): ShipControls {
  return { ...IDLE_CONTROLS, ...partial };
}

function config(patch: (c: GameConfig) => void = () => {}): GameConfig {
  const c = structuredClone(DEFAULT_CONFIG) as GameConfig;
  patch(c);
  return c;
}

function run(sim: Simulation, ms: number, input: Partial<ShipControls> = {}) {
  const steps = Math.round(ms / STEP_MS);
  for (let i = 0; i < steps; i++) sim.step(STEP_MS, controls(input));
}

describe('Simulation', () => {
  it('is deterministic for a given seed', () => {
    const a = new Simulation(createMatchConfig({ sessionDurationSec: 60, spawnIntervalSec: 1 }), ARENA, 42);
    const b = new Simulation(createMatchConfig({ sessionDurationSec: 60, spawnIntervalSec: 1 }), ARENA, 42);
    run(a, 10_000, { forward: true, turnLeft: true, fireFront: true });
    run(b, 10_000, { forward: true, turnLeft: true, fireFront: true });
    expect(a.summary()).toEqual(b.summary());
    expect(a.enemies.map((e) => [e.x, e.y])).toEqual(b.enemies.map((e) => [e.x, e.y]));
  });

  it('moves forward and rotates', () => {
    const sim = new Simulation(config((c) => (c.spawn.initialDelaySec = 999)), OPEN_ARENA, 1);
    const startY = sim.player.y;
    run(sim, 1000, { forward: true });
    expect(sim.player.y).toBeLessThan(startY);
    run(sim, 500, { turnRight: true });
    expect(sim.player.angle).toBeGreaterThan(0);
  });

  it('keeps the player inside the arena', () => {
    const sim = new Simulation(config((c) => (c.spawn.initialDelaySec = 999)), OPEN_ARENA, 1);
    run(sim, 10_000, { forward: true });
    expect(sim.player.y).toBeGreaterThanOrEqual(sim.player.radius);
  });

  it('blocks the player on islands', () => {
    const island = { style: 'sand' as const, col: 9, row: 2, cols: 3, rows: 2 };
    const sim = new Simulation(config((c) => (c.spawn.initialDelaySec = 999)), { ...OPEN_ARENA, islands: [island] }, 1);
    run(sim, 10_000, { forward: true });
    // Island bottom edge is at row 4 (256px) minus the collider inset.
    expect(sim.player.y - sim.player.radius).toBeGreaterThanOrEqual(4 * 64 - 10 - 0.001);
  });

  it('respects weapon cooldowns', () => {
    const sim = new Simulation(config((c) => (c.spawn.initialDelaySec = 999)), OPEN_ARENA, 1);
    run(sim, 1000, { fireFront: true });
    // 450ms cooldown → shots at t≈0, 450, 900.
    const shots = sim.drainEvents().filter((e) => e.type === 'shot');
    expect(shots).toHaveLength(Math.ceil(1000 / DEFAULT_CONFIG.player.frontCannon.cooldownMs));
  });

  it('fires three parallel projectiles per broadside', () => {
    const sim = new Simulation(config((c) => (c.spawn.initialDelaySec = 999)), OPEN_ARENA, 1);
    sim.step(STEP_MS, controls({ fireLeft: true }));
    expect(sim.projectiles).toHaveLength(3);
    for (const p of sim.projectiles) expect(p.vx).toBeLessThan(0);
  });

  it('spawns both enemy types far from the player', () => {
    const sim = new Simulation(createMatchConfig({ sessionDurationSec: 60, spawnIntervalSec: 1 }), ARENA, 7);
    run(sim, 3_000);
    expect(sim.spawned.chaser).toBeGreaterThan(0);
    expect(sim.spawned.shooter).toBeGreaterThan(0);
  });

  it('scores one point per enemy destroyed by the player, none for rams', () => {
    const sim = new Simulation(
      config((c) => {
        c.spawn.initialDelaySec = 0;
        c.spawn.intervalSec = 999;
        c.spawn.openingSequence = ['chaser'];
      }),
      OPEN_ARENA,
      3,
    );
    sim.step(STEP_MS, IDLE_CONTROLS);
    expect(sim.enemies).toHaveLength(1);
    // Let the chaser come to us without shooting it.
    run(sim, 20_000);
    expect(sim.score).toBe(0);
    expect(sim.player.health).toBe(DEFAULT_CONFIG.player.maxHealth - DEFAULT_CONFIG.chaser.contactDamage);
    expect(sim.enemies).toHaveLength(0);
  });

  it('ends on time and freezes the match', () => {
    const sim = new Simulation(
      config((c) => {
        c.sessionDurationSec = 60;
        c.spawn.initialDelaySec = 999;
      }),
      OPEN_ARENA,
      1,
    );
    run(sim, 61_000);
    expect(sim.status).toBe('ended');
    expect(sim.endReason).toBe('time');
    const pose = { x: sim.player.x, y: sim.player.y, score: sim.score };
    run(sim, 1000, { forward: true, fireFront: true });
    expect({ x: sim.player.x, y: sim.player.y, score: sim.score }).toEqual(pose);
    expect(sim.elapsedMs).toBe(60_000);
  });

  it('ends on death', () => {
    const sim = new Simulation(
      config((c) => {
        c.player.maxHealth = 10;
        c.spawn.initialDelaySec = 0;
        c.spawn.openingSequence = ['chaser'];
      }),
      OPEN_ARENA,
      3,
    );
    run(sim, 30_000);
    expect(sim.status).toBe('ended');
    expect(sim.endReason).toBe('death');
  });
});
