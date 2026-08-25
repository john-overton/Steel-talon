// Four-slot arsenal (engine spec build order, task 10): chain gun (always
// owned), miniguns, rocket salvos, and homing missiles. One flat tick
// function drives whichever slot is selected plus any running rocket
// salvo, firing straight into the shared bullet/particle pools.
import { CHAIN_CONE, MINIGUN_CONE, coneTarget, intercept } from './aim';
import { enemyVelocity, spawnShell, spawnSmoke, type Enemy, type Muzzle, type World } from './entities';
import { ownsSlot, type RunState } from './run';

export const CHAIN_INTERVAL = 0.25;     // 240 rpm
export const MINIGUN_INTERVAL = 0.125;  // 480 rpm per barrel
export const MISSILE_INTERVAL = 0.5;
export const SALVO_SIZE = 10;
export const SALVO_TICK_GAP = 6;        // one rocket per 3 ticks
export const ROCKET_COOLDOWN = 8;       // 8 seconds
export const ROCKET_LAUNCH_SPEED = 120; // px/s
export const ROCKET_ACCEL = 1200;       // px/s²
export const ROCKET_SPREAD = (4 * Math.PI) / 180;
export const CHAIN_DMG = 0.75;
export const MINIGUN_DMG = 0.5;
export const ROCKET_DMG = 2;
export const MISSILE_DMG = 3;
export const MISSILE_SPEED = 600;
export const FLASH_TICKS = 1; // moved here from entities

const BULLET_SPEED = 840;

export interface Mounts {
  nose: Muzzle; podL: Muzzle; podR: Muzzle; pylonL: Muzzle; pylonR: Muzzle;
}

export interface WeaponState {
  cooldown: number;      // between-shot timer for the selected weapon
  flashTicks: number; flashFrame: number; shotCount: number;
  salvoLeft: number;     // rockets remaining in the running salvo (0 = idle)
  salvoTick: number;     // tick counter inside the salvo
  pylonSide: -1 | 1;     // alternates rocket/missile launch pylon; also chain-gun shell side
}

export function createWeaponState(): WeaponState {
  return {
    cooldown: 0, flashTicks: 0, flashFrame: 0, shotCount: 0,
    salvoLeft: 0, salvoTick: 0, pylonSide: -1,
  };
}

export type FiredKind = 'chain' | 'minigun' | 'rocket' | 'missile' | null;

function pylonMount(mounts: Mounts, side: -1 | 1): Muzzle {
  return side === -1 ? mounts.pylonL : mounts.pylonR;
}

function launchRocket(w: World, mounts: Mounts, ws: WeaponState): void {
  const m = pylonMount(mounts, ws.pylonSide);
  ws.pylonSide = ws.pylonSide === -1 ? 1 : -1;
  const b = w.bullets.spawn();
  if (!b) return;
  const angle = -Math.PI / 2 + (w.rng() * 2 - 1) * ROCKET_SPREAD;
  b.pos.x = m.x; b.pos.y = m.y; b.age = 0;
  b.vel.x = Math.cos(angle) * ROCKET_LAUNCH_SPEED;
  b.vel.y = Math.sin(angle) * ROCKET_LAUNCH_SPEED;
  b.dmg = ROCKET_DMG; b.radius = 6;
  b.splash = false; b.homing = false;
  b.accel = ROCKET_ACCEL; b.trail = true; b.trailCount = 0;
}

function fireBullet(w: World, m: Muzzle, dmg: number, vx = 0, vy = -BULLET_SPEED): void {
  const b = w.bullets.spawn();
  if (b) {
    b.pos.x = m.x; b.pos.y = m.y; b.age = 0;
    b.vel.x = vx; b.vel.y = vy;
    b.hp = 1; b.radius = 4;
    b.dmg = dmg;
    b.splash = false; b.homing = false; b.accel = 0; b.trail = false; b.trailCount = 0;
  }
}

// Fire from m at the target's intercept point (lead solution), or straight
// up with no target. Each barrel solves from its own muzzle, so paired
// miniguns converge slightly on a shared target.
function aimedFire(w: World, m: Muzzle, dmg: number, target: Enemy | undefined): void {
  if (!target) {
    fireBullet(w, m, dmg);
    return;
  }
  const v = enemyVelocity(target);
  const p = intercept(m.x, m.y, target.pos.x, target.pos.y, v.x, v.y, BULLET_SPEED);
  const dx = p.x - m.x;
  const dy = p.y - m.y;
  const d = Math.hypot(dx, dy) || 1;
  fireBullet(w, m, dmg, (dx / d) * BULLET_SPEED, (dy / d) * BULLET_SPEED);
}

// Bullet + its own shell casing, ejected from the muzzle's fixed `dir`.
// Used by the miniguns, which have no separate alternating-side casing.
function fireBarrel(w: World, m: Muzzle, dmg: number, target: Enemy | undefined): void {
  aimedFire(w, m, dmg, target);
  spawnShell(w, m);
}

export function tickWeapons(
  w: World, run: RunState, ws: WeaponState, mounts: Mounts, held: boolean, dt: number,
): FiredKind {
  ws.cooldown = Math.max(0, ws.cooldown - dt);
  if (ws.flashTicks > 0) ws.flashTicks--;

  // Running salvo: committed once started, independent of held/selected.
  if (ws.salvoLeft > 0) {
    ws.salvoTick++;
    if ((ws.salvoTick - 1) % SALVO_TICK_GAP === 0) {
      launchRocket(w, mounts, ws);
      ws.salvoLeft--;
      if (ws.salvoLeft === 0) run.rocketCooldown = ROCKET_COOLDOWN;
      return 'rocket';
    }
    return null;
  }

  if (!held || ws.cooldown !== 0 || !ownsSlot(run, run.selected)) return null;

  switch (run.selected) {
    case 1: {
      ws.cooldown = CHAIN_INTERVAL;
      aimedFire(w, mounts.nose, CHAIN_DMG,
        coneTarget(w, mounts.nose.x, mounts.nose.y, CHAIN_CONE));
      ws.flashTicks = FLASH_TICKS;
      ws.flashFrame ^= 1;
      ws.shotCount++;
      spawnShell(w, { x: mounts.nose.x, y: mounts.nose.y, dir: ws.pylonSide });
      ws.pylonSide = ws.pylonSide === -1 ? 1 : -1;
      if (ws.shotCount % 3 === 0) spawnSmoke(w, mounts.nose.x, mounts.nose.y + 8, 0.8);
      return 'chain';
    }
    case 2: {
      ws.cooldown = MINIGUN_INTERVAL;
      ws.flashTicks = FLASH_TICKS;
      ws.flashFrame ^= 1;
      ws.shotCount++;
      const target = coneTarget(
        w, (mounts.podL.x + mounts.podR.x) / 2, mounts.podL.y, MINIGUN_CONE,
      );
      for (const m of [mounts.podL, mounts.podR]) {
        fireBarrel(w, m, MINIGUN_DMG, target);
        if (ws.shotCount % 3 === 0) spawnSmoke(w, m.x, m.y + 8, 0.8);
      }
      return 'minigun';
    }
    case 3: {
      if (run.rocketCooldown !== 0 || ws.salvoLeft !== 0) return null;
      ws.salvoLeft = SALVO_SIZE;
      ws.salvoTick = 0;
      return null;
    }
    case 4: {
      if (run.missileAmmo <= 0) return null;
      ws.cooldown = MISSILE_INTERVAL;
      run.missileAmmo--;
      const m = pylonMount(mounts, ws.pylonSide);
      ws.pylonSide = ws.pylonSide === -1 ? 1 : -1;
      const b = w.bullets.spawn();
      if (b) {
        b.pos.x = m.x; b.pos.y = m.y; b.age = 0;
        b.vel.x = 0; b.vel.y = -MISSILE_SPEED;
        b.hp = 1; b.radius = 8;
        b.dmg = MISSILE_DMG;
        b.splash = true; b.homing = true; b.accel = 0; b.trail = true; b.trailCount = 0;
      }
      return 'missile';
    }
    default:
      return null;
  }
}
