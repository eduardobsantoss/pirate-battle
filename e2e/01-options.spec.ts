import { expect, test } from '@playwright/test';
import { openApp, state, startMatch } from './helpers';

test.describe('1. Options: navigation, validation and persistence', () => {
  test('validates, saves and persists options after refresh @main', async ({ page }) => {
    await openApp(page);
    await page.getByTestId('options-button').click();
    await expect(page.getByRole('heading', { name: 'Options' })).toBeVisible();

    const session = page.getByLabel('Game session time (seconds)');
    const spawn = page.getByLabel('Enemy spawn time (seconds)');
    await expect(session).toHaveValue('120');
    await expect(spawn).toHaveValue('3');

    // Out of range / invalid values are rejected with accessible errors.
    await session.fill('200');
    await expect(page.getByTestId('error-sessionDurationSec')).toHaveText('Must be between 60 and 180.');
    await expect(session).toHaveAttribute('aria-invalid', 'true');
    await spawn.fill('0');
    await expect(page.getByTestId('error-spawnIntervalSec')).toHaveText('Must be between 1 and 10.');
    await spawn.fill('');
    await expect(page.getByTestId('error-spawnIntervalSec')).toHaveText('This field is required.');
    await page.getByTestId('options-save').click();
    await expect(session).toBeFocused();
    await expect(page.getByTestId('options-status')).toHaveText('');

    await session.fill('90');
    await spawn.fill('2.5');
    await page.getByTestId('options-save').click();
    await expect(page.getByTestId('options-status')).toHaveText('Options saved.');

    await page.reload();
    await page.getByTestId('options-button').click();
    await expect(page.getByLabel('Game session time (seconds)')).toHaveValue('90');
    await expect(page.getByLabel('Enemy spawn time (seconds)')).toHaveValue('2.5');

    await page.getByTestId('options-back').click();
    await expect(page.getByTestId('main-menu')).toBeVisible();
  });

  test('stepper buttons respect limits and matches use the saved snapshot', async ({ page }) => {
    await openApp(page);
    await page.getByTestId('options-button').click();
    const inc = page.getByRole('button', { name: 'Increase Game session time' });
    for (let i = 0; i < 10; i++) await inc.click();
    await expect(page.getByLabel('Game session time (seconds)')).toHaveValue('180');
    await page.getByTestId('options-save').click();
    await page.getByTestId('options-back').click();

    await startMatch(page);
    const s = await state(page);
    expect(s.summary.durationMs).toBe(180_000);
    expect(s.config.spawn.intervalSec).toBe(3);
  });

  test('menu is keyboard navigable', async ({ page }) => {
    await openApp(page);
    await expect(page.getByTestId('play-button')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByTestId('options-button')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('options-screen')).toBeVisible();
  });
});
