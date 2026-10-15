import { expect, test } from '@playwright/test';
import { advance, holdKeys, openApp, startMatch, state } from './helpers';

// Spawns pushed out so movement tests aren't disturbed by enemies.
const QUIET = { sessionDurationSec: 180, spawnIntervalSec: 10 };

test.describe('3. Movement, rotation, arena limits and island collisions', () => {
  test('moves forward and rotates both ways @main', async ({ page }) => {
    await openApp(page, { options: QUIET });
    await startMatch(page);
    const start = await state(page);

    await holdKeys(page, ['KeyW'], 1000);
    const moved = await state(page);
    expect(moved.player.y).toBeLessThan(start.player.y - 50);
    expect(Math.abs(moved.player.x - start.player.x)).toBeLessThan(1);

    await holdKeys(page, ['KeyD'], 500);
    const right = await state(page);
    expect(right.player.angle).toBeGreaterThan(0.5);

    await holdKeys(page, ['ArrowLeft'], 1000);
    const left = await state(page);
    expect(left.player.angle).toBeLessThan(right.player.angle - 1);
  });

  test('can move and turn at the same time', async ({ page }) => {
    await openApp(page, { options: QUIET });
    await startMatch(page);
    const start = await state(page);
    await holdKeys(page, ['KeyW', 'KeyD', 'Space'], 800);
    const s = await state(page);
    expect(s.player.angle).toBeGreaterThan(0.5);
    expect(s.player.y).toBeLessThan(start.player.y);
    expect(s.projectiles.filter((p) => p.team === 'player').length).toBeGreaterThan(0);
  });

  test('stays inside the visible arena', async ({ page }) => {
    await openApp(page, { options: QUIET });
    await startMatch(page);
    // Turn left 90° and sail into the left wall for a long time.
    await holdKeys(page, ['KeyA'], Math.round((Math.PI / 2 / 2.4) * 1000));
    await holdKeys(page, ['KeyW'], 8000);
    const s = await state(page);
    expect(s.player.x).toBeGreaterThanOrEqual(s.player.radius - 0.01);
    expect(s.player.x).toBeLessThan(s.player.radius + 2);
  });

  test('cannot sail through islands', async ({ page }) => {
    await openApp(page, { options: QUIET });
    await startMatch(page);
    // The small island south of the spawn point: turn around and sail into it.
    await holdKeys(page, ['KeyD'], Math.round((Math.PI / 2.4) * 1000));
    for (let i = 0; i < 12; i++) {
      await holdKeys(page, ['KeyW'], 500);
      const s = await state(page);
      for (const c of s.arena.colliders) {
        const nx = Math.max(c.x, Math.min(s.player.x, c.x + c.width));
        const ny = Math.max(c.y, Math.min(s.player.y, c.y + c.height));
        expect(Math.hypot(s.player.x - nx, s.player.y - ny)).toBeGreaterThanOrEqual(s.player.radius - 0.5);
      }
    }
    const end = await state(page);
    // Blocked by the island top edge instead of reaching the arena bottom.
    expect(end.player.y).toBeLessThan(end.arena.height - 100);
    await advance(page, 100);
  });
});
