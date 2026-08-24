import { describe, expect, it } from 'vitest';
import { HEIGHT } from '../engine/renderer';
import { mulberry32 } from '../engine/rng';
import {
  CAM_MARGIN,
  collideBulletsEnemies,
  createFireControl,
  createWorld,
  FIRE_INTERVAL,
  FLASH_TICKS,
  spawnBoat,
  spawnDelta,
  spawnPickup,
  spawnSmoke,
  tickBullets,
  tickEnemies,
  tickEnemyBullets,
  tickFire,
  tickParticles,
  tickPickups,
  type Muzzle,
} from './entities';

const DT = 1 / 60;

describe('world', () => {
  it('creates pools of the specified sizes, all dead', () => {
    const w = createWorld(mulberry32(1));
    expect(w.bullets.items).toHaveLength(64);
    expect(w.enemyBullets.items).toHaveLength(64);
    expect(w.enemies.items).toHaveLength(16);
    expect(w.pickups.items).toHaveLength(16);
    expect(w.particles.items).toHaveLength(256);
    expect(w.bullets.countAlive()).toBe(0);
  });
});

describe('tickBullets', () => {
  it('moves bullets by velocity and ages them', () => {
    const w = createWorld(mulberry32(1));
    const b = w.bullets.spawn()!;
    b.pos.x = 100; b.pos.y = 100; b.vel.x = 0; b.vel.y = -420; b.age = 0;
    tickBullets(w, DT, 0);
    expect(b.pos.y).toBeCloseTo(100 - 420 * DT);
    expect(b.age).toBeCloseTo(DT);
  });

  it('despawns bullets above the camera band', () => {
    const w = createWorld(mulberry32(1));
    const b = w.bullets.spawn()!;
    b.pos.y = -CAM_MARGIN - 1; b.vel.y = 0;
    tickBullets(w, DT, 0);
    expect(b.alive).toBe(false);
  });

  it('despawns bullets older than 2 seconds', () => {
    const w = createWorld(mulberry32(1));
    const b = w.bullets.spawn()!;
    b.pos.y = 200; b.vel.y = 0; b.age = 2.01;
    tickBullets(w, DT, 0);
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
  it('moves enemies and despawns them below the camera band', () => {
    const w = createWorld(mulberry32(1));
    const e = spawnBoat(w, 320, 100)!;
    e.vel.y = 60;
    tickEnemies(w, DT, 0, { x: 320, y: 400 });
    expect(e.pos.y).toBeCloseTo(100 + 60 * DT);
    e.pos.y = HEIGHT + CAM_MARGIN + 1;
    tickEnemies(w, DT, 0, { x: 320, y: 400 });
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

describe('collideBulletsEnemies', () => {
  function place(w: ReturnType<typeof createWorld>, hp: number) {
    const e = w.enemies.spawn()!;
    e.pos.x = 100; e.pos.y = 100; e.hp = hp; e.radius = 10;
    const b = w.bullets.spawn()!;
    b.pos.x = 100; b.pos.y = 105; b.radius = 2; b.dmg = 1;
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

describe('typed spawns', () => {
  it('spawnBoat fills boat fields', () => {
    const w = createWorld(mulberry32(1));
    const e = spawnBoat(w, 100, -16);
    expect(e).toBeDefined();
    expect(e!.enemyKind).toBe('boat');
    expect(e!.hp).toBe(3);
    expect(e!.radius).toBe(10);
    expect(e!.vel).toEqual({ x: 0, y: 40 });
    expect(e!.score).toBe(100);
    expect(e!.salvageChance).toBeCloseTo(0.25);
    expect(e!.fireTimer).toBeGreaterThanOrEqual(2.0);
    expect(e!.fireTimer).toBeLessThanOrEqual(2.8);
  });

  it('spawnDelta fills delta fields', () => {
    const w = createWorld(mulberry32(1));
    const e = spawnDelta(w, 200, -16);
    expect(e!.enemyKind).toBe('delta');
    expect(e!.hp).toBe(2);
    expect(e!.baseX).toBe(200);
    expect(e!.hasFired).toBe(false);
    expect(e!.vel.y).toBe(120);
  });

  it('bullet spawn via tickFire resets projectile flags', () => {
    const w = createWorld(mulberry32(1));
    const fc = createFireControl();
    tickFire(w, fc, [{ x: 10, y: 10, dir: -1 }], true, 1 / 60);
    const b = w.bullets.items.find((x) => x.alive)!;
    // dirty the flags, kill it, respawn, verify reset
    b.splash = true; b.homing = true; b.accel = 99; b.trail = true; b.trailCount = 7; b.alive = false;
    fc.cooldown = 0;
    tickFire(w, fc, [{ x: 10, y: 10, dir: -1 }], true, 1 / 60);
    const b2 = w.bullets.items.find((x) => x.alive)!;
    expect(b2.dmg).toBe(1);
    expect(b2.splash).toBe(false);
    expect(b2.homing).toBe(false);
    expect(b2.accel).toBe(0);
    expect(b2.trail).toBe(false);
    expect(b2.trailCount).toBe(0);
  });
});

describe('camera-relative bounds', () => {
  it('bullets despawn above the camera band', () => {
    const w = createWorld(mulberry32(1));
    const b = w.bullets.spawn()!;
    b.pos.x = 100; b.pos.y = 1000 - CAM_MARGIN - 1; b.vel.y = 0; b.age = 0;
    tickBullets(w, 1 / 60, 1000);
    expect(b.alive).toBe(false);
  });

  it('enemies despawn below the camera band', () => {
    const w = createWorld(mulberry32(1));
    const e = spawnBoat(w, 100, 1000 + HEIGHT + CAM_MARGIN + 5)!;
    tickEnemies(w, 1 / 60, 1000, { x: 0, y: 0 });
    expect(e.alive).toBe(false);
  });

  it('enemy bullets integrate and despawn outside the band', () => {
    const w = createWorld(mulberry32(1));
    const b = w.enemyBullets.spawn()!;
    b.pos.x = 50; b.pos.y = 500; b.vel.x = 0; b.vel.y = 140; b.age = 0;
    tickEnemyBullets(w, 1 / 60, 0);
    expect(b.pos.y).toBeCloseTo(500 + 140 / 60);
    b.pos.y = HEIGHT + CAM_MARGIN + 1;
    tickEnemyBullets(w, 1 / 60, 0);
    expect(b.alive).toBe(false);
  });
});

describe('homing, accel, trail', () => {
  it('acceleration scales speed linearly', () => {
    const w = createWorld(mulberry32(1));
    const b = w.bullets.spawn()!;
    b.pos.x = 100; b.pos.y = 400; b.vel.x = 0; b.vel.y = -120; b.accel = 900; b.age = 0;
    tickBullets(w, 1 / 60, 0);
    expect(Math.abs(b.vel.y)).toBeCloseTo(120 + 900 / 60, 3);
    expect(b.vel.x).toBeCloseTo(0);
  });

  it('homing turns toward the nearest enemy, capped per tick', () => {
    const w = createWorld(mulberry32(1));
    spawnBoat(w, 300, 100);
    const b = w.bullets.spawn()!;
    b.pos.x = 100; b.pos.y = 100; b.vel.x = 0; b.vel.y = -300; b.homing = true; b.age = 0;
    const before = Math.atan2(b.vel.y, b.vel.x);
    tickBullets(w, 1 / 60, 0);
    const after = Math.atan2(b.vel.y, b.vel.x);
    const turned = Math.abs(after - before);
    expect(turned).toBeGreaterThan(0);
    expect(turned).toBeLessThanOrEqual(3.5 / 60 + 1e-9);
    expect(Math.hypot(b.vel.x, b.vel.y)).toBeCloseTo(300, 3);
  });

  it('trail emits one smoke particle every 4 ticks', () => {
    const w = createWorld(mulberry32(1));
    const b = w.bullets.spawn()!;
    b.pos.x = 100; b.pos.y = 300; b.vel.y = -120; b.trail = true; b.trailCount = 0; b.age = 0;
    for (let i = 0; i < 8; i++) tickBullets(w, 1 / 60, 0);
    expect(w.particles.countAlive()).toBe(2);
  });
});

describe('pickups', () => {
  it('spawnPickup sets kind-specific radius and drift', () => {
    const w = createWorld(mulberry32(1));
    expect(spawnPickup(w, 'minigun', 10, 10)!.radius).toBe(14);
    expect(spawnPickup(w, 'crate', 10, 10)!.radius).toBe(8);
    expect(spawnPickup(w, 'salvage', 10, 10)!.radius).toBe(6);
  });

  it('salvage magnetizes toward a close player', () => {
    const w = createWorld(mulberry32(1));
    const p = spawnPickup(w, 'salvage', 100, 100)!;
    tickPickups(w, 1 / 60, 0, { x: 110, y: 110 }); // within 56px
    const speed = Math.hypot(p.vel.x, p.vel.y);
    expect(speed).toBeCloseTo(220, 1);
    expect(p.vel.x).toBeGreaterThan(0);
    expect(p.vel.y).toBeGreaterThan(0);
  });

  it('far pickups keep drifting down', () => {
    const w = createWorld(mulberry32(1));
    const p = spawnPickup(w, 'salvage', 100, 100)!;
    tickPickups(w, 1 / 60, 0, { x: 500, y: 400 });
    expect(p.vel).toEqual({ x: 0, y: 30 });
  });
});
