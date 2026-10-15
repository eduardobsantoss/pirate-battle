import type { SimEvent } from '../game/sim/types';
import { readJson, STORAGE_PREFIX, writeJson } from '../storage/local';

const SOUNDS = [
  'cannon_broadside',
  'cannon_fire_1',
  'cannon_fire_2',
  'cannon_fire_3',
  'cannonball_water_hit_1',
  'cannonball_water_hit_2',
  'game_complete',
  'game_over',
  'game_pause',
  'game_resume',
  'game_start',
  'score_point',
  'ship_collision',
  'ship_explosion_1',
  'ship_explosion_2',
  'ship_sinking',
  'ship_wood_hit_1',
  'ship_wood_hit_2',
  'time_warning',
  'ui_click',
] as const;

export type SoundName = (typeof SOUNDS)[number];

const VOLUME: Partial<Record<SoundName, number>> = {
  cannonball_water_hit_1: 0.25,
  cannonball_water_hit_2: 0.25,
  cannon_fire_2: 0.5,
  ship_wood_hit_1: 0.6,
  ship_wood_hit_2: 0.6,
  ui_click: 0.5,
};

const MUTE_KEY = `${STORAGE_PREFIX}muted`;
/** Same sound can't retrigger faster than this (avoids stacking on broadsides). */
const MIN_GAP_MS = 45;

/**
 * Tiny Web Audio player. Sounds are optional feedback: any failure (no
 * AudioContext, decode error, autoplay policy) is swallowed silently.
 */
class AudioPlayer {
  private ctx: AudioContext | null = null;
  private buffers = new Map<SoundName, AudioBuffer>();
  private loading: Promise<void> | null = null;
  private lastPlayed = new Map<SoundName, number>();
  muted = readJson<boolean>(MUTE_KEY) ?? false;

  setMuted(muted: boolean): void {
    this.muted = muted;
    writeJson(MUTE_KEY, muted);
  }

  private context(): AudioContext | null {
    if (this.ctx) return this.ctx;
    const Ctor = globalThis.AudioContext;
    if (!Ctor) return null;
    try {
      this.ctx = new Ctor();
    } catch {
      return null;
    }
    return this.ctx;
  }

  /** Starts fetching/decoding every sound (call after a user gesture). */
  preload(): void {
    if (this.loading) return;
    const ctx = this.context();
    if (!ctx) return;
    this.loading = Promise.all(
      SOUNDS.map(async (name) => {
        try {
          const res = await fetch(`${import.meta.env.BASE_URL}assets/sounds/${name}.wav`);
          if (!res.ok) return;
          this.buffers.set(name, await ctx.decodeAudioData(await res.arrayBuffer()));
        } catch {
          // optional asset
        }
      }),
    ).then(() => undefined);
  }

  play(name: SoundName): void {
    if (this.muted) return;
    const ctx = this.context();
    if (!ctx) return;
    if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined);
    const buffer = this.buffers.get(name);
    if (!buffer) {
      this.preload();
      return;
    }
    const now = performance.now();
    if (now - (this.lastPlayed.get(name) ?? 0) < MIN_GAP_MS) return;
    this.lastPlayed.set(name, now);
    const source = ctx.createBufferSource();
    const gain = ctx.createGain();
    gain.gain.value = VOLUME[name] ?? 0.8;
    source.buffer = buffer;
    source.connect(gain).connect(ctx.destination);
    source.start();
  }

  playEvents(events: readonly SimEvent[]): void {
    for (const e of events) {
      switch (e.type) {
        case 'shot':
          if (e.weapon !== 'front') this.play('cannon_broadside');
          else this.play(e.team === 'player' ? (Math.random() < 0.5 ? 'cannon_fire_1' : 'cannon_fire_3') : 'cannon_fire_2');
          break;
        case 'hit':
          this.play(Math.random() < 0.5 ? 'ship_wood_hit_1' : 'ship_wood_hit_2');
          break;
        case 'splash':
          if (!e.onIsland) this.play(Math.random() < 0.5 ? 'cannonball_water_hit_1' : 'cannonball_water_hit_2');
          break;
        case 'rammed':
          this.play('ship_collision');
          break;
        case 'destroyed':
          this.play(e.kind === 'player' ? 'ship_sinking' : Math.random() < 0.5 ? 'ship_explosion_1' : 'ship_explosion_2');
          break;
        case 'score':
          this.play('score_point');
          break;
        default:
          break;
      }
    }
  }
}

export const audio = new AudioPlayer();
