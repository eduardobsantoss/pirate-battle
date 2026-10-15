import type { ArenaDef } from '../arena';
import type { EnemyKind, GameConfig, ShipStats, WeaponConfig } from '../config';
import {
  angleTo,
  approach,
  distanceSq,
  forwardOf,
  rightOf,
  rotateTowards,
  wrapAngle,
  type Vec2,
} from '../math';
import { createRng, type Rng } from '../rng';
import { Obstacles } from './obstacles';
import type {
  EndReason,
  MatchStatus,
  MatchSummary,
  Projectile,
  Ship,
  ShipControls,
  ShipKind,
  SimEvent,
  Team,
} from './types';

/** Fixed simulation step. Rendering interpolates between steps. */
export const STEP_MS = 1000 / 60;

/** Angles (radians, relative to the desired heading) probed by obstacle avoidance. */
const AVOIDANCE_OFFSETS = [0, 0.4, -0.4, 0.8, -0.8, 1.2, -1.2, 1.7, -1.7, 2.3, -2.3];

/**
 * Pure, deterministic match simulation.
 *
 * It owns all continuous combat state (ships, projectiles, timers, score) and
 * knows nothing about rendering, DOM input or React. Given the same seed,
 * config and sequence of `step` calls it always produces the same result.
 */
export class Simulation {
  readonly config: Readonly<GameConfig>;
  readonly arena: ArenaDef;
  readonly obstacles: Obstacles;
  readonly rng: Rng;

  player: Ship;
  enemies: Ship[] = [];
  projectiles: Projectile[] = [];

  status: MatchStatus = 'running';
  endReason: EndReason | null = null;
  score = 0;
  elapsedMs = 0;
  readonly kills: Record<EnemyKind, number> = { chaser: 0, shooter: 0 };
  readonly spawned: Record<EnemyKind, number> = { chaser: 0, shooter: 0 };

  /** Events produced since the last `drainEvents` call. */
  private events: SimEvent[] = [];
  private nextId = 1;
  private spawnTimerMs: number;
  private spawnCount = 0;

  constructor(config: Readonly<GameConfig>, arena: ArenaDef, seed: number) {
    this.config = config;
    this.arena = arena;
    this.obstacles = new Obstacles(arena);
    this.rng = createRng(seed);
    this.spawnTimerMs = config.spawn.initialDelaySec * 1000;
    this.player = this.createShip('player', config.player, arena.playerSpawn, 0);
  }

  get durationMs(): number {
    return this.config.sessionDurationSec * 1000;
  }

  get remainingMs(): number {
    return Math.max(0, this.durationMs - this.elapsedMs);
  }

  drainEvents(): SimEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }

  summary(): MatchSummary {
    return {
      status: this.status,
      endReason: this.endReason,
      score: this.score,
      health: this.player.health,
      maxHealth: this.player.maxHealth,
      elapsedMs: this.elapsedMs,
      durationMs: this.durationMs,
      enemiesAlive: this.enemies.length,
      kills: { ...this.kills },
      spawned: { ...this.spawned },
    };
  }

  /** Advances the match by `dtMs` (normally `STEP_MS`). No-op once ended. */
  step(dtMs: number, controls: Readonly<ShipControls>): void {
    if (this.status !== 'running') return;
    const dt = dtMs / 1000;

    this.storePreviousPoses();
    this.elapsedMs = Math.min(this.durationMs, this.elapsedMs + dtMs);

    this.updatePlayer(dt, controls);
    this.updateEnemies(dt);
    this.tickCooldowns(dtMs);
    this.firePlayerWeapons(controls);
    this.updateShooterFire();
    this.resolveShipCollisions();
    this.updateProjectiles(dt);
    this.updateSpawner(dtMs);
    this.removeDead();
    this.checkEnd();
  }

  // ---------------------------------------------------------------- creation

  private createShip(kind: ShipKind, stats: ShipStats, at: Vec2, angle: number): Ship {
    return {
      id: this.nextId++,
      kind,
      x: at.x,
      y: at.y,
      prevX: at.x,
      prevY: at.y,
      angle,
      prevAngle: angle,
      speed: 0,
      health: stats.maxHealth,
      maxHealth: stats.maxHealth,
      radius: stats.radius,
      alive: true,
      cooldowns: { front: 0, left: 0, right: 0 },
    };
  }

  private storePreviousPoses(): void {
    const p = this.player;
    p.prevX = p.x;
    p.prevY = p.y;
    p.prevAngle = p.angle;
    for (const e of this.enemies) {
      e.prevX = e.x;
      e.prevY = e.y;
      e.prevAngle = e.angle;
    }
    for (const pr of this.projectiles) {
      pr.prevX = pr.x;
      pr.prevY = pr.y;
    }
  }

  // ------------------------------------------------------------------ player

  private updatePlayer(dt: number, controls: Readonly<ShipControls>): void {
    const p = this.player;
    const cfg = this.config.player;
    const turn = (controls.turnRight ? 1 : 0) - (controls.turnLeft ? 1 : 0);
    p.angle = wrapAngle(p.angle + turn * cfg.turnSpeed * dt);

    const target = controls.forward ? cfg.moveSpeed : 0;
    const rate = controls.forward ? cfg.acceleration : cfg.deceleration;
    p.speed = approach(p.speed, target, rate * dt);
    this.moveShip(p, dt);
  }

  private moveShip(ship: Ship, dt: number): void {
    const dir = forwardOf(ship.angle);
    ship.x += dir.x * ship.speed * dt;
    ship.y += dir.y * ship.speed * dt;
    if (this.obstacles.resolve(ship, ship.radius)) {
      // Scraping along an island bleeds speed so ships don't grind at full speed.
      ship.speed *= 0.9;
    }
  }

  private tickCooldowns(dtMs: number): void {
    const tick = (s: Ship) => {
      s.cooldowns.front = Math.max(0, s.cooldowns.front - dtMs);
      s.cooldowns.left = Math.max(0, s.cooldowns.left - dtMs);
      s.cooldowns.right = Math.max(0, s.cooldowns.right - dtMs);
    };
    tick(this.player);
    for (const e of this.enemies) tick(e);
  }

  private firePlayerWeapons(controls: Readonly<ShipControls>): void {
    const p = this.player;
    const cfg = this.config.player;

    if (controls.fireFront && p.cooldowns.front <= 0) {
      p.cooldowns.front = cfg.frontCannon.cooldownMs;
      const dir = forwardOf(p.angle);
      const origin = { x: p.x + dir.x * (p.radius + 8), y: p.y + dir.y * (p.radius + 8) };
      this.spawnProjectile('player', origin, p.angle, cfg.frontCannon);
      this.events.push({ type: 'shot', team: 'player', weapon: 'front', ...origin, angle: p.angle });
    }

    const broadside = (slot: 'left' | 'right') => {
      if (p.cooldowns[slot] > 0) return;
      const side = cfg.sideCannons;
      p.cooldowns[slot] = side.cooldownMs;
      const sign = slot === 'right' ? 1 : -1;
      const fwd = forwardOf(p.angle);
      const right = rightOf(p.angle);
      const angle = wrapAngle(p.angle + (sign * Math.PI) / 2);
      const half = (side.count - 1) / 2;
      for (let i = 0; i < side.count; i++) {
        const along = (i - half) * side.spacing;
        const origin = {
          x: p.x + fwd.x * along + right.x * sign * (p.radius * 0.7),
          y: p.y + fwd.y * along + right.y * sign * (p.radius * 0.7),
        };
        this.spawnProjectile('player', origin, angle, side);
      }
      this.events.push({ type: 'shot', team: 'player', weapon: slot, x: p.x, y: p.y, angle });
    };
    if (controls.fireLeft) broadside('left');
    if (controls.fireRight) broadside('right');
  }

  private spawnProjectile(team: Team, origin: Vec2, angle: number, weapon: WeaponConfig): void {
    const dir = forwardOf(angle);
    this.projectiles.push({
      id: this.nextId++,
      team,
      x: origin.x,
      y: origin.y,
      prevX: origin.x,
      prevY: origin.y,
      vx: dir.x * weapon.projectileSpeed,
      vy: dir.y * weapon.projectileSpeed,
      damage: weapon.damage,
      remaining: weapon.range,
      alive: true,
    });
  }

  // ----------------------------------------------------------------- enemies

  private updateEnemies(dt: number): void {
    const p = this.player;
    for (const e of this.enemies) {
      const stats = e.kind === 'chaser' ? this.config.chaser : this.config.shooter;
      const toPlayer = angleTo(e, p);
      const distSq = distanceSq(e, p);

      let desiredSpeed = stats.moveSpeed;
      if (e.kind === 'shooter') {
        const preferred = this.config.shooter.preferredDistance;
        // Hold position once close enough; keep turning to aim.
        if (distSq < preferred * preferred) desiredSpeed = 0;
      }

      const heading = desiredSpeed > 0 ? this.steerAroundIslands(e, toPlayer) : toPlayer;
      e.angle = rotateTowards(e.angle, heading, stats.turnSpeed * dt);
      e.speed = approach(e.speed, desiredSpeed, stats.acceleration * dt);
      this.moveShip(e, dt);
    }
  }

  /**
   * Picks the heading closest to `desired` whose short look-ahead ray is free
   * of islands and arena borders.
   */
  private steerAroundIslands(ship: Ship, desired: number): number {
    const probes = [ship.radius + 24, ship.radius + 72];
    for (const offset of AVOIDANCE_OFFSETS) {
      const angle = desired + offset;
      const dir = forwardOf(angle);
      let free = true;
      for (const d of probes) {
        const probe = { x: ship.x + dir.x * d, y: ship.y + dir.y * d };
        if (this.obstacles.isBlocked(probe, ship.radius * 0.8)) {
          free = false;
          break;
        }
      }
      if (free) return wrapAngle(angle);
    }
    return desired;
  }

  private updateShooterFire(): void {
    const cfg = this.config.shooter;
    const p = this.player;
    for (const e of this.enemies) {
      if (e.kind !== 'shooter' || e.cooldowns.front > 0) continue;
      if (distanceSq(e, p) > cfg.attackRange * cfg.attackRange) continue;
      const aim = angleTo(e, p);
      if (Math.abs(wrapAngle(aim - e.angle)) > cfg.aimTolerance) continue;

      e.cooldowns.front = cfg.cannon.cooldownMs;
      const dir = forwardOf(e.angle);
      const origin = { x: e.x + dir.x * (e.radius + 8), y: e.y + dir.y * (e.radius + 8) };
      this.spawnProjectile('enemy', origin, aim, cfg.cannon);
      this.events.push({ type: 'shot', team: 'enemy', weapon: 'front', ...origin, angle: aim });
    }
  }

  // -------------------------------------------------------------- collisions

  private resolveShipCollisions(): void {
    const p = this.player;
    const ships = [p, ...this.enemies];

    // Chasers explode on contact with the player (no score).
    for (const e of this.enemies) {
      if (e.kind !== 'chaser' || !e.alive) continue;
      const r = e.radius + p.radius;
      if (distanceSq(e, p) <= r * r) {
        e.alive = false;
        this.damagePlayer(this.config.chaser.contactDamage, e);
        this.events.push({ type: 'rammed', chaserId: e.id, x: e.x, y: e.y });
        this.events.push({ type: 'destroyed', id: e.id, kind: e.kind, x: e.x, y: e.y, scored: false });
      }
    }

    // Soft separation between remaining ships so they never overlap.
    for (let i = 0; i < ships.length; i++) {
      const a = ships[i]!;
      if (!a.alive) continue;
      for (let j = i + 1; j < ships.length; j++) {
        const b = ships[j]!;
        if (!b.alive) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const min = a.radius + b.radius;
        const d2 = dx * dx + dy * dy;
        if (d2 >= min * min || d2 === 0) continue;
        const d = Math.sqrt(d2);
        const push = (min - d) / 2;
        const nx = dx / d;
        const ny = dy / d;
        a.x -= nx * push;
        a.y -= ny * push;
        b.x += nx * push;
        b.y += ny * push;
        this.obstacles.resolve(a, a.radius);
        this.obstacles.resolve(b, b.radius);
      }
    }
  }

  private updateProjectiles(dt: number): void {
    const radius = this.config.projectileRadius;
    for (const pr of this.projectiles) {
      // A player killed earlier in this step ends the match: no more damage or score.
      if (!this.player.alive) break;
      if (!pr.alive) continue;
      const stepX = pr.vx * dt;
      const stepY = pr.vy * dt;
      pr.x += stepX;
      pr.y += stepY;
      pr.remaining -= Math.hypot(stepX, stepY);

      if (pr.team === 'player') {
        for (const e of this.enemies) {
          if (!e.alive) continue;
          const r = e.radius + radius;
          if (distanceSq(pr, e) <= r * r) {
            pr.alive = false;
            this.damageEnemy(e, pr.damage, pr);
            break;
          }
        }
      } else {
        const p = this.player;
        const r = p.radius + radius;
        if (distanceSq(pr, p) <= r * r) {
          pr.alive = false;
          this.damagePlayer(pr.damage, pr);
        }
      }
      if (!pr.alive) continue;

      if (this.obstacles.hitsIsland(pr, radius)) {
        pr.alive = false;
        this.events.push({ type: 'splash', x: pr.x, y: pr.y, onIsland: true });
      } else if (!this.obstacles.isInsideArena(pr)) {
        pr.alive = false;
      } else if (pr.remaining <= 0) {
        pr.alive = false;
        this.events.push({ type: 'splash', x: pr.x, y: pr.y, onIsland: false });
      }
    }
  }

  private damageEnemy(e: Ship, damage: number, at: Vec2): void {
    e.health = Math.max(0, e.health - damage);
    this.events.push({ type: 'hit', targetId: e.id, targetKind: e.kind, x: at.x, y: at.y, damage });
    if (e.health <= 0 && e.alive) {
      e.alive = false;
      this.score += 1;
      if (e.kind !== 'player') this.kills[e.kind] += 1;
      this.events.push({ type: 'destroyed', id: e.id, kind: e.kind, x: e.x, y: e.y, scored: true });
      this.events.push({ type: 'score', score: this.score });
    }
  }

  private damagePlayer(damage: number, at: Vec2): void {
    const p = this.player;
    if (!p.alive) return;
    p.health = Math.max(0, p.health - damage);
    this.events.push({ type: 'hit', targetId: p.id, targetKind: 'player', x: at.x, y: at.y, damage });
    if (p.health <= 0) {
      p.alive = false;
      this.events.push({ type: 'destroyed', id: p.id, kind: 'player', x: p.x, y: p.y, scored: false });
    }
  }

  // ----------------------------------------------------------------- spawner

  private updateSpawner(dtMs: number): void {
    this.spawnTimerMs -= dtMs;
    if (this.spawnTimerMs > 0) return;
    this.spawnTimerMs += this.config.spawn.intervalSec * 1000;
    if (this.enemies.length >= this.config.spawn.maxAlive) return;

    const kind = this.pickEnemyKind();
    const stats = this.config[kind];
    const at = this.findSpawnPoint(stats.radius);
    if (!at) return;
    const ship = this.createShip(kind, stats, at, angleTo(at, this.player));
    this.enemies.push(ship);
    this.spawnCount += 1;
    this.spawned[kind] += 1;
    this.events.push({ type: 'spawn', id: ship.id, kind, x: at.x, y: at.y });
  }

  private pickEnemyKind(): EnemyKind {
    const opening = this.config.spawn.openingSequence[this.spawnCount];
    if (opening) return opening;
    const { chaser, shooter } = this.config.spawn.weights;
    return this.rng.next() * (chaser + shooter) < chaser ? 'chaser' : 'shooter';
  }

  /**
   * Random free point far enough from the player. Biased towards the arena
   * edges so enemies sail in from the sides. Returns null if nothing fits.
   */
  private findSpawnPoint(radius: number): Vec2 | null {
    const { width, height } = this.obstacles;
    const margin = radius + 16;
    const minDist = this.config.spawn.minDistanceFromPlayer;
    for (const factor of [1, 0.75, 0.5]) {
      const minSq = (minDist * factor) ** 2;
      for (let attempt = 0; attempt < 40; attempt++) {
        const edge = Math.floor(this.rng.next() * 4);
        const along = this.rng.next();
        const depth = this.rng.range(margin, margin + 140);
        const point =
          edge === 0
            ? { x: margin + along * (width - margin * 2), y: depth }
            : edge === 1
              ? { x: width - depth, y: margin + along * (height - margin * 2) }
              : edge === 2
                ? { x: margin + along * (width - margin * 2), y: height - depth }
                : { x: depth, y: margin + along * (height - margin * 2) };

        if (distanceSq(point, this.player) < minSq) continue;
        if (this.obstacles.isBlocked(point, radius + 12)) continue;
        if (this.enemies.some((e) => distanceSq(point, e) < (e.radius + radius + 8) ** 2)) continue;
        return point;
      }
    }
    return null;
  }

  // ------------------------------------------------------------- match rules

  private removeDead(): void {
    this.enemies = this.enemies.filter((e) => e.alive);
    this.projectiles = this.projectiles.filter((p) => p.alive);
  }

  private checkEnd(): void {
    if (!this.player.alive) this.end('death');
    else if (this.elapsedMs >= this.durationMs) this.end('time');
  }

  private end(reason: EndReason): void {
    this.status = 'ended';
    this.endReason = reason;
    this.player.speed = 0;
    for (const e of this.enemies) e.speed = 0;
    this.projectiles = [];
    this.events.push({ type: 'ended', reason });
  }
}
