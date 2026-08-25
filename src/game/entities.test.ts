import { describe, expect, it } from 'vitest';
import { HEIGHT } from '../engine/renderer';
import { mulberry32 } from '../engine/rng';
import {
  BOAT_SHOT_SPEED,
  CAM_MARGIN,
  collideBulletsEnemies,
  collideEnemiesPlayer,
  collideEnemyBulletsPlayer,
  collidePickupsPlayer,
  createWorld,
  spawnBoat,
  spawnDelta,
  spawnPickup,
  spawnSmoke,
  SPRAY_INTERVAL_MIN,
  SPRAY_INTERVAL_VAR,
  SPRAY_SIZE,
  SPRAY_TICK_GAP,
  tickBullets,
  tickEnemies,
  tickEnemyBullets,
  tickParticles,
  tickPickups,
  TURRET_BARREL_LEN,
  TURRET_SLEW_RATE,
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
    expect(res).toEqual({ hits: 1, kills: 0, score: 0 });
    expect(b.alive).toBe(false);
    expect(e.alive).toBe(true);
    expect(e.hp).toBe(2);
    expect(w.particles.countAlive()).toBe(3);
  });

  it('killing blow explodes: 12 fire + 4 smoke particles', () => {
    const w = createWorld(mulberry32(1));
    const { e } = place(w, 1);
    const res = collideBulletsEnemies(w);
    expect(res).toEqual({ hits: 1, kills: 1, score: 0 });
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
    expect(res).toEqual({ hits: 0, kills: 0, score: 0 });
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
    expect(e!.radius).toBe(20);
    expect(e!.vel).toEqual({ x: 0, y: 80 });
    expect(e!.score).toBe(100);
    expect(e!.salvageChance).toBeCloseTo(0.25);
    expect(e!.fireTimer).toBeGreaterThanOrEqual(2.0);
    expect(e!.fireTimer).toBeLessThanOrEqual(2.8);
    expect(e!.sprayLeft).toBe(0);
    expect(e!.turretAngle).toBe(0);
  });

  it('spawnDelta fills delta fields', () => {
    const w = createWorld(mulberry32(1));
    const e = spawnDelta(w, 200, -16);
    expect(e!.enemyKind).toBe('delta');
    expect(e!.hp).toBe(2);
    expect(e!.baseX).toBe(200);
    expect(e!.hasFired).toBe(false);
    expect(e!.vel.y).toBe(240);
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
    expect(spawnPickup(w, 'minigun', 10, 10)!.radius).toBe(28);
    expect(spawnPickup(w, 'crate', 10, 10)!.radius).toBe(16);
    expect(spawnPickup(w, 'salvage', 10, 10)!.radius).toBe(12);
  });

  it('salvage magnetizes toward a close player', () => {
    const w = createWorld(mulberry32(1));
    const p = spawnPickup(w, 'salvage', 100, 100)!;
    tickPickups(w, 1 / 60, 0, { x: 110, y: 110 }); // within 112px
    const speed = Math.hypot(p.vel.x, p.vel.y);
    expect(speed).toBeCloseTo(440, 1);
    expect(p.vel.x).toBeGreaterThan(0);
    expect(p.vel.y).toBeGreaterThan(0);
  });

  it('far pickups keep drifting down', () => {
    const w = createWorld(mulberry32(1));
    const p = spawnPickup(w, 'salvage', 100, 100)!;
    tickPickups(w, 1 / 60, 0, { x: 500, y: 400 });
    expect(p.vel).toEqual({ x: 0, y: 60 });
  });
});

describe('enemy behaviors', () => {
  function tickBoat(w: ReturnType<typeof createWorld>, n: number, player = { x: 200, y: 300 }, vel = { x: 0, y: 0 }) {
    for (let i = 0; i < n; i++) tickEnemies(w, 1 / 60, 0, player, vel);
  }

  it('boat fires a 5-shot spray at 4-tick gaps, then re-arms in [2.8, 3.6)', () => {
    const w = createWorld(mulberry32(7));
    const e = spawnBoat(w, 320, 100)!;
    e.vel.y = 0;
    e.fireTimer = 0.01;
    // 30 ticks: the spray (ticks 0..16) is done and no shot has yet left
    // the despawn band (280 px/s from y≈116 stays well inside 480+64).
    const counts: number[] = [];
    // The re-arm timer is read the tick the spray ends: it starts ticking
    // down again immediately, so a later read is already partly spent.
    let rearm = Infinity;
    let spraying = false;
    for (let i = 0; i < 30; i++) {
      tickEnemies(w, 1 / 60, 0, { x: 200, y: 300 }, { x: 0, y: 0 });
      if (spraying && e.sprayLeft === 0) rearm = e.fireTimer;
      spraying = e.sprayLeft > 0;
      counts.push(w.enemyBullets.countAlive());
    }
    expect(w.enemyBullets.countAlive()).toBe(SPRAY_SIZE);
    // Shots land one per SPRAY_TICK_GAP ticks: find the ticks where the
    // count increments and check consecutive gaps.
    const shotTicks = counts
      .map((c, i) => (c > (counts[i - 1] ?? 0) ? i : -1))
      .filter((i) => i >= 0);
    expect(shotTicks).toHaveLength(SPRAY_SIZE);
    for (let i = 1; i < shotTicks.length; i++) {
      expect(shotTicks[i] - shotTicks[i - 1]).toBe(SPRAY_TICK_GAP);
    }
    expect(e.sprayLeft).toBe(0);
    expect(rearm).toBeGreaterThanOrEqual(SPRAY_INTERVAL_MIN);
    expect(rearm).toBeLessThan(SPRAY_INTERVAL_MIN + SPRAY_INTERVAL_VAR);
  });

  it('boat holds fire while off-screen', () => {
    const w = createWorld(mulberry32(1));
    const e = spawnBoat(w, 320, -CAM_MARGIN)!;
    e.vel.y = 0;
    e.fireTimer = 0.01;
    tickBoat(w, 10);
    expect(w.enemyBullets.countAlive()).toBe(0);
  });

  it('re-lead sprays occur at roughly the 10% seeded rate', () => {
    const w = createWorld(mulberry32(42));
    const e = spawnBoat(w, 320, 100)!;
    e.vel.y = 0;
    let leads = 0;
    for (let s = 0; s < 200; s++) {
      e.fireTimer = 0.001;
      e.sprayLeft = 0;
      tickBoat(w, 1);
      if (e.sprayLead) leads++;
      e.sprayLeft = 0; // abort the spray; we only sample the mode roll
    }
    expect(leads).toBeGreaterThan(5);
    expect(leads).toBeLessThan(45);
  });

  it('one-lead spray converges near a straight-moving player', () => {
    // spawnBoat draws first (fireTimer), so the mode roll is the 2nd draw:
    // seed 4 gives 0.333 >= SPRAY_LEAD_CHANCE → one-lead (seed 3 re-leads).
    const w = createWorld(mulberry32(4));
    const e = spawnBoat(w, 320, 100)!;
    e.vel.y = 0;
    e.turretAngle = Math.atan2(200 - 320, 300 - 100); // pre-aimed near the solution
    e.fireTimer = 0.001;
    const player = { x: 200, y: 300 };
    const vel = { x: 180, y: 0 };
    // Advance world and player together for 2 seconds.
    let minDist = Infinity;
    for (let i = 0; i < 120; i++) {
      tickEnemies(w, 1 / 60, 0, player, vel);
      tickEnemyBullets(w, 1 / 60, 0);
      player.x += vel.x / 60;
      w.enemyBullets.forEachAlive((b) => {
        minDist = Math.min(minDist, Math.hypot(b.pos.x - player.x, b.pos.y - player.y));
      });
    }
    // Leading + ±4° jitter + slew: at least one shot passes close.
    expect(minDist).toBeLessThan(30);
  });

  it('turret slews toward the player at the capped rate, short way around', () => {
    const w = createWorld(mulberry32(1));
    const e = spawnBoat(w, 320, 100)!;
    e.vel.y = 0;
    e.fireTimer = 999; // never spray; just track
    e.turretAngle = 0;
    // Player up-left of the boat: desired angle is far from 0.
    tickBoat(w, 1, { x: 100, y: -100 }, { x: 0, y: 0 });
    expect(Math.abs(e.turretAngle)).toBeCloseTo(TURRET_SLEW_RATE / 60, 5);
    const before = e.turretAngle;
    tickBoat(w, 60, { x: 100, y: -100 }, { x: 0, y: 0 });
    const desired = Math.atan2(100 - 320, -100 - 100);
    // After a second it has converged (|desired| < π so no wrap needed here;
    // the step-cap assertion above proves the rate limit).
    expect(e.turretAngle).toBeCloseTo(desired, 3);
    expect(Math.abs(e.turretAngle - before)).toBeLessThanOrEqual(TURRET_SLEW_RATE + 1e-9);
  });

  it('spray shots spawn from the barrel tip along the turret angle', () => {
    const w = createWorld(mulberry32(1));
    const e = spawnBoat(w, 320, 100)!;
    e.vel.y = 0;
    e.fireTimer = 0.001;
    // Player straight below: turret rests at 0 already.
    tickBoat(w, 2, { x: 320, y: 400 });
    let checked = false;
    w.enemyBullets.forEachAlive((b) => {
      expect(Math.abs(b.pos.x - 320)).toBeLessThan(2); // ±4° jitter over 16px
      expect(b.pos.y).toBeGreaterThan(100 + TURRET_BARREL_LEN - 2);
      expect(b.vel.y).toBeGreaterThan(0); // flying down toward the player
      expect(Math.hypot(b.vel.x, b.vel.y)).toBeCloseTo(BOAT_SHOT_SPEED, 5);
      checked = true;
    });
    expect(checked).toBe(true);
  });

  it('sprays are deterministic under a fixed seed', () => {
    const run = (seed: number) => {
      const w = createWorld(mulberry32(seed));
      const e = spawnBoat(w, 320, 100)!;
      e.vel.y = 0;
      e.fireTimer = 0.001;
      for (let i = 0; i < 60; i++) tickEnemies(w, 1 / 60, 0, { x: 250, y: 350 }, { x: 90, y: 0 });
      const out: number[] = [];
      w.enemyBullets.forEachAlive((b) => out.push(b.pos.x, b.pos.y, b.vel.x, b.vel.y));
      return out;
    };
    expect(run(9)).toEqual(run(9));
  });

  it('delta weaves as a pure function of age', () => {
    const w = createWorld(mulberry32(7));
    const d = spawnDelta(w, 300, 50)!;
    for (let i = 0; i < 30; i++) tickEnemies(w, 1 / 60, 0, { x: 0, y: 1000 });
    expect(d.pos.x).toBeCloseTo(300 + Math.sin(d.age * 2.2) * 56, 5);
  });

  it('delta fires exactly once when close to player y', () => {
    const w = createWorld(mulberry32(7));
    const d = spawnDelta(w, 300, 50)!;
    for (let i = 0; i < 10; i++) tickEnemies(w, 1 / 60, 0, { x: 300, y: 200 });
    expect(w.enemyBullets.countAlive()).toBe(1);
    expect(d.hasFired).toBe(true);
    const b = w.enemyBullets.items.find((x) => x.alive)!;
    expect(b.vel).toEqual({ x: 0, y: 400 });
    expect(b.radius).toBe(4);
  });
});

describe('player-side collisions', () => {
  it('enemy bullet hits the player once and dies', () => {
    const w = createWorld(mulberry32(7));
    const b = w.enemyBullets.spawn()!;
    b.pos.x = 100; b.pos.y = 100; b.radius = 2;
    expect(collideEnemyBulletsPlayer(w, { x: 100, y: 100 }, 10, false)).toBe(true);
    expect(b.alive).toBe(false);
  });

  it('invulnerability shrugs off bullets and ramming', () => {
    const w = createWorld(mulberry32(7));
    const b = w.enemyBullets.spawn()!;
    b.pos.x = 100; b.pos.y = 100; b.radius = 2;
    spawnBoat(w, 100, 100);
    expect(collideEnemyBulletsPlayer(w, { x: 100, y: 100 }, 10, true)).toBe(false);
    expect(collideEnemiesPlayer(w, { x: 100, y: 100 }, 10, true)).toBe(false);
    expect(b.alive).toBe(true);
  });

  it('ramming an enemy hurts the player but not the enemy', () => {
    const w = createWorld(mulberry32(7));
    const e = spawnBoat(w, 100, 100)!;
    expect(collideEnemiesPlayer(w, { x: 105, y: 100 }, 10, false)).toBe(true);
    expect(e.alive).toBe(true);
  });
});

describe('damage, splash, salvage, score', () => {
  it('kills award score in the result', () => {
    const w = createWorld(mulberry32(9));
    const e = spawnBoat(w, 100, 100)!;
    e.hp = 1;
    const b = w.bullets.spawn()!;
    b.pos.x = 100; b.pos.y = 100; b.radius = 2; b.dmg = 1;
    const r = collideBulletsEnemies(w);
    expect(r.kills).toBe(1);
    expect(r.score).toBe(100);
  });

  it('dmg 3 one-shots a boat', () => {
    const w = createWorld(mulberry32(9));
    spawnBoat(w, 100, 100);
    const b = w.bullets.spawn()!;
    b.pos.x = 100; b.pos.y = 100; b.radius = 4; b.dmg = 3;
    expect(collideBulletsEnemies(w).kills).toBe(1);
  });

  it('splash damages nearby enemies by 1', () => {
    const w = createWorld(mulberry32(9));
    const near = spawnBoat(w, 140, 100)!;   // 40px away — inside 48
    const far = spawnBoat(w, 200, 100)!;    // 100px away — outside
    const target = spawnBoat(w, 100, 100)!;
    const b = w.bullets.spawn()!;
    b.pos.x = 100; b.pos.y = 100; b.radius = 4; b.dmg = 3; b.splash = true;
    collideBulletsEnemies(w);
    expect(target.alive).toBe(false);
    expect(near.hp).toBe(2);
    expect(far.hp).toBe(3);
  });

  it('salvage drops are seeded by enemy chance', () => {
    // With enough kills at chance 1.0 vs 0.0 the pickup counts differ.
    const w = createWorld(mulberry32(11));
    const e = spawnBoat(w, 100, 100)!;
    e.hp = 1; e.salvageChance = 1;
    const b = w.bullets.spawn()!;
    b.pos.x = 100; b.pos.y = 100; b.radius = 2; b.dmg = 1;
    collideBulletsEnemies(w);
    expect(w.pickups.countAlive()).toBe(1);
    expect(w.pickups.items.find((p) => p.alive)!.pickupKind).toBe('salvage');
  });

  it('pickup collection fires the callback and kills the pickup', () => {
    const w = createWorld(mulberry32(11));
    spawnPickup(w, 'crate', 100, 100);
    const got: string[] = [];
    collidePickupsPlayer(w, { x: 100, y: 100 }, 10, (k) => got.push(k));
    expect(got).toEqual(['crate']);
    expect(w.pickups.countAlive()).toBe(0);
  });
});
