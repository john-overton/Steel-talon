import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../engine/rng';
import { CHAIN_CONE, MINIGUN_CONE, coneTarget, intercept, reticleTarget } from './aim';
import { DELTA_WEAVE_AMP, DELTA_WEAVE_FREQ, createWorld, enemyVelocity, spawnBoat, spawnDelta } from './entities';
import { createRun, grantWeapon, armMissiles, selectWeapon } from './run';

describe('intercept', () => {
  it('meets a constant-velocity target', () => {
    // Shooter at origin, target at (100, 0) moving +y at 50, projectile 200.
    const p = intercept(0, 0, 100, 0, 0, 50, 200);
    // Simulate: projectile flies straight at p; verify it passes within 1px
    // of the target's position at the intercept time.
    const d = Math.hypot(p.x, p.y);
    const t = d / 200;
    const tx = 100;
    const ty = 50 * t;
    expect(p.x).toBeCloseTo(tx, 5);
    expect(p.y).toBeCloseTo(ty, 5);
  });

  it('degenerates to direct aim for a stationary target', () => {
    const p = intercept(10, 20, 300, 400, 0, 0, 840);
    expect(p.x).toBe(300);
    expect(p.y).toBe(400);
  });

  it('falls back to direct aim when the target outruns the projectile', () => {
    // Target fleeing along +x faster than the projectile can fly.
    const p = intercept(0, 0, 100, 0, 500, 0, 200);
    expect(p.x).toBe(100);
    expect(p.y).toBe(0);
  });

  it('handles the equal-speed degenerate case (linear solution)', () => {
    // Target approaching head-on at projectile speed: b < 0, t = -c/b.
    const p = intercept(0, 0, 200, 0, -200, 0, 200);
    const t = 0.5; // meets halfway: 200 - 200t = 200t
    expect(p.x).toBeCloseTo(200 - 200 * t, 5);
    expect(p.y).toBeCloseTo(0, 5);
  });

  it('reuses its result object (no per-call allocation)', () => {
    const a = intercept(0, 0, 10, 10, 0, 0, 100);
    const b = intercept(0, 0, 20, 20, 0, 0, 100);
    expect(a).toBe(b);
  });
});

describe('coneTarget', () => {
  it('picks the nearest enemy inside the cone, ignores outside', () => {
    const w = createWorld(mulberry32(1));
    // Shooter at (320, 400) firing up. In-cone (dead ahead, far):
    const far = spawnBoat(w, 320, 100)!;
    // In-cone (10° off, near):
    const near = spawnBoat(w, 320 + Math.sin(0.174) * 150, 400 - Math.cos(0.174) * 150)!;
    // Out of cone (90° off — level with the shooter):
    spawnBoat(w, 500, 400);
    const t = coneTarget(w, 320, 400, CHAIN_CONE);
    expect(t).toBe(near);
    expect(t).not.toBe(far);
  });

  it('rejects enemies just outside the half-angle and behind', () => {
    const w = createWorld(mulberry32(1));
    // 46° off-axis: outside CHAIN_CONE (45°).
    const a = (46 * Math.PI) / 180;
    spawnBoat(w, 320 + Math.sin(a) * 200, 400 - Math.cos(a) * 200);
    // Directly behind (below) the shooter.
    spawnBoat(w, 320, 500);
    expect(coneTarget(w, 320, 400, CHAIN_CONE)).toBeUndefined();
  });

  it('minigun cone accepts 4° but rejects 6°', () => {
    const w = createWorld(mulberry32(1));
    const a6 = (6 * Math.PI) / 180;
    spawnBoat(w, 320 + Math.sin(a6) * 200, 400 - Math.cos(a6) * 200);
    expect(coneTarget(w, 320, 400, MINIGUN_CONE)).toBeUndefined();
    const a4 = (4 * Math.PI) / 180;
    const good = spawnBoat(w, 320 + Math.sin(a4) * 200, 400 - Math.cos(a4) * 200)!;
    expect(coneTarget(w, 320, 400, MINIGUN_CONE)).toBe(good);
  });
});

describe('enemyVelocity', () => {
  it('returns a boat velocity verbatim', () => {
    const w = createWorld(mulberry32(1));
    const e = spawnBoat(w, 100, 100)!;
    const v = enemyVelocity(e);
    expect(v.x).toBe(0);
    expect(v.y).toBe(80);
  });

  it('delta velocity matches the finite difference of its weave', () => {
    const w = createWorld(mulberry32(1));
    const e = spawnDelta(w, 300, 100)!;
    e.age = 0.8;
    const v = enemyVelocity(e);
    const eps = 1e-4;
    const x0 = 300 + Math.sin((e.age - eps) * DELTA_WEAVE_FREQ) * DELTA_WEAVE_AMP;
    const x1 = 300 + Math.sin((e.age + eps) * DELTA_WEAVE_FREQ) * DELTA_WEAVE_AMP;
    expect(v.x).toBeCloseTo((x1 - x0) / (2 * eps), 2);
    expect(v.y).toBe(240);
  });
});

describe('reticleTarget', () => {
  it('follows the selected weapon: chain cone, minigun cone, missile nearest, rockets none', () => {
    const w = createWorld(mulberry32(1));
    const r = createRun();
    // 30° off-axis at range 200: inside CHAIN_CONE, outside MINIGUN_CONE.
    const a = (30 * Math.PI) / 180;
    const e = spawnBoat(w, 320 + Math.sin(a) * 200, 400 - Math.cos(a) * 200)!;
    expect(reticleTarget(w, r, 320, 400)).toBe(e);       // slot 1 default
    grantWeapon(r, 'miniguns');
    selectWeapon(r, 2);
    expect(reticleTarget(w, r, 320, 400)).toBeUndefined(); // outside ±5°
    grantWeapon(r, 'rockets');
    selectWeapon(r, 3);
    expect(reticleTarget(w, r, 320, 400)).toBeUndefined(); // rockets: never
    armMissiles(r);
    selectWeapon(r, 4);
    expect(reticleTarget(w, r, 320, 400)).toBe(e);         // nearest, no cone
  });

  it('missiles lock the nearest enemy even behind the player', () => {
    const w = createWorld(mulberry32(1));
    const r = createRun();
    armMissiles(r);
    selectWeapon(r, 4);
    const behind = spawnBoat(w, 320, 450)!;
    spawnBoat(w, 320, 100);
    expect(reticleTarget(w, r, 320, 400)).toBe(behind);
  });
});
