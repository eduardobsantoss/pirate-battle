export interface Vec2 {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const TAU = Math.PI * 2;

/**
 * Angle convention: 0 points up (-y), positive angles rotate clockwise.
 * This matches the ship sprites (bow facing up) and Pixi's `rotation`.
 */
export function forwardOf(angle: number): Vec2 {
  return { x: Math.sin(angle), y: -Math.cos(angle) };
}

/** Right-hand side (starboard) unit vector for a heading. */
export function rightOf(angle: number): Vec2 {
  return { x: Math.cos(angle), y: Math.sin(angle) };
}

/** Heading that points from `from` towards `to`. */
export function angleTo(from: Vec2, to: Vec2): number {
  return Math.atan2(to.x - from.x, -(to.y - from.y));
}

/** Normalizes an angle to (-PI, PI]. */
export function wrapAngle(angle: number): number {
  let a = angle % TAU;
  if (a <= -Math.PI) a += TAU;
  else if (a > Math.PI) a -= TAU;
  return a;
}

/** Rotates `current` towards `target` by at most `maxStep` radians. */
export function rotateTowards(current: number, target: number, maxStep: number): number {
  const delta = wrapAngle(target - current);
  if (Math.abs(delta) <= maxStep) return wrapAngle(target);
  return wrapAngle(current + Math.sign(delta) * maxStep);
}

export function distanceSq(a: Vec2, b: Vec2): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

export function distance(a: Vec2, b: Vec2): number {
  return Math.sqrt(distanceSq(a, b));
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function approach(current: number, target: number, maxDelta: number): number {
  if (current < target) return Math.min(target, current + maxDelta);
  return Math.max(target, current - maxDelta);
}

export function pointInRect(p: Vec2, r: Rect, padding = 0): boolean {
  return (
    p.x >= r.x - padding &&
    p.x <= r.x + r.width + padding &&
    p.y >= r.y - padding &&
    p.y <= r.y + r.height + padding
  );
}

export function circleIntersectsRect(c: Vec2, radius: number, r: Rect): boolean {
  const nx = clamp(c.x, r.x, r.x + r.width);
  const ny = clamp(c.y, r.y, r.y + r.height);
  const dx = c.x - nx;
  const dy = c.y - ny;
  return dx * dx + dy * dy < radius * radius;
}

/**
 * Minimal translation that pushes a circle out of a rectangle, or null when
 * they do not overlap.
 */
export function circleRectPushOut(c: Vec2, radius: number, r: Rect): Vec2 | null {
  const nx = clamp(c.x, r.x, r.x + r.width);
  const ny = clamp(c.y, r.y, r.y + r.height);
  let dx = c.x - nx;
  let dy = c.y - ny;
  const d2 = dx * dx + dy * dy;
  if (d2 >= radius * radius) return null;

  if (d2 > 1e-9) {
    const d = Math.sqrt(d2);
    const push = radius - d;
    return { x: (dx / d) * push, y: (dy / d) * push };
  }

  // Center is inside the rectangle: push out through the closest edge.
  const left = c.x - r.x;
  const right = r.x + r.width - c.x;
  const top = c.y - r.y;
  const bottom = r.y + r.height - c.y;
  const min = Math.min(left, right, top, bottom);
  dx = 0;
  dy = 0;
  if (min === left) dx = -(left + radius);
  else if (min === right) dx = right + radius;
  else if (min === top) dy = -(top + radius);
  else dy = bottom + radius;
  return { x: dx, y: dy };
}
