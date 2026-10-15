import { Container, Graphics, Sprite, TilingSprite, type Texture } from 'pixi.js';
import { ARENA, islandBounds, islandTiles, TILE_SIZE, WATER_TILE, type ArenaDef } from '../arena';
import type { Simulation } from '../sim/Simulation';
import type { Ship, SimEvent } from '../sim/types';
import { healthFillTexture, type GameTextures } from './assets';
import { EffectLayer } from './effects';

/** Visual scale applied to ship sprites (66×113 artwork). */
const SHIP_SCALE = { player: 0.75, chaser: 0.58, shooter: 0.7 } as const;
const BAR_SCALE = 0.45;
const BAR_OFFSET = 52;
const HIT_FLASH_MS = 120;

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpAngle(a: number, b: number, t: number): number {
  let d = b - a;
  if (d > Math.PI) d -= Math.PI * 2;
  else if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

/** Damage stage 0..2 from remaining health ratio (stage 3 is the wreck). */
export function damageStage(ratio: number): number {
  if (ratio > 0.66) return 0;
  if (ratio > 0.33) return 1;
  return 2;
}

class ShipView {
  readonly body = new Container();
  readonly hull: Sprite;
  readonly fires: Sprite[] = [];
  readonly bar = new Container();
  private readonly barFill: Sprite;
  private lastRatio = -1;
  private stage = -1;
  hitFlashMs = 0;

  constructor(
    private readonly ship: Ship,
    private readonly textures: GameTextures,
  ) {
    this.hull = new Sprite(textures.ships[ship.kind][0]);
    this.hull.anchor.set(0.5, 0.52);
    this.body.addChild(this.hull);
    this.body.scale.set(SHIP_SCALE[ship.kind]);

    // Fire sprites shown as the ship gets damaged.
    const firePositions = [
      { x: -14, y: 10, tex: textures.effects.fire_1 },
      { x: 12, y: -18, tex: textures.effects.fire_2 },
    ];
    for (const f of firePositions) {
      const s = new Sprite(f.tex);
      s.anchor.set(0.5, 0.9);
      s.position.set(f.x, f.y);
      s.visible = false;
      this.fires.push(s);
      this.body.addChild(s);
    }

    const frame = new Sprite(textures.hud.enemy_health_frame);
    frame.anchor.set(0.5);
    this.barFill = new Sprite();
    this.barFill.position.set(-80 + 24, -20 + 12);
    this.bar.addChild(frame, this.barFill);
    this.bar.scale.set(BAR_SCALE);
  }

  sync(alpha: number, timeMs: number): void {
    const s = this.ship;
    const x = lerp(s.prevX, s.x, alpha);
    const y = lerp(s.prevY, s.y, alpha);
    this.body.position.set(x, y);
    this.body.rotation = lerpAngle(s.prevAngle, s.angle, alpha);
    this.bar.position.set(x, y - BAR_OFFSET);

    const ratio = s.health / s.maxHealth;
    if (ratio !== this.lastRatio) {
      this.lastRatio = ratio;
      const fillKey = s.kind === 'player' || ratio > 0.35 ? 'enemy_health_fill_green' : 'enemy_health_fill_red';
      this.barFill.texture = healthFillTexture(this.textures.hud[fillKey], fillKey, ratio);
      const stage = damageStage(ratio);
      if (stage !== this.stage) {
        this.stage = stage;
        this.hull.texture = this.textures.ships[s.kind][stage]!;
        this.fires.forEach((f, i) => (f.visible = stage > i));
      }
    }

    // Flicker fires and flash red when hit.
    for (const f of this.fires) {
      if (f.visible) f.scale.set(0.9 + Math.sin(timeMs / 70 + f.x) * 0.12);
    }
    this.hull.tint = this.hitFlashMs > 0 ? 0xff8080 : 0xffffff;
  }

  destroy(): void {
    this.body.destroy({ children: true });
    this.bar.destroy({ children: true });
  }
}

/**
 * Draws a `Simulation` with Pixi. Read-only with respect to the simulation:
 * it mirrors entity state each frame and turns `SimEvent`s into effects.
 */
export class GameRenderer {
  /** World root; scaled/offset by the controller to fit the canvas. */
  readonly root = new Container();
  private readonly shipLayer = new Container();
  private readonly projectileLayer = new Container();
  private readonly barLayer = new Container();
  private readonly effects: EffectLayer;
  private readonly ships = new Map<number, ShipView>();
  private readonly projectiles = new Map<number, Sprite>();
  private readonly projectilePool: Sprite[] = [];
  private timeMs = 0;

  constructor(
    private readonly textures: GameTextures,
    arena: ArenaDef = ARENA,
  ) {
    this.root.addChild(this.buildArena(arena));
    this.effects = new EffectLayer(textures);
    this.root.addChild(this.effects.under, this.projectileLayer, this.shipLayer, this.effects.over, this.barLayer);
  }

  private buildArena(arena: ArenaDef): Container {
    const layer = new Container();
    const water = new TilingSprite({
      texture: this.tile(WATER_TILE),
      width: arena.width,
      height: arena.height,
    });
    // TilingSprite repeats in texture pixels; keep 1 tile = TILE_SIZE world px.
    water.tileScale.set(TILE_SIZE / this.tile(WATER_TILE).width);
    layer.addChild(water);

    for (const island of arena.islands) {
      const bounds = islandBounds(island);
      islandTiles(island).forEach((row, r) =>
        row.forEach((id, c) => {
          const s = new Sprite(this.tile(id));
          s.position.set(bounds.x + c * TILE_SIZE, bounds.y + r * TILE_SIZE);
          s.setSize(TILE_SIZE, TILE_SIZE);
          layer.addChild(s);
        }),
      );
      for (const prop of island.props ?? []) {
        const s = new Sprite(this.tile(prop.tile));
        s.anchor.set(0.5);
        s.position.set(bounds.x + prop.dx * TILE_SIZE, bounds.y + prop.dy * TILE_SIZE);
        s.setSize(TILE_SIZE * (prop.scale ?? 1), TILE_SIZE * (prop.scale ?? 1));
        layer.addChild(s);
      }
    }

    const border = new Graphics()
      .rect(0, 0, arena.width, arena.height)
      .stroke({ width: 6, color: 0x0d3b52, alpha: 0.6 });
    layer.addChild(border);
    return layer;
  }

  private tile(id: number): Texture {
    const t = this.textures.tiles.get(id);
    if (!t) throw new Error(`Tile ${id} not loaded`);
    return t;
  }

  /** Applies discrete simulation events as visual effects. */
  handleEvents(events: readonly SimEvent[]): void {
    for (const e of events) {
      switch (e.type) {
        case 'shot':
          this.effects.muzzle(e.x, e.y, e.angle, e.weapon !== 'front');
          break;
        case 'hit': {
          this.effects.impact(e.x, e.y);
          const view = this.ships.get(e.targetId);
          if (view) view.hitFlashMs = HIT_FLASH_MS;
          break;
        }
        case 'splash':
          this.effects.splash(e.x, e.y, e.onIsland);
          break;
        case 'destroyed':
          this.effects.explosion(e.x, e.y);
          this.effects.wreck(this.textures.ships[e.kind][3]!, e.x, e.y, this.ships.get(e.id)?.body);
          break;
        default:
          break;
      }
    }
  }

  /**
   * Mirrors the simulation. `alpha` interpolates between the previous and the
   * current step; `dtMs` advances purely visual animations.
   */
  sync(sim: Simulation, alpha: number, dtMs: number): void {
    this.timeMs += dtMs;
    const alive = new Set<number>();
    const ships = sim.player.alive ? [sim.player, ...sim.enemies] : sim.enemies;
    for (const ship of ships) {
      alive.add(ship.id);
      let view = this.ships.get(ship.id);
      if (!view) {
        view = new ShipView(ship, this.textures);
        this.ships.set(ship.id, view);
        this.shipLayer.addChild(view.body);
        this.barLayer.addChild(view.bar);
      }
      view.hitFlashMs = Math.max(0, view.hitFlashMs - dtMs);
      view.sync(alpha, this.timeMs);
    }
    for (const [id, view] of this.ships) {
      if (!alive.has(id)) {
        view.destroy();
        this.ships.delete(id);
      }
    }

    const liveProjectiles = new Set<number>();
    for (const p of sim.projectiles) {
      liveProjectiles.add(p.id);
      let sprite = this.projectiles.get(p.id);
      if (!sprite) {
        sprite = this.projectilePool.pop() ?? this.createProjectileSprite();
        sprite.visible = true;
        this.projectiles.set(p.id, sprite);
      }
      sprite.position.set(lerp(p.prevX, p.x, alpha), lerp(p.prevY, p.y, alpha));
    }
    for (const [id, sprite] of this.projectiles) {
      if (!liveProjectiles.has(id)) {
        sprite.visible = false;
        this.projectilePool.push(sprite);
        this.projectiles.delete(id);
      }
    }

    this.effects.update(dtMs);
  }

  private createProjectileSprite(): Sprite {
    const s = new Sprite(this.textures.cannonBall);
    s.anchor.set(0.5);
    s.scale.set(1.1);
    this.projectileLayer.addChild(s);
    return s;
  }

  /** Counts for profiling / test instrumentation. */
  stats(): { ships: number; projectiles: number; pooled: number; effects: number } {
    return {
      ships: this.ships.size,
      projectiles: this.projectiles.size,
      pooled: this.projectilePool.length,
      effects: this.effects.count,
    };
  }

  destroy(): void {
    for (const view of this.ships.values()) view.destroy();
    this.ships.clear();
    this.projectiles.clear();
    this.projectilePool.length = 0;
    this.effects.destroy();
    // Textures are shared and cached across matches: never destroy them here.
    this.root.destroy({ children: true, texture: false, textureSource: false });
  }
}
