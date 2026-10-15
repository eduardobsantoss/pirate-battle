import type { MatchRecordInput } from '../../api/contracts';
import { useSubmissionStatus, useSubmitMatch } from '../../api/submissions';
import { endReasonLabel, formatDuration } from '../format';

export function ResultScreen({
  record,
  onPlayAgain,
  onMainMenu,
}: {
  record: MatchRecordInput;
  onPlayAgain: () => void;
  onMainMenu: () => void;
}) {
  const { status, error } = useSubmissionStatus(record.matchId);
  const { submit } = useSubmitMatch();

  return (
    <div className="screen screen--center" data-testid="result-screen">
      <section className="panel" aria-labelledby="result-title">
        <h1 id="result-title" className="panel__title">
          {record.endReason === 'death' ? 'Your ship was sunk!' : 'Time is up!'}
        </h1>
        <p className="result-score" data-testid="result-score" aria-label={`Score ${record.score}`}>
          {record.score}
        </p>
        <dl className="result-stats">
          <div>
            <dt>Time played</dt>
            <dd data-testid="result-duration">{formatDuration(record.durationMs)}</dd>
          </div>
          <div>
            <dt>Ended by</dt>
            <dd data-testid="result-reason">{endReasonLabel(record.endReason)}</dd>
          </div>
          <div>
            <dt>Session / spawn</dt>
            <dd>
              {record.config.sessionDurationSec}s / {record.config.spawnIntervalSec}s
            </dd>
          </div>
          <div>
            <dt>Match record</dt>
            <dd data-testid="result-submission" data-status={status ?? 'unknown'}>
              <SubmissionLabel status={status} />
            </dd>
          </div>
        </dl>

        <div aria-live="polite">
          {status === 'failed' && (
            <div className="state-box">
              <p role="alert" className="error-text">
                Couldn&apos;t save this match: {error} It is kept on this device.
              </p>
              <button
                type="button"
                className="btn btn--secondary btn--small"
                onClick={() => submit(record)}
                data-testid="result-retry"
              >
                Retry
              </button>
            </div>
          )}
        </div>

        <div className="panel__actions">
          <button type="button" className="btn btn--primary" onClick={onPlayAgain} data-testid="play-again" autoFocus>
            Play Again
          </button>
          <button type="button" className="btn btn--secondary" onClick={onMainMenu} data-testid="main-menu-button">
            Main Menu
          </button>
        </div>
      </section>
    </div>
  );
}

function SubmissionLabel({ status }: { status: ReturnType<typeof useSubmissionStatus>['status'] }) {
  switch (status) {
    case 'confirmed':
      return <span className="success-text">Saved</span>;
    case 'submitting':
      return <span>Saving…</span>;
    case 'pending':
      return <span>Waiting to save</span>;
    case 'failed':
      return <span className="error-text">Not saved yet</span>;
    default:
      return <span>Saved locally</span>;
  }
}
