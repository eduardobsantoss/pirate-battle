import { expect, test } from '@playwright/test';
import { finishMatchByDeath, openApp } from './helpers';

test.describe('8. Result screen and persistence after refresh', () => {
  test('shows score, time, end reason and submission status; survives refresh @main', async ({ page }) => {
    await openApp(page, { seed: 2, options: { sessionDurationSec: 180, spawnIntervalSec: 1 } });
    const { score, elapsedMs } = await finishMatchByDeath(page);

    await expect(page.getByTestId('result-score')).toHaveText(String(score));
    await expect(page.getByTestId('result-reason')).toHaveText('Ship sunk');
    const seconds = (elapsedMs / 1000).toFixed(1);
    await expect(page.getByTestId('result-duration')).toContainText(
      elapsedMs >= 60_000 ? ':' : `${seconds}s`,
    );
    await expect(page.getByTestId('result-submission')).toHaveAttribute('data-status', 'confirmed');
    await expect(page.getByRole('button', { name: 'Play Again' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Main Menu' })).toBeVisible();

    await page.reload();
    await expect(page.getByTestId('result-screen')).toBeVisible();
    await expect(page.getByTestId('result-score')).toHaveText(String(score));
    await expect(page.getByTestId('result-submission')).toHaveAttribute('data-status', 'confirmed');

    await page.getByTestId('main-menu-button').click();
    await expect(page.getByTestId('last-result')).toContainText(`${score} pts`);
    await page.reload();
    await expect(page.getByTestId('last-result')).toContainText(`${score} pts`);
  });
});
