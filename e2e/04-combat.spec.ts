import { expect, test } from '@playwright/test';
import { advance, holdKeys, huntEnemies, openApp, startMatch, state } from './helpers';

test.describe('4. Front and side cannons, damage, cooldown and score', () => {
  test('front cannon fires one projectile and respects its cooldown @main', async ({ page }) => {
    await openApp(page, { options: { sessionDurationSec: 180, spawnIntervalSec: 10 } });
    await startMatch(page);

    await page.keyboard.down('Space');
    await advance(page, 50);
    let s = await state(page);
    expect(s.projectiles.filter((p) => p.team === 'player')).toHaveLength(1);
    expect(s.player.cooldowns.front).toBeGreaterThan(0);

    // Still holding: no second shot before the cooldown elapses.
    await advance(page, s.config.player.frontCannon.cooldownMs - 100);
    s = await state(page);
    expect(s.projectiles.filter((p) => p.team === 'player')).toHaveLength(1);

    await advance(page, 150);
    s = await state(page);
    expect(s.projectiles.filter((p) => p.team === 'player')).toHaveLength(2);
    await page.keyboard.up('Space');
  });

  test('broadsides fire three parallel projectiles to each side', async ({ page }) => {
    await openApp(page, { options: { sessionDurationSec: 180, spawnIntervalSec: 10 } });
    await startMatch(page);
    const before = await state(page);

    await holdKeys(page, ['KeyQ'], 50);
    let s = await state(page);
    const left = s.projectiles.filter((p) => p.team === 'player');
    expect(left).toHaveLength(s.config.player.sideCannons.count);
    for (const p of left) expect(p.x).toBeLessThan(before.player.x);
    // Parallel: they share the same x offset while spread along the hull.
    expect(new Set(left.map((p) => Math.round(p.x))).size).toBe(1);
    expect(new Set(left.map((p) => Math.round(p.y))).size).toBe(3);

    await holdKeys(page, ['KeyE'], 50);
    s = await state(page);
    const right = s.projectiles.filter((p) => p.team === 'player' && p.x > before.player.x);
    expect(right).toHaveLength(3);

    // Left broadside is on cooldown: pressing again does nothing.
    await holdKeys(page, ['KeyQ'], 50);
    s = await state(page);
    expect(s.projectiles.filter((p) => p.team === 'player' && p.x < before.player.x)).toHaveLength(3);
  });

  test('destroying enemies scores exactly one point each @main', async ({ page }) => {
    await openApp(page, { seed: 3, options: { sessionDurationSec: 120, spawnIntervalSec: 3 } });
    await startMatch(page);

    const s = await huntEnemies(page, 40_000, (st) => st.summary.score >= 2);
    expect(s.summary.score).toBeGreaterThan(0);
    // Score equals kills by the player: no duplicates, rams excluded.
    expect(s.summary.score).toBe(s.summary.kills.chaser + s.summary.kills.shooter);
    await expect(page.getByTestId('hud-score')).toHaveText(String(s.summary.score));
    await expect(page.getByTestId('status-score')).toHaveText(String(s.summary.score));
  });

  test('enemy fire damages the player', async ({ page }) => {
    await openApp(page, { seed: 5, options: { sessionDurationSec: 180, spawnIntervalSec: 1 } });
    await startMatch(page);
    await advance(page, 15_000);
    const s = await state(page);
    expect(s.player.health).toBeLessThan(100);
    await expect(page.getByTestId('status-health')).toContainText(`${Math.ceil(s.player.health)} of 100`);
  });
});
