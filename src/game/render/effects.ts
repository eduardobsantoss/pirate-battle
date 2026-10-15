import { Container, Graphics, Sprite, type Texture } from 'pixi.js';
import type { GameTextures } from './assets';

interface Effect {
  display: Container;
  ageMs: number;
  lifeMs: number;
  /** `t` goes from 0 to 1 over the effect lifetime. */
  update(t: number): void;
}

/**
 * Short-lived visual effects (muzzle flashes, impacts, splashes, explosions,
 * sinking wrecks). Purely cosmetic: they never feed back into the simulation.
 */
export class EffectLayer {
  /** Drawn below ships (wrecks, water splashes). */
  readonly under = new Container();
  /** Drawn above ships (flashes, explosions). */
  readonly over = new Container();
  private active: Effect[] = [];

  constructor(private readonly textures: GameTextures) {}

  get count(): number {
    return this.active.length;
  }

  private add(layer: Container, effect: Effect): void {
    layer.addChild(effect.display);
    effect.update(0);
    this.active.push(effect);
  }

  private sprite(texture: Texture, x: number, y: number): Sprite {
    const s = new Sprite(texture);
    s.anchor.set(0.5);
    s.position.set(x, y);
    return s;
  }

  muzzle(x: number, y: number, angle: number, broadside: boolean): void {
    const s = this.sprite(this.textures.effects.explosion_3, x, y);
    s.rotation = angle;
    const base = broadside ? 0.55 : 0.4;
    this.add(this.over, {
      display: s,
      ageMs: 0,
      lifeMs: 160,
      update: (t) => {
        s.scale.set(base * (0.6 + t * 0.6));
        s.alpha = 1 - t;
      },
    });
  }

  impact(x: number, y: number): void {
    const s = this.sprite(this.textures.effects.explosion_2, x, y);
    this.add(this.over, {
      display: s,
      ageMs: 0,
      lifeMs: 260,
      update: (t) => {
        s.scale.set(0.3 + t * 0.25);
        s.alpha = 1 - t * t;
      },
    });
  }

  splash(x: number, y: number, onIsland: boolean): void {
    const g = new Graphics();
    g.position.set(x, y);
    const color = onIsland ? 0xc9a36b : 0xffffff;
    this.add(this.under, {
      display: g,
      ageMs: 0,
      lifeMs: 420,
      update: (t) => {
        g.clear()
          .circle(0, 0, 4 + t * 14)
          .stroke({ width: 3 * (1 - t) + 0.5, color, alpha: 0.85 * (1 - t) });
      },
    });
  }

  explosion(x: number, y: number): void {
    const frames = [
      this.textures.effects.explosion_3,
      this.textures.effects.explosion_2,
      this.textures.effects.explosion_1,
    ];
    const s = this.sprite(frames[0]!, x, y);
    this.add(this.over, {
      display: s,
      ageMs: 0,
      lifeMs: 650,
      update: (t) => {
        s.texture = frames[Math.min(frames.length - 1, Math.floor(t * frames.length * 1.4))]!;
        s.scale.set(0.8 + t * 0.5);
        s.alpha = t < 0.6 ? 1 : 1 - (t - 0.6) / 0.4;
      },
    });
  }

  /** Sinking wreck left where a ship was destroyed. */
  wreck(texture: Texture, x: number, y: number, from?: Container): void {
    const s = this.sprite(texture, x, y);
    const scale = from?.scale.x ?? 0.6;
    s.rotation = from?.rotation ?? 0;
    this.add(this.under, {
      display: s,
      ageMs: 0,
      lifeMs: 1800,
      update: (t) => {
        s.scale.set(scale * (1 - t * 0.25));
        s.alpha = 1 - t;
      },
    });
  }

  update(dtMs: number): void {
    if (this.active.length === 0) return;
    const keep: Effect[] = [];
    for (const e of this.active) {
      e.ageMs += dtMs;
      if (e.ageMs >= e.lifeMs) {
        e.display.destroy();
      } else {
        e.update(e.ageMs / e.lifeMs);
        keep.push(e);
      }
    }
    this.active = keep;
  }

  destroy(): void {
    for (const e of this.active) e.display.destroy();
    this.active = [];
  }
}
