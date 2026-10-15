import { useEffect, useRef, useState } from 'react';
import type { GameSnapshot } from '../../game/GameController';
import { formatClock } from '../format';
import { hudIconUrl as hudIcon, iconUrl } from '../assetUrls';

/**
 * HUD rendered by React from the low-frequency game snapshot (re-renders when
 * score/health/seconds change, never per frame).
 */
export function Hud({ snapshot, onPause }: { snapshot: GameSnapshot; onPause: () => void }) {
  const ratio = snapshot.maxHealth > 0 ? snapshot.health / snapshot.maxHealth : 0;
  const fill = ratio > 0.6 ? 'green' : ratio > 0.3 ? 'amber' : 'red';

  return (
    <div className="hud">
      <div className="hud__health" data-testid="hud-health">
        <img className="hud__heart" src={hudIcon('icon_heart')} alt="" />
        <div className="health-bar">
          <div
            className="health-bar__fill"
            style={{
              backgroundImage: `url(${hudIcon(`health_fill_${fill}`)})`,
              // Fill rect spans x 30..226 of the 256px artwork (ui_sheet.json).
              clipPath: `inset(0 ${((256 - 30 - 196 * ratio) / 256) * 100}% 0 0)`,
            }}
          />
          <span className="health-bar__label">
            {Math.ceil(snapshot.health)} / {snapshot.maxHealth}
          </span>
        </div>
      </div>

      <div className="hud__right">
        <div className="counter" data-testid="hud-score">
          <img src={hudIcon('icon_score')} alt="" />
          <span>{snapshot.score}</span>
        </div>
        <div className={`counter ${snapshot.remainingSec <= 10 ? 'counter--warning' : ''}`} data-testid="hud-time">
          <img src={hudIcon('icon_time')} alt="" />
          <span>{formatClock(snapshot.remainingSec * 1000)}</span>
        </div>
        <button
          type="button"
          className="round-button"
          onClick={onPause}
          aria-label="Pause game"
          data-testid="pause-button"
          disabled={snapshot.phase !== 'running'}
        >
          <span className="round-button__icon" style={{ backgroundImage: `url(${iconUrl('icon_pause')})` }} />
        </button>
      </div>
    </div>
  );
}

/**
 * Semantic, screen-reader friendly match status. Announces only meaningful
 * changes (score, pause, time warnings, end) — never every frame or second.
 */
export function MatchStatusRegion({ snapshot }: { snapshot: GameSnapshot }) {
  const [announcement, setAnnouncement] = useState('');
  const prev = useRef(snapshot);

  useEffect(() => {
    const before = prev.current;
    prev.current = snapshot;
    let message = '';
    if (snapshot.phase === 'ended' && before.phase !== 'ended') {
      message = `Match over. ${snapshot.endReason === 'death' ? 'Your ship was sunk.' : 'Time is up.'} Final score ${snapshot.score}.`;
    } else if (snapshot.phase === 'paused' && before.phase !== 'paused') {
      message = 'Game paused.';
    } else if (snapshot.phase === 'running' && before.phase === 'paused') {
      message = 'Game resumed.';
    } else if (snapshot.score !== before.score) {
      message = `Score ${snapshot.score}.`;
    } else if (snapshot.remainingSec !== before.remainingSec && [30, 10].includes(snapshot.remainingSec)) {
      message = `${snapshot.remainingSec} seconds left.`;
    }
    if (message) setAnnouncement(message);
  }, [snapshot]);

  return (
    <section className="visually-hidden" aria-label="Match status" data-testid="match-status">
      <dl>
        <dt>Status</dt>
        <dd data-testid="status-phase">{snapshot.phase}</dd>
        <dt>Score</dt>
        <dd data-testid="status-score">{snapshot.score}</dd>
        <dt>Health</dt>
        <dd data-testid="status-health">
          {Math.ceil(snapshot.health)} of {snapshot.maxHealth}
        </dd>
        <dt>Time left</dt>
        <dd data-testid="status-time">{snapshot.remainingSec} seconds</dd>
      </dl>
      <p role="status" aria-live="polite">
        {announcement}
      </p>
    </section>
  );
}
