import { keepPreviousData, QueryClient, useQuery } from '@tanstack/react-query';
import { api, toApiError } from './client';
import type { MatchConfigSnapshot } from './contracts';

export const PAGE_SIZE = 10;

export const queryKeys = {
  ranking: (config: MatchConfigSnapshot, page: number) =>
    ['ranking', config.sessionDurationSec, config.spawnIntervalSec, page] as const,
  rankingAll: ['ranking'] as const,
  history: (playerId: string, page: number) => ['history', playerId, page] as const,
  historyAll: ['history'] as const,
};

/** Retries transient failures (timeout, network, 5xx) only, up to 2 times. */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  return failureCount < 2 && toApiError(error).retryable;
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Always revalidate when a tab is shown again; cached data renders instantly meanwhile.
        staleTime: 0,
        gcTime: 5 * 60_000,
        retry: shouldRetry,
        retryDelay: (attempt) => Math.min(500 * 2 ** attempt, 4000),
        refetchOnWindowFocus: true,
      },
      mutations: {
        retry: shouldRetry,
        retryDelay: (attempt) => Math.min(500 * 2 ** attempt, 4000),
      },
    },
  });
}

/**
 * Each page/config is its own cache entry and requests are aborted when
 * superseded, so a slow, older response can never overwrite newer data.
 */
export function useRanking(config: MatchConfigSnapshot, page: number) {
  return useQuery({
    queryKey: queryKeys.ranking(config, page),
    queryFn: ({ signal }) => api.getRanking({ ...config, page, pageSize: PAGE_SIZE }, signal),
    placeholderData: keepPreviousData,
  });
}

export function useHistory(playerId: string, page: number) {
  return useQuery({
    queryKey: queryKeys.history(playerId, page),
    queryFn: ({ signal }) => api.getHistory({ playerId, page, pageSize: PAGE_SIZE }, signal),
    placeholderData: keepPreviousData,
  });
}
