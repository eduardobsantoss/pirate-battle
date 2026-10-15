import { useCallback, useEffect, useState } from 'react';
import { loadGameTextures, type GameTextures } from '../../game/render/assets';

export type TextureLoadState =
  | { status: 'loading'; progress: number }
  | { status: 'ready'; textures: GameTextures }
  | { status: 'error'; message: string };

/** Loads the match textures with progress, exposing a retry on failure. */
export function useGameTextures(): { state: TextureLoadState; retry: () => void } {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<TextureLoadState>({ status: 'loading', progress: 0 });

  useEffect(() => {
    let cancelled = false;
    // Other files keep reporting progress after a failure rejected the load.
    let settled = false;
    loadGameTextures((progress) => {
      if (!cancelled && !settled) setState({ status: 'loading', progress });
    })
      .then((textures) => {
        settled = true;
        if (!cancelled) setState({ status: 'ready', textures });
      })
      .catch((error: unknown) => {
        settled = true;
        if (cancelled) return;
        console.warn('[assets] failed to load game textures', error);
        setState({ status: 'error', message: 'Some game assets could not be loaded.' });
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const retry = useCallback(() => {
    setState({ status: 'loading', progress: 0 });
    setAttempt((a) => a + 1);
  }, []);

  return { state, retry };
}
