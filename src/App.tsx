import { useCallback, useState } from 'react';
import type { MatchRecordInput } from './api/contracts';
import type { PlayerOptions } from './game/config';
import { loadLastResult, loadOptions, loadPlayer, saveLastResult, saveOptions } from './storage/local';
import { audio } from './ui/audio';
import { GameScreen } from './ui/game/GameScreen';

type Screen =
  | { name: 'menu' }
  | { name: 'options' }
  | { name: 'game'; matchKey: number }
  | { name: 'result'; record: MatchRecordInput };

export function App() {
  const [player] = useState(loadPlayer);
  const [options, setOptions] = useState<PlayerOptions>(loadOptions);
  const [screen, setScreen] = useState<Screen>(() => {
    // Reloading never resumes a match; the last completed result is restored instead.
    const last = loadLastResult();
    return last && new URLSearchParams(location.search).get('screen') === 'result'
      ? { name: 'result', record: last }
      : { name: 'menu' };
  });

  const play = useCallback(() => {
    audio.preload();
    setScreen((s) => ({ name: 'game', matchKey: (s.name === 'game' ? s.matchKey : 0) + 1 }));
  }, []);

  const handleMatchEnd = useCallback((record: MatchRecordInput) => {
    saveLastResult(record);
  }, []);

  return (
    <main className="app">
      {screen.name === 'menu' && (
        <div className="screen screen--center">
          <section className="panel">
            <h1 className="title">Pirate Battle</h1>
            <button type="button" className="btn btn--primary" onClick={play}>
              Play
            </button>
          </section>
        </div>
      )}
      {screen.name === 'game' && (
        <GameScreen
          key={screen.matchKey}
          options={options}
          player={player}
          onMatchEnd={handleMatchEnd}
          onShowResult={(record) => setScreen({ name: 'result', record })}
          onRestart={play}
          onExit={() => setScreen({ name: 'menu' })}
        />
      )}
      {screen.name === 'result' && (
        <div className="screen screen--center">
          <section className="panel">
            <h1>Score {screen.record.score}</h1>
            <button type="button" className="btn btn--primary" onClick={play}>
              Play Again
            </button>
            <button
              type="button"
              className="btn btn--secondary"
              onClick={() => {
                setOptions((o) => {
                  saveOptions(o);
                  return o;
                });
                setScreen({ name: 'menu' });
              }}
            >
              Main Menu
            </button>
          </section>
        </div>
      )}
    </main>
  );
}
