import { useState } from 'react';
import type { MatchConfigSnapshot } from '../../api/contracts';
import { useRanking } from '../../api/queries';
import { formatDate, formatDuration } from '../format';
import { EmptyState, ErrorState, FetchingBadge, LoadingState, Pager } from './DataStates';

export function RankingTab({ config, playerId }: { config: MatchConfigSnapshot; playerId: string }) {
  const [page, setPage] = useState(1);
  const query = useRanking(config, page);
  const data = query.data;

  return (
    <div data-testid="ranking-tab">
      <p className="panel__subtitle">
        Matches played with <strong>{config.sessionDurationSec}s</strong> sessions and{' '}
        <strong>{config.spawnIntervalSec}s</strong> spawn interval.{' '}
        <FetchingBadge visible={query.isFetching && !query.isPending} />
      </p>

      {query.isPending ? (
        <LoadingState label="ranking" />
      ) : query.isError && !data ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} label="the ranking" />
      ) : data && data.items.length === 0 ? (
        <EmptyState>No matches ranked for this configuration yet. Be the first captain on the board!</EmptyState>
      ) : data ? (
        <>
          {query.isError && (
            <p role="alert" className="error-text">
              Showing saved results — refresh failed.
            </p>
          )}
          <div className="table-scroll">
            <table className="data-table" aria-describedby="ranking-caption">
              <caption id="ranking-caption" className="visually-hidden">
                Ranking, page {data.page} of {data.totalPages}
              </caption>
              <thead>
                <tr>
                  <th scope="col" className="num">
                    #
                  </th>
                  <th scope="col">Captain</th>
                  <th scope="col" className="num">
                    Score
                  </th>
                  <th scope="col" className="num">
                    Time
                  </th>
                  <th scope="col">Date</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((e) => (
                  <tr key={e.matchId} className={e.playerId === playerId ? 'is-me' : undefined} data-testid="ranking-row">
                    <td className="num">{e.rank}</td>
                    <td>
                      {e.playerName}
                      {e.playerId === playerId && <span className="visually-hidden"> (you)</span>}
                    </td>
                    <td className="num">{e.score}</td>
                    <td className="num">{formatDuration(e.durationMs)}</td>
                    <td>{formatDate(e.playedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager page={data.page} totalPages={data.totalPages} onChange={setPage} label="Ranking" />
        </>
      ) : null}
    </div>
  );
}
