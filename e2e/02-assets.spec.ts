import { expect, test } from '@playwright/test';
import { openApp, state } from './helpers';

test.describe('2. Asset loading, failure and retry', () => {
  test('shows an error when an asset fails and starts after retry @main', async ({ page }) => {
    // Mock network makes one required texture fail.
    await openApp(page, { extra: { failAssets: 'ships/ship_2' } });
    await page.getByTestId('play-button').click();

    await expect(page.getByTestId('asset-error')).toBeVisible();
    await expect(page.getByTestId('asset-error')).toHaveAttribute('role', 'alert');
    // Combat never started.
    await expect(page.getByTestId('game-canvas')).toHaveCount(0);

    await page.evaluate(() => localStorage.removeItem('pirate-battle:mock-asset-failure'));
    await page.getByTestId('asset-retry').click();
    await expect(page.getByTestId('game-canvas')).toBeAttached();
    await expect.poll(async () => (await state(page)).phase).toBe('running');
  });

  test('shows loading progress while assets download', async ({ page }) => {
    await openApp(page);
    await page.route('**/assets/png/**/tiles/**', async (route) => {
      await new Promise((r) => setTimeout(r, 300));
      await route.continue();
    });
    await page.getByTestId('play-button').click();
    await expect(page.getByTestId('asset-progress')).toBeVisible();
    await expect(page.getByTestId('game-canvas')).toBeAttached({ timeout: 15_000 });
  });
});
