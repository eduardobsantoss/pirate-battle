import { IDLE_CONTROLS, type ShipControls } from '../sim/types';

export type ControlName = keyof ShipControls;

/**
 * Merges keyboard and touch sources into one `ShipControls` snapshot.
 *
 * Each source holds its own pressed set so releasing a key never cancels a
 * finger still holding the same on-screen button (and vice versa).
 * Mutated directly by input handlers — never stored in React state.
 */
export class InputState {
  private readonly sources = new Map<string, Set<ControlName>>();
  private enabled = true;

  set(source: string, control: ControlName, pressed: boolean): void {
    if (!this.enabled) return;
    let set = this.sources.get(source);
    if (!set) {
      set = new Set();
      this.sources.set(source, set);
    }
    if (pressed) set.add(control);
    else set.delete(control);
  }

  isPressed(control: ControlName): boolean {
    for (const set of this.sources.values()) if (set.has(control)) return true;
    return false;
  }

  snapshot(): ShipControls {
    if (!this.enabled) return { ...IDLE_CONTROLS };
    return {
      forward: this.isPressed('forward'),
      turnLeft: this.isPressed('turnLeft'),
      turnRight: this.isPressed('turnRight'),
      fireFront: this.isPressed('fireFront'),
      fireLeft: this.isPressed('fireLeft'),
      fireRight: this.isPressed('fireRight'),
    };
  }

  /** Drops every held control (used on pause/blur so nothing "sticks"). */
  reset(): void {
    this.sources.clear();
  }

  /** While disabled every control reads as released and new presses are ignored. */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.reset();
  }
}
