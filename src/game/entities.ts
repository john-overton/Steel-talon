// Flat entity model over fixed pools (engine spec §7): no ECS, no
// allocation in the hot loop. Systems are plain functions over a World.
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
