import { islandCollider, type ArenaDef } from '../arena';
import { circleIntersectsRect, circleRectPushOut, clamp, type Rect, type Vec2 } from '../math';

/** Static collision geometry of an arena: world bounds + island rectangles. */
export class Obstacles {
  readonly colliders: readonly Rect[];
  readonly width: number;
  readonly height: number;

  constructor(arena: ArenaDef) {
    this.colliders = arena.islands.map(islandCollider);
    this.width = arena.width;
    this.height = arena.height;
  }

  /** True when a circle overlaps an island or leaves the arena. */
  isBlocked(p: Vec2, radius: number): boolean {
    if (
      p.x - radius < 0 ||
      p.y - radius < 0 ||
      p.x + radius > this.width ||
      p.y + radius > this.height
    ) {
      return true;
    }
    return this.hitsIsland(p, radius);
  }

  hitsIsland(p: Vec2, radius: number): boolean {
    for (const r of this.colliders) {
      if (circleIntersectsRect(p, radius, r)) return true;
    }
    return false;
  }

  isInsideArena(p: Vec2): boolean {
    return p.x >= 0 && p.y >= 0 && p.x <= this.width && p.y <= this.height;
  }

  /**
   * Moves a circle out of every island and back inside the arena.
   * Returns true when a correction happened (i.e. the ship was blocked).
   */
  resolve(p: Vec2, radius: number): boolean {
    let corrected = false;
    // Two passes handle the rare case of being pushed from one island into another.
    for (let pass = 0; pass < 2; pass++) {
      for (const r of this.colliders) {
        const push = circleRectPushOut(p, radius, r);
        if (push) {
          p.x += push.x;
          p.y += push.y;
          corrected = true;
        }
      }
    }
    const x = clamp(p.x, radius, this.width - radius);
    const y = clamp(p.y, radius, this.height - radius);
    if (x !== p.x || y !== p.y) {
      p.x = x;
      p.y = y;
      corrected = true;
    }
    return corrected;
  }
}
