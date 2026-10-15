import { expect, test } from '@playwright/test';
import { advance, gameState, openApp, startMatch, state, trackConsoleErrors } from './helpers';

test.describe('9. Abandoning, repeated navigation and touch controls', () => {
  test('leaving a match abandons it without recording anything', async ({ page }) => {
    await openApp(page);
    await startMatch(page);
    await advance(page, 5000);
    await page.getByTestId('pause-button').click();
    await page.getByTestId('exit-button').click();
    await expect(page.getByTestId('main-menu')).toBeVisible();
    expect(await gameState(page)).toBeNull();

    // Reloading mid-match also abandons it.
    await startMatch(page);
    await advance(page, 3000);
    await page.reload();
    await expect(page.getByTestId('main-menu')).toBeVisible();

    const storage = await page.evaluate(() => ({
      pending: localStorage.getItem('pirate-battle:pending-submissions'),
      last: localStorage.getItem('pirate-battle:last-result'),
    }));
    expect(storage.last).toBeNull();
    expect(JSON.parse(storage.pending ?? '[]')).toHaveLength(0);

    await page.getByTestId('tab-history').click();
    await expect(page.getByTestId('state-empty')).toBeVisible();
  });

  test('repeated navigation between screens leaves a single clean game @main', async ({ page }) => {
    const errors = trackConsoleErrors(page);
    await openApp(page);
    for (let i = 0; i < 4; i++) {
      await startMatch(page);
      await advance(page, 1000);
      await page.keyboard.press('Escape');
      await page.getByTestId('restart-button').click();
      await expect.poll(async () => (await state(page)).remainingMs).toBe(120_000);
      await page.keyboard.press('KeyP');
      await page.getByTestId('exit-button').click();
      await page.getByTestId('options-button').click();
      await page.getByTestId('options-back').click();
    }
    await startMatch(page);
    await expect(page.locator('canvas')).toHaveCount(1);
    expect(errors).toEqual([]);
  });

  test('touch controls move, turn and fire @main', async ({ page }) => {
    await openApp(page, { options: { sessionDurationSec: 120, spawnIntervalSec: 10 } });
    await startMatch(page);
    const start = await state(page);

    const press = async (id: string, ms: number) => {
      const box = (await page.getByTestId(id).boundingBox())!;
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await advance(page, ms);
      await page.mouse.up();
    };

    await press('touch-forward', 1000);
    let s = await state(page);
    expect(s.player.y).toBeLessThan(start.player.y - 40);

    await press('touch-turnRight', 400);
    s = await state(page);
    expect(s.player.angle).toBeGreaterThan(0.3);

    await press('touch-fireFront', 50);
    s = await state(page);
    expect(s.projectiles.some((p) => p.team === 'player')).toBe(true);
  });
});
