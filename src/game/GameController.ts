import { Application, type Ticker } from 'pixi.js';
import { ARENA } from './arena';
import type { GameConfig } from './config';
import { InputState } from './input/InputState';
import { attachKeyboard } from './input/keyboard';
import type { GameTextures } from './render/assets';
import { GameRenderer } from './render/GameRenderer';
import { Simulation, STEP_MS } from './sim/Simulation';
import type { EndReason, MatchSummary, SimEvent } from './sim/types';
import { shallowEqual, Store } from './store';

export type GamePhase = 'starting' | 'running' | 'paused' | 'ended';
export type PauseReason = 'manual' | 'blur' | 'hidden';

/** Low-frequency view of the match for React (changes ~once per second). */
export interface GameSnapshot {
  phase: GamePhase;
  pauseReason: PauseReason | null;
  score: number;
  health: number;
  maxHealth: number;
  remainingSec: number;
  endReason: EndReason | null;
}

export interface GameControllerOptions {
  config: Readonly<GameConfig>;
  seed: number;
  textures: GameTextures;
  /**
   * When true the simulation only advances through `advance()` (tests).
   * Rendering, input and rules run exactly as in real time.
   */
  manualClock?: boolean;
  onEnd?: (summary: MatchSummary) => void;
  onEvents?: (events: readonly SimEvent[]) => void;
}

/** Longest frame we simulate; longer gaps (tab switches, breakpoints) are dropped. */
const MAX_FRAME_MS = 100;

/**
 * Owns one match: the Pixi application, simulation, renderer and input.
 *
 * Lifecycle: `mount(host)` (async, safe to call `destroy()` at any time —
 * including before `mount` resolves, which is what React Strict Mode does)
 * and `destroy()` which releases every listener, the ticker, entities and the
 * WebGL context. Shared textures are kept cached for the next match.
 */
export class GameController {
  readonly input = new InputState();
  readonly store: Store<GameSnapshot>;
  readonly sim: Simulation;

  private app: Application | null = null;
  private renderer: GameRenderer | null = null;
  private destroyed = false;
  private accumulatorMs = 0;
  private ended = false;
  private disposers: (() => void)[] = [];
  private readonly options: GameControllerOptions;

  constructor(options: GameControllerOptions) {
    this.options = options;
    this.sim = new Simulation(options.config, ARENA, options.seed);
    this.store = new Store<GameSnapshot>({
      phase: 'starting',
      pauseReason: null,
      score: 0,
      health: this.sim.player.health,
      maxHealth: this.sim.player.maxHealth,
      remainingSec: Math.ceil(this.sim.remainingMs / 1000),
      endReason: null,
    });
  }

  get phase(): GamePhase {
    return this.store.get().phase;
  }

  async mount(host: HTMLElement): Promise<void> {
    const app = new Application();
    await app.init({
      resizeTo: host,
      antialias: true,
      autoDensity: true,
      resolution: Math.min(globalThis.devicePixelRatio || 1, 2),
      background: 0x1b6f93,
      preference: 'webgl',
    });
    if (this.destroyed) {
      app.destroy(true, { children: true, texture: false, textureSource: false });
      return;
    }
    this.app = app;
    app.canvas.setAttribute('aria-hidden', 'true');
    app.canvas.dataset.testid = 'game-canvas';
    host.appendChild(app.canvas);

    this.renderer = new GameRenderer(this.options.textures, ARENA);
    app.stage.addChild(this.renderer.root);
    this.renderer.sync(this.sim, 1, 0);

    const onResize = () => this.layout();
    app.renderer.on('resize', onResize);
    this.disposers.push(() => app.renderer.off('resize', onResize));
    this.layout();

    this.disposers.push(
      attachKeyboard(this.input, {
        isActive: () => this.phase === 'running',
        onPauseKey: () => this.togglePause(),
      }),
    );

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') this.pause('hidden');
    };
    const onBlur = () => this.pause('blur');
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', onBlur);
    this.disposers.push(() => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', onBlur);
    });

    app.ticker.add(this.onTick);
    this.patch({ phase: 'running' });
  }

  /** Fits the arena inside the canvas, preserving aspect ratio (letterboxed). */
  private layout(): void {
    if (!this.app || !this.renderer) return;
    const { width, height } = this.app.screen;
    const scale = Math.min(width / ARENA.width, height / ARENA.height);
    const root = this.renderer.root;
    root.scale.set(scale);
    root.position.set((width - ARENA.width * scale) / 2, (height - ARENA.height * scale) / 2);
  }

  private onTick = (ticker: Ticker): void => {
    const frameMs = Math.min(ticker.deltaMS, MAX_FRAME_MS);
    if (this.phase === 'running' && !this.options.manualClock) {
      this.accumulatorMs += frameMs;
      while (this.accumulatorMs >= STEP_MS && this.phase === 'running') {
        this.stepOnce();
        this.accumulatorMs -= STEP_MS;
      }
    }
    const alpha = this.phase === 'running' && !this.options.manualClock ? this.accumulatorMs / STEP_MS : 1;
    // Effects keep animating after the match ends (final explosion) but freeze on pause.
    this.renderer?.sync(this.sim, alpha, this.phase === 'paused' ? 0 : frameMs);
  };

  private stepOnce(): void {
    this.sim.step(STEP_MS, this.input.snapshot());
    const events = this.sim.drainEvents();
    if (events.length > 0) {
      this.renderer?.handleEvents(events);
      this.options.onEvents?.(events);
    }
    this.publish();
  }

  private publish(): void {
    const s = this.sim;
    const ended = s.status === 'ended';
    this.patch({
      phase: ended ? 'ended' : this.phase,
      score: s.score,
      health: s.player.health,
      remainingSec: Math.ceil(s.remainingMs / 1000),
      endReason: s.endReason,
    });
    if (ended && !this.ended) {
      this.ended = true;
      this.input.setEnabled(false);
      this.options.onEnd?.(s.summary());
    }
  }

  private patch(partial: Partial<GameSnapshot>): void {
    const next = { ...this.store.get(), ...partial };
    if (!shallowEqual(next, this.store.get())) this.store.set(next);
  }

  pause(reason: PauseReason): void {
    if (this.phase !== 'running') return;
    this.input.setEnabled(false);
    this.accumulatorMs = 0;
    this.patch({ phase: 'paused', pauseReason: reason });
  }

  /** Resuming always requires an explicit player action. */
  resume(): void {
    if (this.phase !== 'paused') return;
    this.accumulatorMs = 0;
    this.input.setEnabled(true);
    this.patch({ phase: 'running', pauseReason: null });
  }

  togglePause(): void {
    if (this.phase === 'running') this.pause('manual');
    else if (this.phase === 'paused') this.resume();
  }

  /**
   * Test/profiling hook: advances the simulation by `ms` using the real
   * rules and current input, then renders. Only meaningful with `manualClock`.
   */
  advance(ms: number): void {
    const steps = Math.round(ms / STEP_MS);
    for (let i = 0; i < steps && this.phase === 'running'; i++) {
      this.stepOnce();
      this.renderer?.sync(this.sim, 1, STEP_MS);
    }
  }

  renderStats() {
    return this.renderer?.stats() ?? null;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    for (const dispose of this.disposers.splice(0)) dispose();
    this.input.reset();
    if (this.app) {
      this.app.ticker.remove(this.onTick);
      this.renderer?.destroy();
      this.renderer = null;
      this.app.destroy(true, { children: true, texture: false, textureSource: false });
      this.app = null;
    }
  }
}
