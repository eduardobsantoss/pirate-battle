import { expect, test } from '@playwright/test';
import { advance, distance, openApp, startMatch, state } from './helpers';

test.describe('5. Chaser and Shooter behaviours, spawn interval', () => {
  test('spawns both enemy types on the configured interval, far from the player @main', async ({ page }) => {
    await openApp(page, { options: { sessionDurationSec: 120, spawnIntervalSec: 2 } });
    await startMatch(page);
    const s0 = await state(page);
    const first = s0.config.spawn.initialDelaySec * 1000;

    await advance(page, first + 50);
    let s = await state(page);
    expect(s.summary.spawned.chaser + s.summary.spawned.shooter).toBe(1);
    for (const e of s.enemies) {
      expect(distance(e, s.player)).toBeGreaterThanOrEqual(s.config.spawn.minDistanceFromPlayer * 0.5);
    }

    await advance(page, 2000);
    s = await state(page);
    expect(s.summary.spawned.chaser).toBeGreaterThanOrEqual(1);
    expect(s.summary.spawned.shooter).toBeGreaterThanOrEqual(1);
    expect(s.summary.spawned.chaser + s.summary.spawned.shooter).toBe(2);

    await advance(page, 2000);
    s = await state(page);
    expect(s.summary.spawned.chaser + s.summary.spawned.shooter).toBe(3);
  });

  test('chaser pursues and explodes on the player without scoring', async ({ page }) => {
    await openApp(page, { options: { sessionDurationSec: 120, spawnIntervalSec: 10 } });
    await startMatch(page);
    await advance(page, 1600);
    let s = await state(page);
    const chaser = s.enemies.find((e) => e.kind === 'chaser');
    expect(chaser).toBeDefined();
    const d0 = distance(chaser!, s.player);

    await advance(page, 1000);
    s = await state(page);
    const later = s.enemies.find((e) => e.id === chaser!.id);
    expect(later).toBeDefined();
    expect(distance(later!, s.player)).toBeLessThan(d0);

    for (let i = 0; i < 20 && s.enemies.some((e) => e.id === chaser!.id); i++) {
      await advance(page, 500);
      s = await state(page);
    }
    expect(s.enemies.some((e) => e.id === chaser!.id)).toBe(false);
    expect(s.player.health).toBeLessThan(100);
    expect(s.summary.score).toBe(0);
  });

  test('shooter approaches and fires when in range', async ({ page }) => {
    await openApp(page, { options: { sessionDurationSec: 120, spawnIntervalSec: 2 } });
    await startMatch(page);
    // Second spawn is a Shooter (opening sequence).
    await advance(page, 3600);
    let s = await state(page);
    const shooter = s.enemies.find((e) => e.kind === 'shooter');
    expect(shooter).toBeDefined();

    let fired = false;
    for (let i = 0; i < 30 && !fired; i++) {
      await advance(page, 250);
      s = await state(page);
      const sh = s.enemies.find((e) => e.id === shooter!.id);
      if (!sh) break;
      if (s.projectiles.some((p) => p.team === 'enemy')) {
        fired = true;
        expect(distance(sh, s.player)).toBeLessThanOrEqual(s.config.shooter.attackRange + 5);
      }
    }
    expect(fired).toBe(true);
  });
});
