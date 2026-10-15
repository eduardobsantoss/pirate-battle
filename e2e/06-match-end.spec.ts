import { expect, test } from '@playwright/test';
import { advance, holdKeys, huntEnemies, openApp, startMatch, state } from './helpers';

test.describe('6. Match end by time and by death, freeze and clean restart', () => {
  test('ends when time runs out and freezes the simulation @main', async ({ page }) => {
    await openApp(page, { seed: 11, options: { sessionDurationSec: 60, spawnIntervalSec: 10 } });
    await startMatch(page);
    // Fight back until the clock runs out.
    await huntEnemies(page, 61_000);
    const s = await state(page);
    expect(s.phase).toBe('ended');
    expect(s.summary.endReason).toBe('time');
    expect(s.summary.elapsedMs).toBe(60_000);

    const frozen = await state(page);
    await holdKeys(page, ['KeyW', 'Space'], 2000);
    const after = await state(page);
    expect(after.player).toEqual(frozen.player);
    expect(after.summary.score).toBe(frozen.summary.score);
    expect(after.enemies.length).toBe(frozen.enemies.length);
    expect(after.projectiles).toHaveLength(0);

    await expect(page.getByTestId('result-screen')).toBeVisible();
    await expect(page.getByTestId('result-reason')).toHaveText('Time up');
  });

  test('ends when the player dies', async ({ page }) => {
    await openApp(page, { seed: 2, options: { sessionDurationSec: 180, spawnIntervalSec: 1 } });
    await startMatch(page);
    for (let i = 0; i < 60; i++) {
      await advance(page, 2000);
      if ((await state(page)).phase === 'ended') break;
    }
    const s = await state(page);
    expect(s.summary.endReason).toBe('death');
    expect(s.player.health).toBe(0);
    expect(s.summary.elapsedMs).toBeLessThan(180_000);
    await expect(page.getByTestId('result-screen')).toBeVisible();
    await expect(page.getByTestId('result-reason')).toHaveText('Ship sunk');
  });

  test('play again starts a clean match', async ({ page }) => {
    await openApp(page, { seed: 2, options: { sessionDurationSec: 60, spawnIntervalSec: 1 } });
    await startMatch(page);
    for (let i = 0; i < 40; i++) {
      await holdKeys(page, ['Space', 'KeyD'], 1500);
      if ((await state(page)).phase === 'ended') break;
    }
    await expect(page.getByTestId('result-screen')).toBeVisible();
    await page.getByTestId('play-again').click();
    await expect.poll(async () => (await state(page)).phase).toBe('running');
    const s = await state(page);
    expect(s.summary.score).toBe(0);
    expect(s.player.health).toBe(100);
    expect(s.remainingMs).toBe(60_000);
    expect(s.enemies).toHaveLength(0);
    expect(s.projectiles).toHaveLength(0);
    expect(s.render?.ships).toBe(1);
    await expect(page.getByTestId('hud-time')).toHaveText('01:00');
  });
});
