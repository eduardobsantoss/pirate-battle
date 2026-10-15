import { useState } from 'react';
import { useHistory } from '../../api/queries';
import { useSubmissionState } from '../../api/submissions';
import { endReasonLabel, formatDate, formatDuration } from '../format';
import { EmptyState, ErrorState, FetchingBadge, LoadingState, Pager } from './DataStates';

export function HistoryTab({ playerId, onRetryPending }: { playerId: string; onRetryPending: () => void }) {
  const [page, setPage] = useState(1);
  const query = useHistory(playerId, page);
  const data = query.data;
  const queue = useSubmissionState();
  const pendingCount = queue.pending.length;

  return (
    <div data-testid="history-tab">
      <p className="panel__subtitle">
        Your recent voyages. <FetchingBadge visible={query.isFetching && !query.isPending} />
      </p>

      {pendingCount > 0 && (
        <div className="state-box" data-testid="pending-banner">
          <p>
            {pendingCount} completed {pendingCount === 1 ? 'match is' : 'matches are'} waiting to be saved.
          </p>
          <button type="button" className="btn btn--secondary btn--small" onClick={onRetryPending}>
            Retry now
          </button>
        </div>
      )}

      {query.isPending ? (
        <LoadingState label="match history" />
      ) : query.isError && !data ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} label="your match history" />
      ) : data && data.items.length === 0 ? (
        <EmptyState>No matches yet. Set sail and your battles will show up here.</EmptyState>
      ) : data ? (
        <>
          {query.isError && (
            <p role="alert" className="error-text">
              Showing saved results — refresh failed.
            </p>
          )}
          <div className="table-scroll">
            <table className="data-table">
              <caption className="visually-hidden">
                Match history, page {data.page} of {data.totalPages}
              </caption>
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col" className="num">
                    Score
                  </th>
                  <th scope="col" className="num">
                    Duration
                  </th>
                  <th scope="col">Result</th>
                  <th scope="col">Settings</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((r) => (
                  <tr key={r.matchId} data-testid="history-row">
                    <td>{formatDate(r.playedAt)}</td>
                    <td className="num">{r.score}</td>
                    <td className="num">{formatDuration(r.durationMs)}</td>
                    <td>{endReasonLabel(r.endReason)}</td>
                    <td>
                      {r.config.sessionDurationSec}s / {r.config.spawnIntervalSec}s
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager page={page} totalPages={data.totalPages} onChange={setPage} label="Match history" />
        </>
      ) : null}
    </div>
  );
}
