// Flat entity model over fixed pools (engine spec §7): no ECS, no
// allocation in the hot loop. Systems are plain functions over a World.
import { circlesOverlap } from '../engine/collide';
import { createPool, type Pool } from '../engine/pool';
import { HEIGHT } from '../engine/renderer';
import { PALETTE } from './palette';

export interface Vec2 { x: number; y: number; }

export interface Entity {
  kind: 'player' | 'enemy' | 'bullet' | 'pickup' | 'particle';
  pos: Vec2; vel: Vec2;
  hp: number; radius: number;
  age: number; alive: boolean;
}

// Camera-relative despawn band: entities die once they scroll this far
// past the visible 640x480 viewport (above or below camY..camY+HEIGHT).
export const CAM_MARGIN = 64;

// Particles carry their own draw data so the render pass is one
// fillRect per particle, no sprite rasterization.
export interface Particle extends Entity {
  kind: 'particle';
  size: number;   // px square
  color: string;  // canvas fillStyle
  life: number;   // seconds until despawn
}

export interface Bullet extends Entity {
  kind: 'bullet';
  dmg: number;
  splash: boolean;      // on hit, damage enemies within SPLASH_RADIUS by 1
  homing: boolean;      // steer toward nearest enemy (turn-rate capped)
  accel: number;        // px/s² along current velocity direction
  trail: boolean;       // emit smoke every TRAIL_TICKS
  trailCount: number;
}

export interface Enemy extends Entity {
  kind: 'enemy';
  enemyKind: 'boat' | 'delta';
  fireTimer: number;    // boats: seconds to next aimed shot
  baseX: number;        // deltas: weave center
  hasFired: boolean;    // deltas: single shot latch
  score: number;
  salvageChance: number;
}

export type PickupKind = 'minigun' | 'rockets' | 'crate' | 'salvage';

export interface Pickup extends Entity {
  kind: 'pickup';
  pickupKind: PickupKind;
}

const BULLET_MAX_AGE = 2;
const PARTICLE_DRAG = 2; // fraction of velocity shed per second
const HOMING_TURN_RATE = 3.5; // rad/s
const TRAIL_TICKS = 4;
const MAGNET_RADIUS = 112;
const MAGNET_SPEED = 440;

function makeEntity(kind: Entity['kind']): Entity {
  return {
    kind,
    pos: { x: 0, y: 0 }, vel: { x: 0, y: 0 },
    hp: 0, radius: 0, age: 0, alive: false,
  };
}

function makeParticle(): Particle {
  return { ...makeEntity('particle'), kind: 'particle', size: 1, color: PALETTE[21], life: 0 };
}

function makeBullet(): Bullet {
  return {
    ...makeEntity('bullet'), kind: 'bullet',
    dmg: 1, splash: false, homing: false, accel: 0, trail: false, trailCount: 0,
  };
}

function makeEnemy(): Enemy {
  return {
    ...makeEntity('enemy'), kind: 'enemy',
    enemyKind: 'boat', fireTimer: 0, baseX: 0, hasFired: false, score: 0, salvageChance: 0,
  };
}

function makePickup(): Pickup {
  return { ...makeEntity('pickup'), kind: 'pickup', pickupKind: 'salvage' };
}

export interface World {
  bullets: Pool<Bullet>;
  enemyBullets: Pool<Entity>;
  enemies: Pool<Enemy>;
  pickups: Pool<Pickup>;
  particles: Pool<Particle>;
  rng: () => number;
}

export function createWorld(rng: () => number): World {
  return {
    bullets: createPool(64, makeBullet),
    enemyBullets: createPool(64, () => makeEntity('bullet')),
    enemies: createPool(16, makeEnemy),
    pickups: createPool(16, makePickup),
    particles: createPool(256, makeParticle),
    rng,
  };
}

function nearestEnemy(w: World, x: number, y: number): Enemy | undefined {
  let best: Enemy | undefined;
  let bestDistSq = Infinity;
  w.enemies.forEachAlive((e) => {
    const dx = e.pos.x - x;
    const dy = e.pos.y - y;
    const distSq = dx * dx + dy * dy;
    if (distSq < bestDistSq) {
      bestDistSq = distSq;
      best = e;
    }
  });
  return best;
}

export function tickBullets(w: World, dt: number, camY: number): void {
  w.bullets.forEachAlive((b) => {
    if (b.homing) {
      const target = nearestEnemy(w, b.pos.x, b.pos.y);
      if (target) {
        const speed = Math.hypot(b.vel.x, b.vel.y);
        const current = Math.atan2(b.vel.y, b.vel.x);
        const desired = Math.atan2(target.pos.y - b.pos.y, target.pos.x - b.pos.x);
        let diff = desired - current;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        const maxTurn = HOMING_TURN_RATE * dt;
        const turn = Math.max(-maxTurn, Math.min(maxTurn, diff));
        const next = current + turn;
        b.vel.x = Math.cos(next) * speed;
        b.vel.y = Math.sin(next) * speed;
      }
    }
    if (b.accel !== 0) {
      const s = Math.hypot(b.vel.x, b.vel.y);
      if (s !== 0) {
        const scale = (s + b.accel * dt) / s;
        b.vel.x *= scale;
        b.vel.y *= scale;
      }
    }
    b.pos.x += b.vel.x * dt;
    b.pos.y += b.vel.y * dt;
    b.age += dt;
    if (b.trail && b.trailCount++ % TRAIL_TICKS === 0) spawnTrailSmoke(w, b.pos.x, b.pos.y);
    if (b.pos.y < camY - CAM_MARGIN || b.pos.y > camY + HEIGHT + CAM_MARGIN || b.age > BULLET_MAX_AGE) {
      b.alive = false;
    }
  });
}

export function tickEnemyBullets(w: World, dt: number, camY: number): void {
  w.enemyBullets.forEachAlive((b) => {
    b.pos.x += b.vel.x * dt;
    b.pos.y += b.vel.y * dt;
    b.age += dt;
    if (b.pos.y < camY - CAM_MARGIN || b.pos.y > camY + HEIGHT + CAM_MARGIN) b.alive = false;
  });
}

export function tickParticles(w: World, dt: number): void {
  w.particles.forEachAlive((p) => {
    p.pos.x += p.vel.x * dt;
    p.pos.y += p.vel.y * dt;
    p.vel.x *= 1 - PARTICLE_DRAG * dt;
    p.vel.y *= 1 - PARTICLE_DRAG * dt;
    p.age += dt;
    if (p.age >= p.life) p.alive = false;
  });
}

const BOAT_SHOT_SPEED = 280;
const DELTA_SHOT_RANGE = 440;

export function tickEnemies(w: World, dt: number, camY: number, player: Vec2): void {
  w.enemies.forEachAlive((e) => {
    e.age += dt;
    if (e.enemyKind === 'delta') {
      e.pos.x = e.baseX + Math.sin(e.age * 2.2) * 56;
      e.pos.y += e.vel.y * dt;
    } else {
      e.pos.x += e.vel.x * dt;
      e.pos.y += e.vel.y * dt;
    }

    if (e.enemyKind === 'boat') {
      e.fireTimer -= dt;
      if (e.fireTimer <= 0 && e.pos.y >= camY && e.pos.y <= camY + HEIGHT) {
        const b = w.enemyBullets.spawn();
        if (b) {
          const dx = player.x - e.pos.x;
          const dy = player.y - e.pos.y;
          const dist = Math.hypot(dx, dy);
          b.pos.x = e.pos.x; b.pos.y = e.pos.y; b.age = 0; b.radius = 4;
          if (dist === 0) {
            b.vel.x = 0; b.vel.y = BOAT_SHOT_SPEED;
          } else {
            b.vel.x = (dx / dist) * BOAT_SHOT_SPEED;
            b.vel.y = (dy / dist) * BOAT_SHOT_SPEED;
          }
        }
        e.fireTimer = 2.0 + w.rng() * 0.8;
      }
    } else if (e.enemyKind === 'delta') {
      if (!e.hasFired && Math.abs(player.y - e.pos.y) < DELTA_SHOT_RANGE) {
        const b = w.enemyBullets.spawn();
        if (b) {
          b.pos.x = e.pos.x; b.pos.y = e.pos.y; b.age = 0; b.radius = 4;
          b.vel.x = 0; b.vel.y = 400;
        }
        e.hasFired = true;
      }
    }

    if (e.pos.y > camY + HEIGHT + CAM_MARGIN) e.alive = false;
  });
}

export function tickPickups(w: World, dt: number, camY: number, player: Vec2): void {
  w.pickups.forEachAlive((p) => {
    const dx = player.x - p.pos.x;
    const dy = player.y - p.pos.y;
    if (dx * dx + dy * dy < MAGNET_RADIUS * MAGNET_RADIUS) {
      const dist = Math.hypot(dx, dy) || 1;
      p.vel.x = (dx / dist) * MAGNET_SPEED;
      p.vel.y = (dy / dist) * MAGNET_SPEED;
    }
    p.pos.x += p.vel.x * dt;
    p.pos.y += p.vel.y * dt;
    p.age += dt;
    if (p.pos.y > camY + HEIGHT + CAM_MARGIN) p.alive = false;
  });
}

// A muzzle is a world-space fire point; dir is which side shells eject.
export interface Muzzle { x: number; y: number; dir: -1 | 1; }

export function spawnShell(w: World, m: Muzzle): void {
  const p = w.particles.spawn();
  if (!p) return;
  p.pos.x = m.x; p.pos.y = m.y;
  p.vel.x = m.dir * (30 + w.rng() * 30); // kicked outward
  p.vel.y = 40 + w.rng() * 40;           // falls down-screen
  p.size = 1; p.color = PALETTE[6]; p.life = 0.4; p.age = 0;
}

export function spawnSmoke(w: World, x: number, y: number, life: number): void {
  const p = w.particles.spawn();
  if (!p) return;
  p.pos.x = x; p.pos.y = y;
  p.vel.x = w.rng() * 10 - 5;
  p.vel.y = 30 + w.rng() * 20; // drifts behind (down-screen)
  p.size = 2;
  p.color = w.rng() < 0.5 ? PALETTE[24] : PALETTE[25];
  p.life = life; p.age = 0;
}

export function spawnTrailSmoke(w: World, x: number, y: number): void {
  const p = w.particles.spawn();
  if (!p) return;
  p.pos.x = x; p.pos.y = y;
  p.vel.x = w.rng() * 8 - 4;
  p.vel.y = 20;
  p.size = 1;
  p.color = PALETTE[24];
  p.life = 0.4; p.age = 0;
}

export function spawnBoat(w: World, x: number, y: number): Enemy | undefined {
  const e = w.enemies.spawn();
  if (!e) return undefined;
  e.enemyKind = 'boat';
  e.pos.x = x; e.pos.y = y;
  e.vel.x = 0; e.vel.y = 80;
  e.hp = 3; e.radius = 20; e.age = 0;
  e.fireTimer = 2.0 + w.rng() * 0.8;
  e.baseX = x; e.hasFired = false;
  e.score = 100; e.salvageChance = 0.25;
  return e;
}

export function spawnDelta(w: World, x: number, y: number): Enemy | undefined {
  const e = w.enemies.spawn();
  if (!e) return undefined;
  e.enemyKind = 'delta';
  e.pos.x = x; e.pos.y = y;
  e.vel.x = 0; e.vel.y = 240;
  e.hp = 2; e.radius = 16; e.age = 0;
  e.baseX = x; e.hasFired = false; e.fireTimer = 0;
  e.score = 150; e.salvageChance = 0.40;
  return e;
}

const PICKUP_RADIUS: Record<PickupKind, number> = {
  minigun: 28, rockets: 28, crate: 16, salvage: 12,
};
const PICKUP_VY: Record<PickupKind, number> = {
  minigun: 80, rockets: 80, crate: 90, salvage: 60,
};

export function spawnPickup(w: World, kind: PickupKind, x: number, y: number): Pickup | undefined {
  const p = w.pickups.spawn();
  if (!p) return undefined;
  p.pickupKind = kind;
  p.pos.x = x; p.pos.y = y;
  p.vel.x = 0; p.vel.y = PICKUP_VY[kind];
  p.radius = PICKUP_RADIUS[kind];
  p.hp = 0; p.age = 0;
  return p;
}

export const SPLASH_RADIUS = 48;

export interface CollisionResult { hits: number; kills: number; score: number; }

// Reused across calls to avoid a per-tick allocation; callers must not
// retain the returned reference past their next call to this function.
const collisionResult: CollisionResult = { hits: 0, kills: 0, score: 0 };

function killEnemy(w: World, e: Enemy, result: CollisionResult): void {
  e.alive = false;
  result.kills++;
  result.score += e.score;
  spawnBurst(w, e.pos.x, e.pos.y, 12, 0.5);
  for (let i = 0; i < 4; i++) spawnSmoke(w, e.pos.x, e.pos.y, 1.2);
  if (w.rng() < e.salvageChance) spawnPickup(w, 'salvage', e.pos.x, e.pos.y);
}

export function collideBulletsEnemies(w: World): CollisionResult {
  const result = collisionResult;
  result.hits = 0;
  result.kills = 0;
  result.score = 0;
  w.bullets.forEachAlive((b) => {
    w.enemies.forEachAlive((e) => {
      if (!b.alive) return; // bullet spent earlier in this pass
      if (!circlesOverlap(b.pos.x, b.pos.y, b.radius, e.pos.x, e.pos.y, e.radius)) return;
      const wasSplash = b.splash;
      const impactX = b.pos.x;
      const impactY = b.pos.y;
      b.alive = false;
      e.hp -= b.dmg;
      result.hits++;
      spawnBurst(w, impactX, impactY, 3, 0.3);
      if (e.hp <= 0) {
        killEnemy(w, e, result);
      }
      if (wasSplash) {
        w.enemies.forEachAlive((other) => {
          if (other === e || !other.alive) return;
          const dx = other.pos.x - impactX;
          const dy = other.pos.y - impactY;
          if (dx * dx + dy * dy > SPLASH_RADIUS * SPLASH_RADIUS) return;
          other.hp -= 1;
          if (other.hp <= 0) killEnemy(w, other, result);
        });
      }
    });
  });
  return result;
}

export function collideEnemyBulletsPlayer(
  w: World, player: Vec2, radius: number, invulnerable: boolean,
): boolean {
  if (invulnerable) return false;
  let hit = false;
  w.enemyBullets.forEachAlive((b) => {
    if (hit || !b.alive) return;
    if (!circlesOverlap(b.pos.x, b.pos.y, b.radius, player.x, player.y, radius)) return;
    b.alive = false;
    spawnBurst(w, b.pos.x, b.pos.y, 3, 0.3);
    hit = true;
  });
  return hit;
}

export function collideEnemiesPlayer(
  w: World, player: Vec2, radius: number, invulnerable: boolean,
): boolean {
  if (invulnerable) return false;
  let hit = false;
  w.enemies.forEachAlive((e) => {
    if (hit || !e.alive) return;
    if (!circlesOverlap(e.pos.x, e.pos.y, e.radius, player.x, player.y, radius)) return;
    spawnBurst(w, e.pos.x, e.pos.y, 3, 0.3);
    hit = true;
  });
  return hit;
}

export function collidePickupsPlayer(
  w: World, player: Vec2, radius: number, onCollect: (kind: PickupKind) => void,
): void {
  w.pickups.forEachAlive((p) => {
    if (!p.alive) return;
    if (!circlesOverlap(p.pos.x, p.pos.y, p.radius, player.x, player.y, radius)) return;
    p.alive = false;
    onCollect(p.pickupKind);
  });
}

const FIRE_COLORS = [PALETTE[21], PALETTE[8], PALETTE[5]]; // white, yellow, orange

function spawnBurst(w: World, x: number, y: number, count: number, life: number): void {
  for (let i = 0; i < count; i++) {
    const p = w.particles.spawn();
    if (!p) return;
    const angle = w.rng() * Math.PI * 2;
    const speed = 40 + w.rng() * 100;
    p.pos.x = x; p.pos.y = y;
    p.vel.x = Math.cos(angle) * speed;
    p.vel.y = Math.sin(angle) * speed;
    p.size = w.rng() < 0.5 ? 1 : 2;
    p.color = FIRE_COLORS[Math.floor(w.rng() * FIRE_COLORS.length)];
    p.life = life; p.age = 0;
  }
}
