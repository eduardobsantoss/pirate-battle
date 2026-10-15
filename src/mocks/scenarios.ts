import { readJson, STORAGE_PREFIX, writeJson } from '../storage/local';

/**
 * Reproducible network conditions for the mocked ranking / history APIs.
 * Selected from the in-app "Mock network" panel or the `?scenario=` URL
 * param, persisted in localStorage so they survive a refresh.
 */
export const SCENARIOS = {
  success: 'Success (default)',
  empty: 'Empty lists',
  slow: 'Slow (2.5s latency)',
  'variable-latency': 'Variable latency (0.2–3s)',
  'out-of-order': 'Out-of-order responses',
  timeout: 'Timeout on every request',
  'network-error': 'Connection failure',
  'server-error': 'HTTP 500 on every request',
  'bad-request': 'HTTP 400 on every request',
  'ranking-error': 'Ranking fails (HTTP 503)',
  'history-error': 'Match history fails (HTTP 503)',
  'submit-timeout': 'Submit times out after saving',
  'submit-unavailable': 'Submit unavailable (HTTP 503)',
} as const;

export type ScenarioId = keyof typeof SCENARIOS;

const SCENARIO_KEY = `${STORAGE_PREFIX}mock-scenario`;

export function isScenario(value: unknown): value is ScenarioId {
  return typeof value === 'string' && value in SCENARIOS;
}

export function getScenario(): ScenarioId {
  const stored = readJson<string>(SCENARIO_KEY);
  return isScenario(stored) ? stored : 'success';
}

export function setScenario(id: ScenarioId): void {
  writeJson(SCENARIO_KEY, id);
}

/** Applies `?scenario=` once at startup (handy for demos and tests). */
export function applyScenarioFromUrl(): void {
  const fromUrl = new URLSearchParams(location.search).get('scenario');
  if (isScenario(fromUrl)) setScenario(fromUrl);
}

/**
 * Latency in tests is controlled with `?latency=<ms>` (fixed) so suites are
 * deterministic; otherwise a small realistic delay is used.
 */
export function baseLatencyMs(): number {
  const fixed = new URLSearchParams(location.search).get('latency');
  return fixed !== null && Number.isFinite(Number(fixed)) ? Number(fixed) : 250;
}
