/**
 * Central, typed gameplay configuration.
 *
 * Every balancing value used by the simulation lives here. Systems read from a
 * `GameConfig` snapshot taken when a match starts, so changing these numbers
 * never requires touching simulation logic.
 */

export interface WeaponConfig {
  /** Damage applied once per projectile hit. */
  damage: number;
  /** Projectile speed in world px / second. */
  projectileSpeed: number;
  /** Max travel distance in world px before the projectile expires. */
  range: number;
  /** Minimum time between two shots of this weapon, in ms. */
  cooldownMs: number;
}

export interface SideCannonConfig extends WeaponConfig {
  /** Projectiles fired per broadside (parallel shots). */
  count: number;
  /** Distance in px between parallel projectiles, along the hull. */
  spacing: number;
}

export interface ShipStats {
  maxHealth: number;
  /** Max forward speed in px / second. */
  moveSpeed: number;
  /** px / second² used to reach `moveSpeed`. */
  acceleration: number;
  /** Rotation speed in radians / second. */
  turnSpeed: number;
  /** Collision radius in px. */
  radius: number;
}

export interface PlayerConfig extends ShipStats {
  /** px / second² used to slow down when not thrusting. */
  deceleration: number;
  frontCannon: WeaponConfig;
  sideCannons: SideCannonConfig;
}

export interface ChaserConfig extends ShipStats {
  /** Damage dealt to the player when the chaser rams it (then it explodes). */
  contactDamage: number;
}

export interface ShooterConfig extends ShipStats {
  /** Distance at which the shooter starts firing. */
  attackRange: number;
  /** Distance the shooter tries to keep from the player. */
  preferredDistance: number;
  /** Max angle (radians) between heading and target to allow firing. */
  aimTolerance: number;
  cannon: WeaponConfig;
}

export interface SpawnConfig {
  /** Seconds between spawns. */
  intervalSec: number;
  /** Seconds before the first spawn. */
  initialDelaySec: number;
  /** Spawns never happen closer than this to the player (px). */
  minDistanceFromPlayer: number;
  /** Max simultaneous alive enemies; spawns are skipped at the cap. */
  maxAlive: number;
  /** Relative spawn weights. */
  weights: { chaser: number; shooter: number };
  /**
   * Fixed spawn order used for the first spawns of every match, guaranteeing
   * both enemy types show up in a standard match. Afterwards `weights` apply.
   */
  openingSequence: readonly EnemyKind[];
}

export type EnemyKind = 'chaser' | 'shooter';

export interface GameConfig {
  /** Active match duration in seconds. */
  sessionDurationSec: number;
  spawn: SpawnConfig;
  player: PlayerConfig;
  chaser: ChaserConfig;
  shooter: ShooterConfig;
  projectileRadius: number;
}

/** Limits enforced by the Options screen and by `sanitizeOptions`. */
export const OPTION_LIMITS = {
  sessionDurationSec: { min: 60, max: 180, step: 10 },
  spawnIntervalSec: { min: 1, max: 10, step: 0.5 },
} as const;

/** The subset of the configuration players can change in Options. */
export interface PlayerOptions {
  sessionDurationSec: number;
  spawnIntervalSec: number;
}

export const DEFAULT_OPTIONS: PlayerOptions = {
  sessionDurationSec: 120,
  spawnIntervalSec: 3,
};

export const DEFAULT_CONFIG: GameConfig = {
  sessionDurationSec: DEFAULT_OPTIONS.sessionDurationSec,
  spawn: {
    intervalSec: DEFAULT_OPTIONS.spawnIntervalSec,
    initialDelaySec: 1.5,
    minDistanceFromPlayer: 380,
    maxAlive: 8,
    weights: { chaser: 0.5, shooter: 0.5 },
    openingSequence: ['chaser', 'shooter'],
  },
  player: {
    maxHealth: 100,
    moveSpeed: 170,
    acceleration: 240,
    deceleration: 200,
    turnSpeed: 2.4,
    radius: 28,
    frontCannon: { damage: 20, projectileSpeed: 540, range: 520, cooldownMs: 450 },
    sideCannons: {
      damage: 15,
      projectileSpeed: 460,
      range: 380,
      cooldownMs: 1400,
      count: 3,
      spacing: 22,
    },
  },
  chaser: {
    maxHealth: 30,
    moveSpeed: 135,
    acceleration: 200,
    turnSpeed: 2.2,
    radius: 22,
    contactDamage: 15,
  },
  shooter: {
    maxHealth: 50,
    moveSpeed: 100,
    acceleration: 150,
    turnSpeed: 1.6,
    radius: 26,
    attackRange: 400,
    preferredDistance: 260,
    aimTolerance: 0.3,
    cannon: { damage: 8, projectileSpeed: 360, range: 440, cooldownMs: 1800 },
  },
  projectileRadius: 5,
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Coerces arbitrary (possibly persisted / corrupted) values into valid options. */
export function sanitizeOptions(raw: unknown): PlayerOptions {
  const source = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const pick = (key: keyof PlayerOptions, limits: { min: number; max: number }) => {
    const value = source[key];
    return typeof value === 'number' && Number.isFinite(value)
      ? clamp(value, limits.min, limits.max)
      : DEFAULT_OPTIONS[key];
  };
  return {
    sessionDurationSec: pick('sessionDurationSec', OPTION_LIMITS.sessionDurationSec),
    spawnIntervalSec: pick('spawnIntervalSec', OPTION_LIMITS.spawnIntervalSec),
  };
}

/** Builds the immutable config snapshot a match runs with. */
export function createMatchConfig(
  options: PlayerOptions,
  base: GameConfig = DEFAULT_CONFIG,
): Readonly<GameConfig> {
  const safe = sanitizeOptions(options);
  const config: GameConfig = structuredClone(base);
  config.sessionDurationSec = safe.sessionDurationSec;
  config.spawn.intervalSec = safe.spawnIntervalSec;
  return deepFreeze(config);
}

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
