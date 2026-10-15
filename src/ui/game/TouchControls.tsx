import type { MouseEvent, PointerEvent } from 'react';
import type { ControlName, InputState } from '../../game/input/InputState';
import { iconUrl } from '../assetUrls';

interface ButtonDef {
  control: ControlName;
  icon: string;
  label: string;
}

const MOVE: ButtonDef[] = [
  { control: 'turnLeft', icon: 'icon_turn_left', label: 'Turn left' },
  { control: 'forward', icon: 'icon_forward', label: 'Sail forward' },
  { control: 'turnRight', icon: 'icon_turn_right', label: 'Turn right' },
];

const FIRE: ButtonDef[] = [
  { control: 'fireLeft', icon: 'icon_fire_left', label: 'Fire left broadside' },
  { control: 'fireFront', icon: 'icon_fire_front', label: 'Fire front cannon' },
  { control: 'fireRight', icon: 'icon_fire_right', label: 'Fire right broadside' },
];

/**
 * On-screen controls. They write straight into `InputState` on pointer
 * events (multi-touch friendly) and never cause React re-renders.
 */
export function TouchControls({ input, disabled }: { input: InputState; disabled: boolean }) {
  const bind = (control: ControlName) => {
    const source = `pointer-${control}`;
    const release = (e: PointerEvent<HTMLButtonElement>) => {
      e.currentTarget.dataset.pressed = 'false';
      input.set(source, control, false);
    };
    return {
      onPointerDown: (e: PointerEvent<HTMLButtonElement>) => {
        e.preventDefault();
        e.currentTarget.setPointerCapture?.(e.pointerId);
        e.currentTarget.dataset.pressed = 'true';
        input.set(source, control, true);
      },
      onPointerUp: release,
      onPointerCancel: release,
      onLostPointerCapture: release,
      onContextMenu: (e: MouseEvent) => e.preventDefault(),
    };
  };

  const render = (defs: ButtonDef[], group: string) => (
    <div className={`touch-group touch-group--${group}`}>
      {defs.map((d) => (
        <button
          key={d.control}
          type="button"
          className={`round-button touch-button touch-button--${d.control}`}
          aria-label={d.label}
          data-testid={`touch-${d.control}`}
          disabled={disabled}
          tabIndex={-1}
          {...bind(d.control)}
        >
          <span className="round-button__icon" style={{ backgroundImage: `url(${iconUrl(d.icon)})` }} />
        </button>
      ))}
    </div>
  );

  return (
    <div className="touch-controls" aria-hidden="true">
      {render(MOVE, 'move')}
      {render(FIRE, 'fire')}
    </div>
  );
}
