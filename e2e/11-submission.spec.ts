import { expect, test } from '@playwright/test';
import { finishMatchByDeath, openApp, TEST_PLAYER } from './helpers';

const FAST_DEATH = { sessionDurationSec: 60, spawnIntervalSec: 1 };

test.describe('11. Match registration, tab refresh and pending recovery', () => {
  test('a completed match appears once in history and ranking @main', async ({ page }) => {
    await openApp(page, { seed: 2, options: FAST_DEATH });
    const { score } = await finishMatchByDeath(page);
    await expect(page.getByTestId('result-submission')).toHaveAttribute('data-status', 'confirmed');

    await page.getByTestId('main-menu-button').click();
    const ranking = page.getByTestId('ranking-tab');
    await expect(ranking.locator('tr.is-me')).toHaveCount(1);
    await expect(ranking.locator('tr.is-me td').nth(1)).toContainText(TEST_PLAYER.playerName);
    await expect(ranking.locator('tr.is-me td').nth(2)).toHaveText(String(score));

    await page.getByTestId('tab-history').click();
    await expect(page.getByTestId('history-row')).toHaveCount(1);
    await expect(page.getByTestId('history-row').locator('td').nth(1)).toHaveText(String(score));
    await expect(page.getByTestId('history-row')).toContainText('Ship sunk');
  });

  test('keeps the record pending when the API is down and syncs after refresh', async ({ page }) => {
    await openApp(page, { seed: 2, options: FAST_DEATH, scenario: 'submit-unavailable' });
    await finishMatchByDeath(page);
    await expect(page.getByTestId('result-submission')).toHaveAttribute('data-status', 'failed', { timeout: 15_000 });
    await expect(page.getByTestId('result-retry')).toBeVisible();

    // The player can start another match while the record is pending.
    await page.getByTestId('play-again').click();
    await expect(page.getByTestId('game-canvas')).toBeAttached();
    await page.keyboard.press('KeyP');
    await page.getByTestId('exit-button').click();

    await page.getByTestId('tab-history').click();
    await expect(page.getByTestId('pending-banner')).toContainText('1 completed match is waiting');

    // Service recovers; on refresh the pending record is sent automatically.
    await page.evaluate(() => localStorage.setItem('pirate-battle:mock-scenario', JSON.stringify('success')));
    await page.goto(page.url().replace('scenario=submit-unavailable', 'scenario=success'));
    await page.getByTestId('tab-history').click();
    await expect(page.getByTestId('history-row')).toHaveCount(1);
    await expect(page.getByTestId('pending-banner')).toHaveCount(0);
  });
});
