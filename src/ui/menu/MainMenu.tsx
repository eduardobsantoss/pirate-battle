import { useRef, useState, type KeyboardEvent } from 'react';
import type { MatchConfigSnapshot, MatchRecordInput } from '../../api/contracts';
import { useRetryPending } from '../../api/submissions';
import { menuArtUrl } from '../assetUrls';
import { ControlsHelp } from '../components/ControlsHelp';
import { endReasonLabel, formatDuration } from '../format';
import { HistoryTab } from './HistoryTab';
import { RankingTab } from './RankingTab';

type Tab = 'ranking' | 'history';
const TABS: { id: Tab; label: string }[] = [
  { id: 'ranking', label: 'Ranking' },
  { id: 'history', label: 'Match History' },
];

interface MainMenuProps {
  playerId: string;
  playerName: string;
  config: MatchConfigSnapshot;
  lastResult: MatchRecordInput | null;
  onPlay: () => void;
  onOptions: () => void;
}

export function MainMenu({ playerId, playerName, config, lastResult, onPlay, onOptions }: MainMenuProps) {
  const [tab, setTab] = useState<Tab>('ranking');
  const tabRefs = useRef<Record<Tab, HTMLButtonElement | null>>({ ranking: null, history: null });
  const retryPending = useRetryPending();

  // Arrow-key navigation between tabs (WAI-ARIA tabs pattern).
  const onTabKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const i = TABS.findIndex((t) => t.id === tab);
    const next = TABS[(i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length]!.id;
    setTab(next);
    tabRefs.current[next]?.focus();
  };

  return (
    <div className="screen screen--center" data-testid="main-menu">
      <div className="menu-layout">
        <section className="panel" aria-labelledby="game-title">
          <h1 id="game-title" className="visually-hidden">
            Pirate Battle
          </h1>
          <img className="title-art" src={menuArtUrl('title_pirate_battle')} alt="" />
          <p className="tagline">Set sail. Take command.</p>
          <div className="panel__actions panel__actions--stack">
            <button type="button" className="btn btn--primary" onClick={onPlay} data-testid="play-button" autoFocus>
              Play
            </button>
            <button type="button" className="btn btn--primary" onClick={onOptions} data-testid="options-button">
              Options
            </button>
          </div>
          <p className="panel__subtitle">
            Sailing as <strong>{playerName}</strong>
          </p>
          {lastResult && (
            <p className="panel__subtitle" data-testid="last-result">
              Last match: <strong>{lastResult.score}</strong> pts · {formatDuration(lastResult.durationMs)} ·{' '}
              {endReasonLabel(lastResult.endReason)}
            </p>
          )}
          <details>
            <summary>How to play</summary>
            <p className="panel__subtitle">
              Sink enemy ships to score 1 point each. Chasers ram you, Shooters fire from range. Survive until the
              timer runs out!
            </p>
            <ControlsHelp />
          </details>
        </section>

        <section className="panel panel--wide" aria-label="Leaderboards">
          <div className="tabs" role="tablist" aria-label="Leaderboards">
            {TABS.map((t) => (
              <button
                key={t.id}
                ref={(el) => {
                  tabRefs.current[t.id] = el;
                }}
                type="button"
                role="tab"
                id={`tab-${t.id}`}
                aria-selected={tab === t.id}
                aria-controls={`panel-${t.id}`}
                tabIndex={tab === t.id ? 0 : -1}
                className="btn btn--secondary btn--small"
                onClick={() => setTab(t.id)}
                onKeyDown={onTabKey}
                data-testid={`tab-${t.id}`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} tabIndex={0}>
            {tab === 'ranking' ? (
              <RankingTab config={config} playerId={playerId} />
            ) : (
              <HistoryTab playerId={playerId} onRetryPending={retryPending} />
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
