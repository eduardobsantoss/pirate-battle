import { expect, test } from '@playwright/test';
import { advance, openApp, startMatch, state } from './helpers';

test.describe('7. Pause, focus loss and resume', () => {
  test('manual pause suspends timer, cooldowns and simulation @main', async ({ page }) => {
    await openApp(page, { options: { sessionDurationSec: 120, spawnIntervalSec: 2 } });
    await startMatch(page);
    await page.keyboard.down('Space');
    await advance(page, 2000);
    await page.keyboard.up('Space');
    const before = await state(page);

    await page.keyboard.press('KeyP');
    await expect(page.getByTestId('pause-dialog')).toBeVisible();
    await expect(page.getByTestId('resume-button')).toBeFocused();
    await expect(page.getByTestId('status-phase')).toHaveText('paused');

    // Neither the clock nor held keys affect a paused match.
    await page.keyboard.down('KeyW');
    await advance(page, 5000);
    await page.keyboard.up('KeyW');
    const paused = await state(page);
    expect(paused.remainingMs).toBe(before.remainingMs);
    expect(paused.player).toEqual(before.player);
    expect(paused.enemies).toEqual(before.enemies);

    await page.getByTestId('resume-button').click();
    await expect(page.getByTestId('pause-dialog')).toBeHidden();
    await advance(page, 100);
    const resumed = await state(page);
    expect(resumed.phase).toBe('running');
    // No movement accumulated from keys pressed during the pause.
    expect(resumed.player.speed).toBe(0);
    expect(before.remainingMs - resumed.remainingMs).toBeCloseTo(100, -1);
  });

  test('pauses automatically when the window loses focus and needs an explicit resume', async ({ page }) => {
    await openApp(page);
    await startMatch(page);
    await advance(page, 1000);
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await expect(page.getByTestId('pause-dialog')).toBeVisible();
    await expect(page.getByTestId('pause-dialog')).toContainText('lost focus');
    const s = await state(page);
    expect(s.snapshot.pauseReason).toBe('blur');

    // Focus coming back does not resume by itself.
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await advance(page, 1000);
    expect((await state(page)).remainingMs).toBe(s.remainingMs);

    await page.keyboard.press('Escape');
    await expect(page.getByTestId('pause-dialog')).toBeHidden();
    expect((await state(page)).phase).toBe('running');
  });

  test('real-time clock does not advance while paused', async ({ page }) => {
    await openApp(page, { manualClock: false });
    await startMatch(page);
    await page.waitForTimeout(500);
    await page.getByTestId('pause-button').click();
    await expect(page.getByTestId('pause-dialog')).toBeVisible();
    const paused = await state(page);
    await page.waitForTimeout(1500);
    expect((await state(page)).remainingMs).toBe(paused.remainingMs);
    await page.getByTestId('resume-button').click();
    await page.waitForTimeout(500);
    const resumed = await state(page);
    const elapsed = paused.remainingMs - resumed.remainingMs;
    expect(elapsed).toBeGreaterThan(200);
    expect(elapsed).toBeLessThan(1200);
  });
});
