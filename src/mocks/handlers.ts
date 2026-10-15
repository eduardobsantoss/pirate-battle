import { delay, http, HttpResponse, passthrough } from 'msw';
import type { ApiErrorBody, MatchRecordInput } from '../api/contracts';
import { createRng } from '../game/rng';
import { insertMatch, queryHistory, queryRanking } from './db';
import { baseLatencyMs, getAssetFailure, getScenario } from './scenarios';

/** Longer than any client timeout: the request "hangs". */
const HANG_MS = 120_000;
const MAX_PAGE_SIZE = 50;

// Seeded so "variable latency" / "out-of-order" runs are reproducible.
const rng = createRng(1337);
let outOfOrderCounter = 0;

function error(status: number, code: string, message: string) {
  return HttpResponse.json<ApiErrorBody>({ error: code, message }, { status });
}

/**
 * Applies the active scenario. Returns a response to short-circuit the
 * handler, or null to continue with the normal (successful) behaviour.
 */
async function applyScenario(kind: 'ranking' | 'history' | 'submit') {
  const scenario = getScenario();
  const latency = baseLatencyMs();

  switch (scenario) {
    case 'slow':
      await delay(Math.max(latency, 2500));
      return null;
    case 'variable-latency':
      await delay(Math.round(rng.range(200, 3000)));
      return null;
    case 'out-of-order': {
      // Alternate long/short delays so an earlier request resolves after a later one.
      outOfOrderCounter += 1;
      await delay(outOfOrderCounter % 2 === 1 ? 2500 : 200);
      return null;
    }
    case 'timeout':
      await delay(HANG_MS);
      return null;
    case 'network-error':
      await delay(latency);
      return HttpResponse.error();
    case 'server-error':
      await delay(latency);
      return error(500, 'internal_error', 'The server crashed while handling the request.');
    case 'bad-request':
      await delay(latency);
      return error(400, 'bad_request', 'The request was rejected by the server.');
    case 'ranking-error':
      await delay(latency);
      return kind === 'ranking' ? error(503, 'unavailable', 'Ranking service unavailable.') : null;
    case 'history-error':
      await delay(latency);
      return kind === 'history' ? error(503, 'unavailable', 'Match history service unavailable.') : null;
    case 'submit-unavailable':
      await delay(latency);
      return kind === 'submit' ? error(503, 'unavailable', 'Match service unavailable.') : null;
    default:
      await delay(latency);
      return null;
  }
}

function intParam(url: URL, name: string, fallback: number, min: number, max: number): number | null {
  const raw = url.searchParams.get(name);
  if (raw === null) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) return null;
  return value;
}

function isValidInput(body: unknown): body is MatchRecordInput {
  if (typeof body !== 'object' || body === null) return false;
  const b = body as Record<string, unknown>;
  const config = b.config as Record<string, unknown> | undefined;
  return (
    typeof b.matchId === 'string' &&
    b.matchId.length > 0 &&
    typeof b.playerId === 'string' &&
    typeof b.playerName === 'string' &&
    typeof b.playedAt === 'string' &&
    Number.isInteger(b.score) &&
    (b.score as number) >= 0 &&
    typeof b.durationMs === 'number' &&
    (b.endReason === 'time' || b.endReason === 'death') &&
    typeof config?.sessionDurationSec === 'number' &&
    typeof config?.spawnIntervalSec === 'number'
  );
}

export const handlers = [
  http.get('*/api/ranking', async ({ request }) => {
    const short = await applyScenario('ranking');
    if (short) return short;
    const url = new URL(request.url);
    const page = intParam(url, 'page', 1, 1, 10_000);
    const pageSize = intParam(url, 'pageSize', 10, 1, MAX_PAGE_SIZE);
    const sessionDurationSec = Number(url.searchParams.get('sessionDurationSec'));
    const spawnIntervalSec = Number(url.searchParams.get('spawnIntervalSec'));
    if (page === null || pageSize === null || !sessionDurationSec || !spawnIntervalSec) {
      return error(400, 'invalid_query', 'page, pageSize and the match configuration are required.');
    }
    if (getScenario() === 'empty') {
      return HttpResponse.json({ items: [], page, pageSize, totalItems: 0, totalPages: 1 });
    }
    return HttpResponse.json(queryRanking({ page, pageSize, sessionDurationSec, spawnIntervalSec }));
  }),

  http.get('*/api/players/:playerId/matches', async ({ request, params }) => {
    const short = await applyScenario('history');
    if (short) return short;
    const url = new URL(request.url);
    const page = intParam(url, 'page', 1, 1, 10_000);
    const pageSize = intParam(url, 'pageSize', 10, 1, MAX_PAGE_SIZE);
    if (page === null || pageSize === null) return error(400, 'invalid_query', 'Invalid pagination.');
    if (getScenario() === 'empty') {
      return HttpResponse.json({ items: [], page, pageSize, totalItems: 0, totalPages: 1 });
    }
    return HttpResponse.json(queryHistory({ playerId: String(params.playerId), page, pageSize }));
  }),

  http.post('*/api/matches', async ({ request }) => {
    const body: unknown = await request.json().catch(() => null);
    if (!isValidInput(body)) {
      await delay(baseLatencyMs());
      return error(422, 'invalid_match', 'The match record is invalid.');
    }
    if (getScenario() === 'submit-timeout') {
      // The server commits the record, but the response never arrives in time.
      insertMatch(body);
      await delay(HANG_MS);
    }
    const short = await applyScenario('submit');
    if (short) return short;
    const result = insertMatch(body);
    return HttpResponse.json(result, { status: result.created ? 201 : 200 });
  }),

  // Simulated asset outage (Options → Mock network → "Fail game assets").
  http.get('*/assets/png/*', ({ request }) => {
    const pattern = getAssetFailure();
    if (pattern && request.url.includes(pattern)) return HttpResponse.error();
    return passthrough();
  }),
];
