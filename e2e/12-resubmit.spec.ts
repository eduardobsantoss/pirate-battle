import { expect, test } from '@playwright/test';
import { finishMatchByDeath, openApp } from './helpers';

test.describe('12. Resubmission after timeout and out-of-order responses', () => {
  test('retrying after a timeout recovers the stored record without duplicates', async ({ page }) => {
    await openApp(page, { seed: 2, options: { sessionDurationSec: 60, spawnIntervalSec: 1 }, scenario: 'submit-timeout' });
    await finishMatchByDeath(page);
    await expect(page.getByTestId('result-submission')).toHaveAttribute('data-status', 'failed', { timeout: 20_000 });

    await page.getByTestId('network-toggle').click();
    await page.getByTestId('scenario-select').selectOption('success');
    // Repeated clicks are ignored while the first retry is in flight.
    await page.getByTestId('result-retry').dblclick();
    await expect(page.getByTestId('result-submission')).toHaveAttribute('data-status', 'confirmed');

    const copies = await page.evaluate(() => {
      const db = JSON.parse(localStorage.getItem('pirate-battle:mock-db') ?? '[]') as { matchId: string }[];
      const last = JSON.parse(localStorage.getItem('pirate-battle:last-result') ?? '{}') as { matchId: string };
      return db.filter((r) => r.matchId === last.matchId).length;
    });
    expect(copies).toBe(1);

    await page.getByTestId('main-menu-button').click();
    await page.getByTestId('tab-history').click();
    await expect(page.getByTestId('history-row')).toHaveCount(1);
  });

  test('late responses never overwrite newer data', async ({ page }) => {
    await openApp(page, { scenario: 'out-of-order', extra: { apiTimeout: '8000' } });
    const tab = page.getByTestId('ranking-tab');
    await expect(tab.getByTestId('ranking-row').first()).toBeVisible({ timeout: 8000 });

    // Page 2 request is slow, page 3 request is fast: page 3 must stay displayed.
    await tab.getByTestId('pager-next').click();
    await tab.getByTestId('pager-next').click({ timeout: 8000 });
    await expect(tab.getByTestId('pager-label')).toHaveText('Page 3 of 4', { timeout: 8000 });
    await page.waitForTimeout(3000);
    await expect(tab.getByTestId('pager-label')).toHaveText('Page 3 of 4');
    await expect(tab.getByTestId('ranking-row').first().locator('td').first()).toHaveText('21');
  });
});
