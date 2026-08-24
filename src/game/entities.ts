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
