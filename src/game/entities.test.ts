import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../engine/rng';
import {
  collideBulletsEnemies,
  createFireControl,
  createSpawner,
  createWorld,
  FIRE_INTERVAL,
  FLASH_TICKS,
  spawnSmoke,
  tickBullets,
  tickEnemies,
  tickSpawner,
  tickFire,
  tickParticles,
  type Muzzle,
} from './entities';

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

const MUZZLES: Muzzle[] = [
  { x: 100, y: 200, dir: -1 },
  { x: 120, y: 200, dir: 1 },
];

describe('tickFire', () => {
  it('fires one bullet per muzzle when held and off cooldown', () => {
    const w = createWorld(mulberry32(1));
    const fc = createFireControl();
    expect(tickFire(w, fc, MUZZLES, true, DT)).toBe(true);
    expect(fc.cooldown).toBeCloseTo(FIRE_INTERVAL);
    expect(w.bullets.countAlive()).toBe(2);
    const spawned: number[] = [];
    w.bullets.forEachAlive((b) => spawned.push(b.pos.x));
    expect(spawned.sort((a, b) => a - b)).toEqual([100, 120]);
    w.bullets.forEachAlive((b) => {
      expect(b.vel.y).toBe(-420);
      expect(b.radius).toBe(2);
    });
  });

  it('does not fire when not held', () => {
    const w = createWorld(mulberry32(1));
    const fc = createFireControl();
    expect(tickFire(w, fc, MUZZLES, false, DT)).toBe(false);
    expect(w.bullets.countAlive()).toBe(0);
  });

  it('respects the 8/sec cooldown over simulated ticks', () => {
    const w = createWorld(mulberry32(1));
    const fc = createFireControl();
    let shots = 0;
    for (let i = 0; i < 60; i++) if (tickFire(w, fc, MUZZLES, true, DT)) shots++;
    expect(shots).toBe(8); // 8 shots/sec over one simulated second
  });

  it('ejects one shell particle per muzzle per shot, kicked outward', () => {
    const w = createWorld(mulberry32(1));
    const fc = createFireControl();
    tickFire(w, fc, MUZZLES, true, DT);
    const shells: Array<{ x: number; vx: number }> = [];
    w.particles.forEachAlive((p) => shells.push({ x: p.pos.x, vx: p.vel.x }));
    expect(shells.length).toBeGreaterThanOrEqual(2);
    const left = shells.find((s) => s.x === 100)!;
    const right = shells.find((s) => s.x === 120)!;
    expect(left.vx).toBeLessThan(0);   // dir -1 ejects left
    expect(right.vx).toBeGreaterThan(0); // dir +1 ejects right
  });

  it('emits smoke on every third shot', () => {
    const w = createWorld(mulberry32(1));
    const fc = createFireControl();
    const counts: number[] = [];
    for (let shot = 0; shot < 3; shot++) {
      // run ticks until the next shot lands
      let fired = false;
      while (!fired) fired = tickFire(w, fc, MUZZLES, true, DT);
      counts.push(w.particles.countAlive());
    }
    // shots 1 and 2: 2 shells each (some may have expired: DT is small, life 0.4 — none expire)
    // shot 3: 2 shells + 2 smoke
    expect(counts[0]).toBe(2);
    expect(counts[1]).toBe(4);
    expect(counts[2]).toBe(8); // 6 shells + 2 smoke
  });

  it('raises the muzzle flash for FLASH_TICKS and alternates frames', () => {
    const w = createWorld(mulberry32(1));
    const fc = createFireControl();
    tickFire(w, fc, MUZZLES, true, DT);
    expect(fc.flashTicks).toBe(FLASH_TICKS);
    const firstFrame = fc.flashFrame;
    tickFire(w, fc, MUZZLES, false, DT);
    tickFire(w, fc, MUZZLES, false, DT);
    expect(fc.flashTicks).toBe(0);
    // next shot alternates the frame
    let fired = false;
    while (!fired) fired = tickFire(w, fc, MUZZLES, true, DT);
    expect(fc.flashFrame).toBe(firstFrame ^ 1);
  });
});

describe('spawnSmoke', () => {
  it('spawns a 2x2 gray particle with the given lifetime', () => {
    const w = createWorld(mulberry32(1));
    spawnSmoke(w, 10, 20, 0.8);
    expect(w.particles.countAlive()).toBe(1);
    w.particles.forEachAlive((p) => {
      expect(p.size).toBe(2);
      expect(p.life).toBe(0.8);
      expect(p.pos.x).toBe(10);
    });
  });
});

describe('spawner', () => {
  it('spawns boats deterministically for a fixed seed', () => {
    const rng = mulberry32(7);
    const w = createWorld(rng);
    const s = createSpawner(rng);
    expect(s.timer).toBeGreaterThanOrEqual(1.2);
    expect(s.timer).toBeLessThan(2.2);
    for (let i = 0; i < 60 * 10; i++) tickSpawner(w, s, DT); // 10 simulated seconds
    const alive = w.enemies.countAlive();
    expect(alive).toBeGreaterThanOrEqual(4); // 10s / 2.2s max interval
    expect(alive).toBeLessThanOrEqual(9);    // 10s / 1.2s min interval
    w.enemies.forEachAlive((e) => {
      expect(e.hp).toBe(3);
      expect(e.radius).toBe(10);
      expect(e.vel.y).toBe(60);
      expect(e.pos.x).toBeGreaterThanOrEqual(24);
      expect(e.pos.x).toBeLessThanOrEqual(640 - 24);
    });
  });

  it('two spawners with the same seed produce identical positions', () => {
    const runA: number[] = [];
    const runB: number[] = [];
    for (const out of [runA, runB]) {
      const rng = mulberry32(99);
      const w = createWorld(rng);
      const s = createSpawner(rng);
      for (let i = 0; i < 60 * 5; i++) tickSpawner(w, s, DT);
      w.enemies.forEachAlive((e) => out.push(e.pos.x));
    }
    expect(runA).toEqual(runB);
  });
});

describe('collideBulletsEnemies', () => {
  function place(w: ReturnType<typeof createWorld>, hp: number) {
    const e = w.enemies.spawn()!;
    e.pos.x = 100; e.pos.y = 100; e.hp = hp; e.radius = 10;
    const b = w.bullets.spawn()!;
    b.pos.x = 100; b.pos.y = 105; b.radius = 2;
    return { e, b };
  }

  it('hit kills the bullet, decrements hp, sparks 3 particles', () => {
    const w = createWorld(mulberry32(1));
    const { e, b } = place(w, 3);
    const res = collideBulletsEnemies(w);
    expect(res).toEqual({ hits: 1, kills: 0 });
    expect(b.alive).toBe(false);
    expect(e.alive).toBe(true);
    expect(e.hp).toBe(2);
    expect(w.particles.countAlive()).toBe(3);
  });

  it('killing blow explodes: 12 fire + 4 smoke particles', () => {
    const w = createWorld(mulberry32(1));
    const { e } = place(w, 1);
    const res = collideBulletsEnemies(w);
    expect(res).toEqual({ hits: 1, kills: 1 });
    expect(e.alive).toBe(false);
    expect(w.particles.countAlive()).toBe(3 + 12 + 4); // spark + fire + smoke
  });

  it('misses touch nothing', () => {
    const w = createWorld(mulberry32(1));
    const e = w.enemies.spawn()!;
    e.pos.x = 100; e.pos.y = 100; e.hp = 3; e.radius = 10;
    const b = w.bullets.spawn()!;
    b.pos.x = 300; b.pos.y = 300; b.radius = 2;
    const res = collideBulletsEnemies(w);
    expect(res).toEqual({ hits: 0, kills: 0 });
    expect(b.alive).toBe(true);
    expect(e.hp).toBe(3);
  });
});
