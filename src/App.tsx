import { useCallback, useMemo, useState } from 'react';
import type { MatchConfigSnapshot, MatchRecordInput } from './api/contracts';
import { SubmissionSync, submissions } from './api/submissions';
import type { PlayerOptions } from './game/config';
import { loadLastResult, loadOptions, loadPlayer, saveLastResult, saveOptions } from './storage/local';
import { audio } from './ui/audio';
import { GameScreen } from './ui/game/GameScreen';
import { MainMenu } from './ui/menu/MainMenu';
import { NetworkPanel } from './ui/NetworkPanel';
import { OptionsScreen } from './ui/options/OptionsScreen';
import { ResultScreen } from './ui/result/ResultScreen';

type Screen =
  | { name: 'menu' }
  | { name: 'options' }
  | { name: 'game'; matchKey: number }
  | { name: 'result'; record: MatchRecordInput };

/** Remembers (per tab) that the result screen was open, so a refresh shows it again. */
const RESULT_SCREEN_FLAG = 'pirate-battle:showing-result';

function initialScreen(): Screen {
  // Reloading never resumes a match in progress (it is abandoned, not recorded).
  try {
    const last = loadLastResult();
    if (last && sessionStorage.getItem(RESULT_SCREEN_FLAG) === last.matchId) {
      return { name: 'result', record: last };
    }
  } catch {
    // sessionStorage blocked
  }
  return { name: 'menu' };
}

function setResultFlag(matchId: string | null): void {
  try {
    if (matchId) sessionStorage.setItem(RESULT_SCREEN_FLAG, matchId);
    else sessionStorage.removeItem(RESULT_SCREEN_FLAG);
  } catch {
    // ignore
  }
}

export function App() {
  const [player] = useState(loadPlayer);
  const [options, setOptions] = useState<PlayerOptions>(loadOptions);
  const [lastResult, setLastResult] = useState<MatchRecordInput | null>(loadLastResult);
  const [screen, setScreenState] = useState<Screen>(initialScreen);

  const setScreen = useCallback((next: Screen) => {
    setResultFlag(next.name === 'result' ? next.record.matchId : null);
    setScreenState(next);
  }, []);

  const rankingConfig: MatchConfigSnapshot = useMemo(
    () => ({ sessionDurationSec: options.sessionDurationSec, spawnIntervalSec: options.spawnIntervalSec }),
    [options],
  );

  const play = useCallback(() => {
    audio.preload();
    audio.play('ui_click');
    setScreenState((s) => {
      setResultFlag(null);
      return { name: 'game', matchKey: (s.name === 'game' ? s.matchKey : 0) + 1 };
    });
  }, []);

  const goMenu = useCallback(() => setScreen({ name: 'menu' }), [setScreen]);

  const handleMatchEnd = useCallback((record: MatchRecordInput) => {
    // Persist first, then queue the upload; SubmissionSync sends it.
    saveLastResult(record);
    setLastResult(record);
    submissions.enqueue(record);
  }, []);

  return (
    <main className="app">
      <SubmissionSync />
      {screen.name === 'menu' && (
        <MainMenu
          playerId={player.playerId}
          playerName={player.playerName}
          config={rankingConfig}
          lastResult={lastResult}
          onPlay={play}
          onOptions={() => setScreen({ name: 'options' })}
        />
      )}
      {screen.name === 'options' && (
        <OptionsScreen
          options={options}
          onSave={(next) => {
            saveOptions(next);
            setOptions(next);
          }}
          onBack={goMenu}
        />
      )}
      {screen.name === 'game' && (
        <GameScreen
          key={screen.matchKey}
          options={options}
          player={player}
          onMatchEnd={handleMatchEnd}
          onShowResult={(record) => setScreen({ name: 'result', record })}
          onRestart={play}
          onExit={goMenu}
        />
      )}
      {screen.name === 'result' && <ResultScreen record={screen.record} onPlayAgain={play} onMainMenu={goMenu} />}
      {screen.name !== 'game' && <NetworkPanel />}
    </main>
  );
}
