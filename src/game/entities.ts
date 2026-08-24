// Flat entity model over fixed pools (engine spec §7): no ECS, no
// allocation in the hot loop. Systems are plain functions over a World.
import { circlesOverlap } from '../engine/collide';
import { createPool, type Pool } from '../engine/pool';
import { HEIGHT, WIDTH } from '../engine/renderer';
import { PALETTE } from './palette';

export interface Vec2 { x: number; y: number; }

export interface Entity {
  kind: 'player' | 'enemy' | 'bullet' | 'pickup' | 'particle';
  pos: Vec2; vel: Vec2;
  hp: number; radius: number;
  age: number; alive: boolean;
}

// Particles carry their own draw data so the render pass is one
// fillRect per particle, no sprite rasterization.
export interface Particle extends Entity {
  kind: 'particle';
  size: number;   // px square
  color: string;  // canvas fillStyle
  life: number;   // seconds until despawn
}

const BULLET_MAX_AGE = 2;
const PARTICLE_DRAG = 2; // fraction of velocity shed per second

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

export interface World {
  bullets: Pool<Entity>;
  enemies: Pool<Entity>;
  particles: Pool<Particle>;
  rng: () => number;
}

export function createWorld(rng: () => number): World {
  return {
    bullets: createPool(64, () => makeEntity('bullet')),
    enemies: createPool(16, () => makeEntity('enemy')),
    particles: createPool(256, makeParticle),
    rng,
  };
}

export function tickBullets(w: World, dt: number): void {
  w.bullets.forEachAlive((b) => {
    b.pos.x += b.vel.x * dt;
    b.pos.y += b.vel.y * dt;
    b.age += dt;
    if (b.pos.y < -8 || b.age > BULLET_MAX_AGE) b.alive = false;
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

export function tickEnemies(w: World, dt: number): void {
  w.enemies.forEachAlive((e) => {
    e.pos.x += e.vel.x * dt;
    e.pos.y += e.vel.y * dt;
    e.age += dt;
    if (e.pos.y > HEIGHT + 16) e.alive = false;
  });
}

export const FIRE_INTERVAL = 0.125; // 8 shots/sec
export const FLASH_TICKS = 2;
const BULLET_SPEED = 420;

// A muzzle is a world-space fire point; dir is which side shells eject.
export interface Muzzle { x: number; y: number; dir: -1 | 1; }

export interface FireControl {
  cooldown: number;   // seconds until next shot allowed
  flashTicks: number; // update ticks the muzzle flash stays visible
  flashFrame: number; // 0 | 1, alternates per shot
  shotCount: number;  // every 3rd shot puffs smoke
}

export function createFireControl(): FireControl {
  return { cooldown: 0, flashTicks: 0, flashFrame: 0, shotCount: 0 };
}

export function tickFire(
  w: World, fc: FireControl, muzzles: Muzzle[], held: boolean, dt: number,
): boolean {
  fc.cooldown = Math.max(0, fc.cooldown - dt);
  if (fc.flashTicks > 0) fc.flashTicks--;
  if (!held || fc.cooldown > 0) return false;
  fc.cooldown = FIRE_INTERVAL;
  fc.flashTicks = FLASH_TICKS;
  fc.flashFrame ^= 1;
  fc.shotCount++;
  for (const m of muzzles) {
    const b = w.bullets.spawn();
    if (b) {
      b.pos.x = m.x; b.pos.y = m.y;
      b.vel.x = 0; b.vel.y = -BULLET_SPEED;
      b.hp = 1; b.radius = 2; b.age = 0;
    }
    spawnShell(w, m);
    if (fc.shotCount % 3 === 0) spawnSmoke(w, m.x, m.y + 4, 0.8);
  }
  return true;
}

function spawnShell(w: World, m: Muzzle): void {
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

// Interim spawner (milestone 7's waves.ts replaces this): boats drop in
// from above on a seeded 1.2–2.2 s cadence.
export interface Spawner { timer: number; }

export function createSpawner(rng: () => number): Spawner {
  return { timer: 1.2 + rng() };
}

export function tickSpawner(w: World, s: Spawner, dt: number): void {
  s.timer -= dt;
  if (s.timer > 0) return;
  s.timer = 1.2 + w.rng();
  const e = w.enemies.spawn();
  if (!e) return;
  e.pos.x = 24 + w.rng() * (WIDTH - 48);
  e.pos.y = -16;
  e.vel.x = 0; e.vel.y = 60;
  e.hp = 3; e.radius = 10; e.age = 0;
}

export interface CollisionResult { hits: number; kills: number; }

export function collideBulletsEnemies(w: World): CollisionResult {
  const result: CollisionResult = { hits: 0, kills: 0 };
  w.bullets.forEachAlive((b) => {
    w.enemies.forEachAlive((e) => {
      if (!b.alive) return; // bullet spent earlier in this pass
      if (!circlesOverlap(b.pos.x, b.pos.y, b.radius, e.pos.x, e.pos.y, e.radius)) return;
      b.alive = false;
      e.hp--;
      result.hits++;
      spawnBurst(w, b.pos.x, b.pos.y, 3, 0.3);
      if (e.hp <= 0) {
        e.alive = false;
        result.kills++;
        spawnBurst(w, e.pos.x, e.pos.y, 12, 0.5);
        for (let i = 0; i < 4; i++) spawnSmoke(w, e.pos.x, e.pos.y, 1.2);
      }
    });
  });
  return result;
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
