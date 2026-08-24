import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../engine/rng';
import { createWorld, tickBullets, tickEnemies, tickParticles } from './entities';

const DT = 1 / 60;

describe('world', () => {
  it('creates pools of the specified sizes, all dead', () => {
    const w = createWorld(mulberry32(1));
    expect(w.bullets.items).toHaveLength(64);
    expect(w.enemies.items).toHaveLength(16);
    expect(w.particles.items).toHaveLength(256);
    expect(w.bullets.countAlive()).toBe(0);
  });
});

describe('tickBullets', () => {
  it('moves bullets by velocity and ages them', () => {
    const w = createWorld(mulberry32(1));
    const b = w.bullets.spawn()!;
    b.pos.x = 100; b.pos.y = 100; b.vel.x = 0; b.vel.y = -420; b.age = 0;
    tickBullets(w, DT);
    expect(b.pos.y).toBeCloseTo(100 - 420 * DT);
    expect(b.age).toBeCloseTo(DT);
  });

  it('despawns bullets above the screen', () => {
    const w = createWorld(mulberry32(1));
    const b = w.bullets.spawn()!;
    b.pos.y = -9; b.vel.y = 0;
    tickBullets(w, DT);
    expect(b.alive).toBe(false);
  });

  it('despawns bullets older than 2 seconds', () => {
    const w = createWorld(mulberry32(1));
    const b = w.bullets.spawn()!;
    b.pos.y = 200; b.vel.y = 0; b.age = 2.01;
    tickBullets(w, DT);
    expect(b.alive).toBe(false);
  });
});

describe('tickParticles', () => {
  it('moves, drags, and expires particles at end of life', () => {
    const w = createWorld(mulberry32(1));
    const p = w.particles.spawn()!;
    p.pos.x = 50; p.pos.y = 50; p.vel.x = 60; p.vel.y = 0; p.life = 0.1; p.age = 0;
    tickParticles(w, DT);
    expect(p.pos.x).toBeCloseTo(50 + 60 * DT);
    expect(p.vel.x).toBeLessThan(60); // drag
    expect(p.alive).toBe(true);
    for (let i = 0; i < 6; i++) tickParticles(w, DT); // past 0.1s
    expect(p.alive).toBe(false);
  });
});

describe('tickEnemies', () => {
  it('moves enemies and despawns them below the screen', () => {
    const w = createWorld(mulberry32(1));
    const e = w.enemies.spawn()!;
    e.pos.x = 320; e.pos.y = 100; e.vel.y = 60;
    tickEnemies(w, DT);
    expect(e.pos.y).toBeCloseTo(100 + 60 * DT);
    e.pos.y = 497; // HEIGHT (480) + 16 = 496 threshold
    tickEnemies(w, DT);
    expect(e.alive).toBe(false);
  });
});
