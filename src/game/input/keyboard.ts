import type { ControlName, InputState } from './InputState';

/** Keyboard bindings, keyed by `KeyboardEvent.code` (layout independent). */
export const KEY_BINDINGS: Readonly<Record<string, ControlName>> = {
  KeyW: 'forward',
  ArrowUp: 'forward',
  KeyA: 'turnLeft',
  ArrowLeft: 'turnLeft',
  KeyD: 'turnRight',
  ArrowRight: 'turnRight',
  Space: 'fireFront',
  KeyQ: 'fireLeft',
  KeyE: 'fireRight',
};

export const PAUSE_KEYS: readonly string[] = ['KeyP', 'Escape'];

/** Human-readable control list shown in menus and the pause dialog. */
export const CONTROL_HELP: readonly { action: string; keys: string; touch: string }[] = [
  { action: 'Sail forward', keys: 'W / ↑', touch: 'Forward button' },
  { action: 'Turn left / right', keys: 'A / ← and D / →', touch: 'Turn buttons' },
  { action: 'Front cannon', keys: 'Space', touch: 'Front fire button' },
  { action: 'Left broadside', keys: 'Q', touch: 'Left fire button' },
  { action: 'Right broadside', keys: 'E', touch: 'Right fire button' },
  { action: 'Pause / resume', keys: 'P / Esc', touch: 'Pause button' },
];

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

/**
 * Captures game keys on `window` while attached. Only gameplay keys are
 * prevented, and only while the game context is active, so menus and dialogs
 * keep normal keyboard behaviour.
 */
export function attachKeyboard(
  input: InputState,
  handlers: { onPauseKey: () => void; isActive: () => boolean },
): () => void {
  const onKeyDown = (event: KeyboardEvent) => {
    if (isTypingTarget(event.target)) return;
    if (PAUSE_KEYS.includes(event.code)) {
      if (!event.repeat) handlers.onPauseKey();
      event.preventDefault();
      return;
    }
    const control = KEY_BINDINGS[event.code];
    if (!control || !handlers.isActive()) return;
    event.preventDefault();
    input.set('keyboard', control, true);
  };
  const onKeyUp = (event: KeyboardEvent) => {
    const control = KEY_BINDINGS[event.code];
    if (!control) return;
    input.set('keyboard', control, false);
  };

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  return () => {
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
  };
}
