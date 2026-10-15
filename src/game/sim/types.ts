import type { EnemyKind } from '../config';

export type ShipKind = 'player' | EnemyKind;
export type Team = 'player' | 'enemy';
export type WeaponSlot = 'front' | 'left' | 'right';
export type EndReason = 'time' | 'death';
export type MatchStatus = 'running' | 'ended';

export interface Ship {
  readonly id: number;
  readonly kind: ShipKind;
  x: number;
  y: number;
  /** Heading in radians (0 = up, clockwise). */
  angle: number;
  /** Current forward speed in px / second. */
  speed: number;
  health: number;
  readonly maxHealth: number;
  readonly radius: number;
  alive: boolean;
  /** Remaining cooldown per weapon slot, in ms. */
  cooldowns: Record<WeaponSlot, number>;
  /** Previous-step pose, used by the renderer for interpolation. */
  prevX: number;
  prevY: number;
  prevAngle: number;
}

export interface Projectile {
  readonly id: number;
  readonly team: Team;
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  readonly vx: number;
  readonly vy: number;
  readonly damage: number;
  /** Remaining travel distance in px. */
  remaining: number;
  alive: boolean;
}

/** Player intent for one simulation step. */
export interface ShipControls {
  forward: boolean;
  turnLeft: boolean;
  turnRight: boolean;
  fireFront: boolean;
  fireLeft: boolean;
  fireRight: boolean;
}

export const IDLE_CONTROLS: Readonly<ShipControls> = Object.freeze({
  forward: false,
  turnLeft: false,
  turnRight: false,
  fireFront: false,
  fireLeft: false,
  fireRight: false,
});

/**
 * Discrete things that happened during a step. The renderer and audio consume
 * them to play effects; the simulation never depends on them.
 */
export type SimEvent =
  | { type: 'spawn'; id: number; kind: EnemyKind; x: number; y: number }
  | { type: 'shot'; team: Team; weapon: WeaponSlot; x: number; y: number; angle: number }
  | { type: 'hit'; targetId: number; targetKind: ShipKind; x: number; y: number; damage: number }
  | { type: 'splash'; x: number; y: number; onIsland: boolean }
  | { type: 'rammed'; chaserId: number; x: number; y: number }
  | { type: 'destroyed'; id: number; kind: ShipKind; x: number; y: number; scored: boolean }
  | { type: 'score'; score: number }
  | { type: 'ended'; reason: EndReason };

/** Low-frequency summary consumed by the UI (HUD, result screen). */
export interface MatchSummary {
  status: MatchStatus;
  endReason: EndReason | null;
  score: number;
  health: number;
  maxHealth: number;
  elapsedMs: number;
  durationMs: number;
  enemiesAlive: number;
  kills: Record<EnemyKind, number>;
  spawned: Record<EnemyKind, number>;
}
