import { expect, test } from '@playwright/test';
import { openApp } from './helpers';

test.describe('10. Ranking and Match History: queries, pagination and states', () => {
  test('ranking paginates fixture data ordered by score @main', async ({ page }) => {
    await openApp(page);
    const tab = page.getByTestId('ranking-tab');
    await expect(tab.getByTestId('ranking-row')).toHaveCount(10);
    await expect(tab.getByTestId('pager-label')).toHaveText('Page 1 of 4');

    const scores = await tab.locator('[data-testid="ranking-row"] td:nth-child(3)').allTextContents();
    const numbers = scores.map(Number);
    expect([...numbers].sort((a, b) => b - a)).toEqual(numbers);

    await tab.getByTestId('pager-next').click();
    await expect(tab.getByTestId('pager-label')).toHaveText('Page 2 of 4');
    await expect(tab.getByTestId('ranking-row').first().locator('td').first()).toHaveText('11');
    await tab.getByTestId('pager-prev').click();
    await expect(tab.getByTestId('pager-label')).toHaveText('Page 1 of 4');
  });

  test('tabs are keyboard accessible', async ({ page }) => {
    await openApp(page);
    await page.getByTestId('tab-ranking').focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId('tab-history')).toBeFocused();
    await expect(page.getByTestId('tab-history')).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('history-tab')).toBeVisible();
  });

  test('shows loading state on slow responses', async ({ page }) => {
    await openApp(page, { scenario: 'slow', extra: { apiTimeout: '8000' } });
    await expect(page.getByTestId('state-loading')).toBeVisible();
    await expect(page.getByTestId('ranking-row').first()).toBeVisible({ timeout: 8000 });
  });

  test('shows empty states', async ({ page }) => {
    await openApp(page, { scenario: 'empty' });
    await expect(page.getByTestId('ranking-tab').getByTestId('state-empty')).toBeVisible();
    await page.getByTestId('tab-history').click();
    await expect(page.getByTestId('history-tab').getByTestId('state-empty')).toBeVisible();
  });

  test('shows errors with retry and recovers @main', async ({ page }) => {
    await openApp(page, { scenario: 'ranking-error' });
    const error = page.getByTestId('ranking-tab').getByTestId('state-error');
    // Transient 5xx is retried twice before surfacing.
    await expect(error).toBeVisible({ timeout: 15_000 });
    await expect(error.getByRole('alert')).toContainText('Ranking service unavailable');

    // History still works while ranking is down.
    await page.getByTestId('tab-history').click();
    await expect(page.getByTestId('history-tab').getByTestId('state-empty')).toBeVisible();

    await page.getByTestId('network-toggle').click();
    await page.getByTestId('scenario-select').selectOption('success');
    await page.getByTestId('tab-ranking').click();
    await expect(page.getByTestId('ranking-row').first()).toBeVisible();
  });

  test('history error does not block playing', async ({ page }) => {
    await openApp(page, { scenario: 'history-error' });
    await page.getByTestId('tab-history').click();
    await expect(page.getByTestId('history-tab').getByTestId('state-error')).toBeVisible({ timeout: 15_000 });
    await page.getByTestId('play-button').click();
    await expect(page.getByTestId('game-canvas')).toBeAttached();
  });

  test('connection failures and timeouts surface as errors', async ({ page }) => {
    await openApp(page, { scenario: 'network-error' });
    await expect(page.getByTestId('ranking-tab').getByRole('alert')).toContainText('Could not reach the server', {
      timeout: 15_000,
    });
    await page.getByTestId('network-toggle').click();
    await page.getByTestId('scenario-select').selectOption('timeout');
    await page.getByTestId('tab-history').click();
    await expect(page.getByTestId('history-tab').getByRole('alert')).toContainText('took too long', {
      timeout: 20_000,
    });
  });
});
