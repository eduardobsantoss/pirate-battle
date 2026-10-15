import axios, { AxiosError } from 'axios';
import type {
  ApiErrorBody,
  HistoryQuery,
  MatchRecord,
  MatchRecordInput,
  Page,
  RankingEntry,
  RankingQuery,
  SubmitMatchResponse,
} from './contracts';

/** Client timeout; overridable with `?apiTimeout=<ms>` to keep tests fast. */
function timeoutMs(): number {
  const fromUrl = Number(new URLSearchParams(globalThis.location?.search ?? '').get('apiTimeout'));
  return Number.isFinite(fromUrl) && fromUrl > 0 ? fromUrl : 8000;
}

export const http = axios.create({
  baseURL: `${import.meta.env.BASE_URL}api`,
  timeout: timeoutMs(),
  headers: { Accept: 'application/json' },
});

export type ApiErrorKind = 'timeout' | 'network' | 'client' | 'server' | 'cancelled' | 'unknown';

/** Normalized error so the UI and retry policy don't depend on Axios internals. */
export class ApiError extends Error {
  constructor(
    readonly kind: ApiErrorKind,
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** Timeouts, connection failures and 5xx/429 are worth retrying. */
  get retryable(): boolean {
    return this.kind === 'timeout' || this.kind === 'network' || this.kind === 'server' || this.status === 429;
  }
}

export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  if (axios.isCancel(error)) return new ApiError('cancelled', 'Request cancelled.');
  if (error instanceof AxiosError) {
    if (error.code === AxiosError.ECONNABORTED || error.code === AxiosError.ETIMEDOUT) {
      return new ApiError('timeout', 'The server took too long to respond.');
    }
    const status = error.response?.status;
    if (!status) return new ApiError('network', 'Could not reach the server.');
    const body = error.response?.data as Partial<ApiErrorBody> | undefined;
    const message = body?.message ?? `Request failed with status ${status}.`;
    return new ApiError(status >= 500 ? 'server' : 'client', message, status);
  }
  return new ApiError('unknown', 'Unexpected error.');
}

async function call<T>(request: () => Promise<{ data: T }>): Promise<T> {
  try {
    return (await request()).data;
  } catch (error) {
    throw toApiError(error);
  }
}

export const api = {
  getRanking(q: RankingQuery, signal?: AbortSignal): Promise<Page<RankingEntry>> {
    return call(() => http.get('/ranking', { params: q, signal }));
  },

  getHistory({ playerId, ...params }: HistoryQuery, signal?: AbortSignal): Promise<Page<MatchRecord>> {
    return call(() => http.get(`/players/${encodeURIComponent(playerId)}/matches`, { params, signal }));
  },

  /** Idempotent: re-sending the same `matchId` returns the existing record. */
  submitMatch(record: MatchRecordInput): Promise<SubmitMatchResponse> {
    return call(() =>
      http.post('/matches', record, { headers: { 'Idempotency-Key': record.matchId } }),
    );
  },
};
