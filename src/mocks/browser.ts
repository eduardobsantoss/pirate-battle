import { setupWorker } from 'msw/browser';
import { handlers } from './handlers';
import { applyScenarioFromUrl } from './scenarios';

/**
 * Starts the mock API in the browser. Runs in development, tests and the
 * published build (the ranking/history backend is intentionally mocked).
 * Failing to start never blocks the game: API calls will just error.
 */
export async function startMockApi(): Promise<void> {
  applyScenarioFromUrl();
  if (!('serviceWorker' in navigator)) {
    console.warn('[msw] Service workers unavailable: ranking and history are offline.');
    return;
  }
  try {
    await setupWorker(...handlers).start({
      serviceWorker: { url: `${import.meta.env.BASE_URL}mockServiceWorker.js` },
      onUnhandledFrame: 'bypass',
      quiet: import.meta.env.PROD,
    });
  } catch (error) {
    console.warn('[msw] Failed to start the mock API.', error);
  }
}
