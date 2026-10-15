import { expect, test } from '@playwright/test';
import { advance, openApp, startMatch } from './helpers';

test.describe('Visual regression @main', () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
  });

  test('main menu', async ({ page }) => {
    await openApp(page);
    await expect(page.getByTestId('ranking-row').first()).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await expect(page).toHaveScreenshot('menu.png', { fullPage: true });
  });

  test('arena in a stable state', async ({ page }) => {
    await openApp(page, { seed: 42 });
    await startMatch(page);
    await advance(page, 2500);
    await page.evaluate(() => document.fonts.ready);
    await expect(page).toHaveScreenshot('arena.png');
  });

  test('result screen', async ({ page }) => {
    await openApp(page);
    // Inject a fixed last result so the screen is fully deterministic.
    await page.evaluate(() => {
      const record = {
        matchId: 'visual-match',
        playerId: 'e2e-player',
        playerName: 'Captain E2E',
        playedAt: '2026-10-14T12:00:00.000Z',
        score: 7,
        durationMs: 120000,
        endReason: 'time',
        config: { sessionDurationSec: 120, spawnIntervalSec: 3 },
      };
      localStorage.setItem('pirate-battle:last-result', JSON.stringify(record));
      localStorage.setItem('pirate-battle:confirmed-submissions', JSON.stringify(['visual-match']));
      sessionStorage.setItem('pirate-battle:showing-result', 'visual-match');
    });
    await page.reload();
    await expect(page.getByTestId('result-screen')).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await expect(page).toHaveScreenshot('result.png');
  });
});
