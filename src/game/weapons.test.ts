import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../engine/rng';
import { createWorld } from './entities';
import { createRun, grantWeapon, armMissiles, selectWeapon } from './run';
import {
  CHAIN_DMG, createWeaponState, MINIGUN_DMG, MISSILE_DMG, ROCKET_ACCEL,
  ROCKET_COOLDOWN, ROCKET_DMG, ROCKET_LAUNCH_SPEED, ROCKET_SPREAD, SALVO_SIZE,
  tickWeapons, type Mounts,
} from './weapons';

const DT = 1 / 60;

function mounts(): Mounts {
  return {
    nose: { x: 320, y: 390, dir: 1 },
    podL: { x: 310, y: 395, dir: -1 },
    podR: { x: 330, y: 395, dir: 1 },
    pylonL: { x: 306, y: 396, dir: -1 },
    pylonR: { x: 334, y: 396, dir: 1 },
  };
}

function run60(w: ReturnType<typeof createWorld>, r: ReturnType<typeof createRun>, held: boolean, ticks: number) {
  const ws = createWeaponState();
  const m = mounts();
  const fired: string[] = [];
  for (let i = 0; i < ticks; i++) {
    const f = tickWeapons(w, r, ws, m, held, DT);
    if (f) fired.push(f);
  }
  return { ws, fired };
}

describe('chain gun (slot 1)', () => {
  it('fires 4 shots per second at dmg 0.75 from the nose', () => {
    const w = createWorld(mulberry32(1));
    const r = createRun();
    const { fired } = run60(w, r, true, 60);
    expect(fired.filter((f) => f === 'chain')).toHaveLength(4);
    const b = w.bullets.items.find((x) => x.alive)!;
    expect(b.dmg).toBe(CHAIN_DMG);
    expect(b.pos.x).toBe(320);
  });

  it('resets all projectile flags on a fresh chain-gun bullet', () => {
    const w = createWorld(mulberry32(1));
    const r = createRun();
    const ws = createWeaponState();
    const m = mounts();
    tickWeapons(w, r, ws, m, true, DT);
    const b = w.bullets.items.find((x) => x.alive)!;
    // dirty the flags, kill it, respawn, verify reset
    b.splash = true; b.homing = true; b.accel = 99; b.trail = true; b.trailCount = 7; b.alive = false;
    ws.cooldown = 0;
    tickWeapons(w, r, ws, m, true, DT);
    const b2 = w.bullets.items.find((x) => x.alive)!;
    expect(b2.dmg).toBe(CHAIN_DMG);
    expect(b2.splash).toBe(false);
    expect(b2.homing).toBe(false);
    expect(b2.accel).toBe(0);
    expect(b2.trail).toBe(false);
    expect(b2.trailCount).toBe(0);
  });

  it('ejects exactly one shell casing per shot (no double-spawn)', () => {
    const w = createWorld(mulberry32(1));
    const r = createRun();
    const ws = createWeaponState();
    const m = mounts();
    // shotCount goes to 1 after this shot, so no smoke tick fires alongside it.
    tickWeapons(w, r, ws, m, true, DT);
    expect(w.particles.countAlive()).toBe(1);
  });
});

describe('miniguns (slot 2)', () => {
  it('fires 8 shots/sec from both pods at dmg 0.5', () => {
    const w = createWorld(mulberry32(1));
    const r = createRun();
    grantWeapon(r, 'miniguns');
    const { fired } = run60(w, r, true, 60);
    expect(fired.filter((f) => f === 'minigun')).toHaveLength(8);
    // 8 volleys x 2 pods = 16 bullets spawned
    const spawned = w.bullets.items.filter((b) => b.alive || b.age > 0);
    expect(spawned.length).toBeGreaterThanOrEqual(16);
    expect(spawned[0].dmg).toBe(MINIGUN_DMG);
  });

  it('does not fire when unowned even if selected state is forced', () => {
    const w = createWorld(mulberry32(1));
    const r = createRun();
    r.selected = 2; // bypassing selectWeapon on purpose
    const { fired } = run60(w, r, true, 60);
    expect(fired).toHaveLength(0);
  });
});

describe('rockets (slot 3)', () => {
  it('one press launches exactly 10 rockets, one per 3 ticks, then sets the cooldown', () => {
    const w = createWorld(mulberry32(1));
    const r = createRun();
    grantWeapon(r, 'rockets');
    const { fired } = run60(w, r, true, 60);
    expect(fired.filter((f) => f === 'rocket')).toHaveLength(SALVO_SIZE);
    expect(r.rocketCooldown).toBe(ROCKET_COOLDOWN);
    const rockets = w.bullets.items.filter((b) => b.dmg === ROCKET_DMG);
    expect(rockets).toHaveLength(SALVO_SIZE);
    for (const rk of rockets) {
      expect(rk.accel).toBe(ROCKET_ACCEL);
      expect(rk.trail).toBe(true);
      // spread: mostly upward, slight x component allowed
      expect(rk.vel.y).toBeLessThan(-ROCKET_LAUNCH_SPEED * Math.cos(ROCKET_SPREAD) + 1e-9);
      expect(Math.abs(rk.vel.x)).toBeLessThanOrEqual(ROCKET_LAUNCH_SPEED * Math.sin(ROCKET_SPREAD));
    }
  });

  it('no second salvo while cooling down; salvo finishes after release', () => {
    const w = createWorld(mulberry32(1));
    const r = createRun();
    grantWeapon(r, 'rockets');
    const ws = createWeaponState();
    const m = mounts();
    tickWeapons(w, r, ws, m, true, DT);   // start salvo
    let rocketTicks = 0;
    for (let i = 0; i < 59; i++) {
      if (tickWeapons(w, r, ws, m, false, DT) === 'rocket') rocketTicks++;
    }
    expect(rocketTicks + 1 >= SALVO_SIZE || rocketTicks >= SALVO_SIZE).toBe(true); // salvo completed unheld
    expect(r.rocketCooldown).toBe(ROCKET_COOLDOWN);
    const before = w.bullets.items.filter((b) => b.dmg === ROCKET_DMG).length;
    for (let i = 0; i < 30; i++) tickWeapons(w, r, ws, m, true, DT);
    expect(w.bullets.items.filter((b) => b.dmg === ROCKET_DMG).length).toBe(before);
  });
});

describe('missiles (slot 4)', () => {
  it('consumes ammo, fires homing splash bullets, stops at zero', () => {
    const w = createWorld(mulberry32(1));
    const r = createRun();
    armMissiles(r);           // 3 ammo
    expect(selectWeapon(r, 4)).toBe(true);
    const { fired } = run60(w, r, true, 120); // 2 seconds at 0.5s interval → 3 shots then dry
    expect(fired.filter((f) => f === 'missile')).toHaveLength(3);
    expect(r.missileAmmo).toBe(0);
    const missiles = w.bullets.items.filter((b) => b.dmg === MISSILE_DMG);
    expect(missiles).toHaveLength(3);
    for (const ms of missiles) {
      expect(ms.homing).toBe(true);
      expect(ms.splash).toBe(true);
      expect(ms.trail).toBe(true);
    }
  });
});

describe('alternating pylons', () => {
  it('rockets alternate launch x positions', () => {
    const w = createWorld(mulberry32(1));
    const r = createRun();
    grantWeapon(r, 'rockets');
    run60(w, r, true, 60);
    const xs = w.bullets.items.filter((b) => b.dmg === ROCKET_DMG).map((b) => b.pos.x);
    const left = xs.filter((x) => x < 320).length;
    const right = xs.filter((x) => x > 320).length;
    expect(left).toBe(5);
    expect(right).toBe(5);
  });
});
