import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { MatchRecordInput } from '../../api/contracts';
import { createMatchConfig, type PlayerOptions } from '../../game/config';
import { GameController, type GameSnapshot } from '../../game/GameController';
import type { GameTextures } from '../../game/render/assets';
import type { SimEvent } from '../../game/sim/types';
import { newId, type PlayerIdentity } from '../../storage/local';
import { exposeController, matchSeed, testMode } from '../../testing/testMode';
import { audio } from '../audio';
import { ControlsHelp } from '../components/ControlsHelp';
import { Dialog } from '../components/Dialog';
import { Hud, MatchStatusRegion } from './Hud';
import { TouchControls } from './TouchControls';
import { useGameTextures } from './useGameTextures';

/** Delay between the end of the match and the result screen (final explosion). */
const RESULT_DELAY_MS = 1200;

interface GameScreenProps {
  options: PlayerOptions;
  player: PlayerIdentity;
  /** Called once, as soon as the match ends (persist + submit). */
  onMatchEnd: (record: MatchRecordInput) => void;
  /** Called after a short delay to show the result screen. */
  onShowResult: (record: MatchRecordInput) => void;
  onRestart: () => void;
  onExit: () => void;
}

export function GameScreen(props: GameScreenProps) {
  const { state, retry } = useGameTextures();

  if (state.status === 'ready') return <Match {...props} textures={state.textures} />;

  return (
    <div className="screen screen--center">
      <section className="panel loading-panel" aria-labelledby="loading-title">
        <h2 id="loading-title" className="panel__title">
          {state.status === 'error' ? 'Loading failed' : 'Preparing the fleet'}
        </h2>
        {state.status === 'loading' ? (
          <>
            <progress
              className="progress"
              max={100}
              value={Math.round(state.progress * 100)}
              aria-label="Loading game assets"
              data-testid="asset-progress"
            />
            <p aria-live="polite">{Math.round(state.progress * 100)}%</p>
          </>
        ) : (
          <>
            <p role="alert" className="error-text" data-testid="asset-error">
              {state.message} Check your connection and try again.
            </p>
            <div className="panel__actions">
              <button type="button" className="btn btn--primary" onClick={retry} data-testid="asset-retry">
                Retry
              </button>
              <button type="button" className="btn btn--secondary" onClick={props.onExit}>
                Main Menu
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function Match({
  textures,
  options,
  player,
  onMatchEnd,
  onShowResult,
  onRestart,
  onExit,
}: GameScreenProps & { textures: GameTextures }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [controller, setController] = useState<GameController | null>(null);
  // Config snapshot taken when the match starts; later option changes don't affect it.
  const config = useMemo(() => createMatchConfig(options), [options]);
  const callbacks = useRef({ onMatchEnd, onShowResult });
  useEffect(() => {
    callbacks.current = { onMatchEnd, onShowResult };
  });

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let resultTimer: ReturnType<typeof setTimeout> | undefined;
    const c = new GameController({
      config,
      seed: matchSeed(),
      textures,
      manualClock: testMode.manualClock,
      onEvents: (events: readonly SimEvent[]) => audio.playEvents(events),
      onEnd: (summary) => {
        const record: MatchRecordInput = {
          matchId: newId(),
          playerId: player.playerId,
          playerName: player.playerName,
          playedAt: new Date().toISOString(),
          score: summary.score,
          durationMs: Math.round(summary.elapsedMs),
          endReason: summary.endReason ?? 'time',
          config: { sessionDurationSec: config.sessionDurationSec, spawnIntervalSec: config.spawn.intervalSec },
        };
        audio.play(summary.endReason === 'death' ? 'game_over' : 'game_complete');
        callbacks.current.onMatchEnd(record);
        resultTimer = setTimeout(() => callbacks.current.onShowResult(record), RESULT_DELAY_MS);
      },
    });
    setController(c);
    exposeController(c);
    c.mount(host)
      .then(() => audio.play('game_start'))
      .catch((error: unknown) => console.error('[game] failed to start', error));
    return () => {
      clearTimeout(resultTimer);
      exposeController(null);
      c.destroy();
    };
  }, [config, textures, player]);

  return (
    <div className="screen game-screen" data-testid="game-screen">
      <div ref={hostRef} className="game-canvas-host" />
      <div className="rotate-hint" role="note">
        Rotate your device to landscape to play.
      </div>
      {controller && <MatchOverlay controller={controller} onRestart={onRestart} onExit={onExit} />}
    </div>
  );
}

function MatchOverlay({
  controller,
  onRestart,
  onExit,
}: {
  controller: GameController;
  onRestart: () => void;
  onExit: () => void;
}) {
  const snapshot: GameSnapshot = useSyncExternalStore(controller.store.subscribe, controller.store.get);
  const paused = snapshot.phase === 'paused';

  useEffect(() => {
    if (snapshot.phase === 'paused') audio.play('game_pause');
  }, [snapshot.phase]);

  return (
    <>
      <Hud snapshot={snapshot} onPause={() => controller.pause('manual')} />
      <TouchControls input={controller.input} disabled={snapshot.phase !== 'running'} />
      <MatchStatusRegion snapshot={snapshot} />
      <Dialog
        open={paused}
        title="Paused"
        onCancel={() => {
          audio.play('game_resume');
          controller.resume();
        }}
        testId="pause-dialog"
      >
        <p className="panel__subtitle">
          {snapshot.pauseReason === 'manual' ? 'Take a breath, captain.' : 'The game was paused because the window lost focus.'}
        </p>
        <div className="panel__actions panel__actions--stack">
          <button
            type="button"
            className="btn btn--primary"
            autoFocus
            data-testid="resume-button"
            onClick={() => {
              audio.play('game_resume');
              controller.resume();
            }}
          >
            Resume
          </button>
          <button type="button" className="btn btn--secondary" onClick={onRestart} data-testid="restart-button">
            Restart
          </button>
          <button type="button" className="btn btn--secondary" onClick={onExit} data-testid="exit-button">
            Main Menu
          </button>
        </div>
        <ControlsHelp compact />
      </Dialog>
    </>
  );
}
