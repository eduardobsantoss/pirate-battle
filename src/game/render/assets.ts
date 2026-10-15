import { Assets, loadTextures, Rectangle, Texture } from 'pixi.js';
import { WATER_TILE } from '../arena';
import type { ShipKind } from '../sim/types';

/**
 * Ship artwork: `ship_N` where color = (N - 1) % 6 and damage stage =
 * floor((N - 1) / 6). Stage 3 is the wreck.
 */
export const SHIP_COLOR: Record<ShipKind, number> = {
  player: 1, // black sails, skull
  chaser: 3, // green
  shooter: 2, // red
};
export const DAMAGE_STAGES = 4;

const TILE_IDS = [
  WATER_TILE,
  // sand 9-slice
  1, 2, 3, 17, 18, 19, 33, 34, 35,
  // grass island
  6, 7, 8, 9, 22, 23, 24, 25, 38, 39, 40, 41, 54, 55, 56, 57,
  // props
  49, 50, 66, 70, 71, 72,
];

const EFFECTS = ['explosion_1', 'explosion_2', 'explosion_3', 'fire_1', 'fire_2'] as const;
const HUD = ['enemy_health_frame', 'enemy_health_fill_green', 'enemy_health_fill_red'] as const;

export type EffectName = (typeof EFFECTS)[number];
export type HudName = (typeof HUD)[number];

export interface GameTextures {
  ships: Record<ShipKind, Texture[]>;
  tiles: Map<number, Texture>;
  cannonBall: Texture;
  effects: Record<EffectName, Texture>;
  hud: Record<HudName, Texture>;
}

type Variant = 'default' | 'retina';

function variant(): Variant {
  return (globalThis.devicePixelRatio ?? 1) >= 1.5 ? 'retina' : 'default';
}

function manifest(v: Variant): Map<string, string> {
  const base = `${import.meta.env.BASE_URL}assets/png/${v}`;
  const entries = new Map<string, string>();
  for (const kind of Object.keys(SHIP_COLOR) as ShipKind[]) {
    for (let stage = 0; stage < DAMAGE_STAGES; stage++) {
      const n = SHIP_COLOR[kind] + 1 + stage * 6;
      entries.set(`ship_${n}`, `${base}/ships/ship_${n}.png`);
    }
  }
  for (const id of TILE_IDS) entries.set(`tile_${id}`, `${base}/tiles/tile_${id}.png`);
  entries.set('cannon_ball', `${base}/ship_parts/cannon_ball.png`);
  for (const e of EFFECTS) entries.set(e, `${base}/effects/${e}.png`);
  for (const h of HUD) entries.set(h, `${base}/ui/hud/${h}.png`);
  return entries;
}

// Decode on the main thread so every request goes through the page (and the
// mock service worker), keeping loading failures observable and testable.
if (loadTextures.config) loadTextures.config.preferWorkers = false;

let cached: GameTextures | null = null;
let attempt = 0;

/**
 * Loads (once) every texture the match needs. Textures are cached for the
 * whole session and reused by every match; a failed load rejects so the UI
 * can show an error and retry before combat starts.
 */
export async function loadGameTextures(onProgress?: (progress: number) => void): Promise<GameTextures> {
  if (cached) {
    onProgress?.(1);
    return cached;
  }
  const v = variant();
  const resolution = v === 'retina' ? 2 : 1;
  const entries = manifest(v);
  // Cache-bust on retries: the loader memoizes failed URLs.
  const suffix = attempt > 0 ? `?retry=${attempt}` : '';
  attempt += 1;

  const urls = [...entries.values()].map((src) => ({
    src: src + suffix,
    data: { resolution },
  }));
  const loaded = (await Assets.load(urls, onProgress)) as Record<string, Texture>;
  const byKey = new Map<string, Texture>();
  for (const [key, src] of entries) {
    const texture = loaded[src + suffix];
    if (!texture) throw new Error(`Missing texture ${key}`);
    byKey.set(key, texture);
  }
  const get = (key: string) => byKey.get(key)!;

  const ships = {} as Record<ShipKind, Texture[]>;
  for (const kind of Object.keys(SHIP_COLOR) as ShipKind[]) {
    ships[kind] = Array.from({ length: DAMAGE_STAGES }, (_, stage) =>
      get(`ship_${SHIP_COLOR[kind] + 1 + stage * 6}`),
    );
  }
  const tiles = new Map(TILE_IDS.map((id) => [id, get(`tile_${id}`)]));
  const effects = Object.fromEntries(EFFECTS.map((e) => [e, get(e)])) as Record<EffectName, Texture>;
  const hud = Object.fromEntries(HUD.map((h) => [h, get(h)])) as Record<HudName, Texture>;

  cached = { ships, tiles, cannonBall: get('cannon_ball'), effects, hud };
  return cached;
}

/** Health fill rect inside the 160×40 enemy health sprites (from ui_sheet.json). */
export const ENEMY_HEALTH_FILL = { x: 24, y: 12, w: 112, h: 15 } as const;
const FILL_STEPS = 40;
const fillCache = new Map<string, Texture>();

/**
 * Returns a sub-texture showing `ratio` of the health fill. Results are
 * quantized and cached so no textures are created per frame.
 */
export function healthFillTexture(source: Texture, key: string, ratio: number): Texture {
  const step = Math.max(0, Math.min(FILL_STEPS, Math.ceil(ratio * FILL_STEPS)));
  const cacheKey = `${key}:${step}`;
  let texture = fillCache.get(cacheKey);
  if (!texture) {
    const width = Math.max(0.01, (ENEMY_HEALTH_FILL.w * step) / FILL_STEPS);
    texture = new Texture({
      source: source.source,
      frame: new Rectangle(
        source.frame.x + ENEMY_HEALTH_FILL.x,
        source.frame.y + ENEMY_HEALTH_FILL.y,
        width,
        ENEMY_HEALTH_FILL.h,
      ),
    });
    fillCache.set(cacheKey, texture);
  }
  return texture;
}
