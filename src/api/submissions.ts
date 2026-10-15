import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useSyncExternalStore } from 'react';
import { Store } from '../game/store';
import { loadPending, readJson, savePending, STORAGE_PREFIX, writeJson } from '../storage/local';
import { api, toApiError } from './client';
import type { MatchRecordInput } from './contracts';
import { queryKeys } from './queries';

export type SubmissionStatus = 'pending' | 'submitting' | 'confirmed' | 'failed';

interface QueueState {
  /** Completed matches not yet confirmed by the server (persisted). */
  pending: MatchRecordInput[];
  /** Recently confirmed match ids (persisted, capped). */
  confirmed: string[];
  /** In-memory: requests currently in flight. */
  inFlight: string[];
  /** In-memory: last error per match id; cleared on retry. */
  errors: Record<string, string>;
}

const CONFIRMED_KEY = `${STORAGE_PREFIX}confirmed-submissions`;
const MAX_CONFIRMED = 50;

/**
 * Durable outbox for match records. A record is stored locally before the
 * first request, survives failures and refreshes, and is only dropped once
 * the server confirms it. The server is idempotent on `matchId`, so retries
 * after a timeout recover the existing record instead of duplicating it.
 */
class SubmissionQueue {
  readonly store = new Store<QueueState>({
    pending: loadPending(),
    confirmed: readJson<string[]>(CONFIRMED_KEY) ?? [],
    inFlight: [],
    errors: {},
  });

  private update(patch: Partial<QueueState>): void {
    const next = { ...this.store.get(), ...patch };
    this.store.set(next);
    if (patch.pending) savePending(next.pending);
    if (patch.confirmed) writeJson(CONFIRMED_KEY, next.confirmed);
  }

  enqueue(record: MatchRecordInput): void {
    const { pending, confirmed } = this.store.get();
    if (confirmed.includes(record.matchId) || pending.some((p) => p.matchId === record.matchId)) return;
    this.update({ pending: [...pending, record] });
  }

  statusOf(matchId: string): SubmissionStatus | null {
    const s = this.store.get();
    if (s.confirmed.includes(matchId)) return 'confirmed';
    if (s.inFlight.includes(matchId)) return 'submitting';
    if (s.errors[matchId]) return 'failed';
    if (s.pending.some((p) => p.matchId === matchId)) return 'pending';
    return null;
  }

  /** Records that should be sent automatically (not failed, not in flight). */
  due(): MatchRecordInput[] {
    const s = this.store.get();
    return s.pending.filter((p) => !s.inFlight.includes(p.matchId) && !s.errors[p.matchId]);
  }

  markInFlight(matchId: string): boolean {
    const s = this.store.get();
    if (s.inFlight.includes(matchId) || s.confirmed.includes(matchId)) return false;
    const errors = { ...s.errors };
    delete errors[matchId];
    this.update({ inFlight: [...s.inFlight, matchId], errors });
    return true;
  }

  markConfirmed(matchId: string): void {
    const s = this.store.get();
    this.update({
      pending: s.pending.filter((p) => p.matchId !== matchId),
      confirmed: [matchId, ...s.confirmed.filter((id) => id !== matchId)].slice(0, MAX_CONFIRMED),
      inFlight: s.inFlight.filter((id) => id !== matchId),
    });
  }

  markFailed(matchId: string, message: string): void {
    const s = this.store.get();
    this.update({
      inFlight: s.inFlight.filter((id) => id !== matchId),
      errors: { ...s.errors, [matchId]: message },
    });
  }

  /** Clears local queue state (used by the mock network "reset"). */
  clear(): void {
    this.update({ pending: [], confirmed: [], inFlight: [], errors: {} });
  }
}

export const submissions = new SubmissionQueue();

export function useSubmissionState(): QueueState {
  return useSyncExternalStore(submissions.store.subscribe, submissions.store.get);
}

export function useSubmissionStatus(matchId: string | undefined) {
  const state = useSubmissionState();
  return {
    status: matchId ? submissions.statusOf(matchId) : null,
    error: matchId ? state.errors[matchId] : undefined,
  };
}

/** TanStack mutation that registers a completed match (idempotent). */
export function useSubmitMatch() {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationKey: ['submit-match'],
    mutationFn: (record: MatchRecordInput) => api.submitMatch(record),
    onSuccess: (_response, record) => {
      submissions.markConfirmed(record.matchId);
      void queryClient.invalidateQueries({ queryKey: queryKeys.rankingAll });
      void queryClient.invalidateQueries({ queryKey: queryKeys.historyAll });
    },
    onError: (error, record) => {
      submissions.markFailed(record.matchId, toApiError(error).message);
    },
  });

  /** Sends a record unless it's already in flight or confirmed (repeat clicks are no-ops). */
  const submit = (record: MatchRecordInput) => {
    if (!submissions.markInFlight(record.matchId)) return;
    mutation.mutate(record);
  };

  return { submit };
}

/**
 * Background worker mounted once at the app root: sends every due record on
 * startup, whenever a new one is queued and when the browser comes back online.
 */
export function SubmissionSync() {
  const { submit } = useSubmitMatch();
  const state = useSubmissionState();

  useEffect(() => {
    for (const record of submissions.due()) submit(record);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `submit` is recreated per render; queue state drives this
  }, [state.pending]);

  useEffect(() => {
    const onOnline = () => {
      for (const record of submissions.store.get().pending) submit(record);
    };
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  });

  return null;
}

/** Manually re-sends every pending record (clears previous failures). */
export function useRetryPending(): () => void {
  const { submit } = useSubmitMatch();
  return () => {
    for (const record of submissions.store.get().pending) submit(record);
  };
}
