// Run state: the score, lives, and arsenal a single playthrough carries between
// scenes. Pure data plus pure mutators — no engine imports, no rendering, no RNG.

export type WeaponSlot = 1 | 2 | 3 | 4;

export interface RunState {
  score: number; lives: number; hp: number;
  salvage: number;
  selected: WeaponSlot;
  hasMiniguns: boolean; hasRockets: boolean;
  missileAmmo: number;              // 0–9
  rocketCooldown: number;           // seconds; 0 = ready
  invulnTicks: number;
}

/** Ticks of mercy invulnerability granted by a hit and by respawning. */
const INVULN_HIT = 90;
const INVULN_RESPAWN = 180;
const MISSILES_PER_PICKUP = 3;
const MISSILE_CAP = 9;

export function createRun(): RunState {
  return {
    score: 0, lives: 3, hp: 3, salvage: 0, selected: 1,
    hasMiniguns: false, hasRockets: false, missileAmmo: 0,
    rocketCooldown: 0, invulnTicks: 0,
  };
}

export type DamageResult = 'shrugged' | 'hit' | 'death' | 'gameover';

export function damagePlayer(r: RunState): DamageResult {
  if (r.invulnTicks > 0) return 'shrugged';
  r.hp -= 1;
  if (r.hp > 0) {
    r.invulnTicks = INVULN_HIT;
    return 'hit';
  }
  if (r.lives > 1) {
    r.lives -= 1;
    r.hp = 3;
    r.invulnTicks = INVULN_RESPAWN;
    return 'death';
  }
  r.lives = 0;
  r.hp = 0;
  return 'gameover';
}

export function addScore(r: RunState, points: number): void {
  r.score += points;
}

export function collectSalvage(r: RunState): void {
  r.salvage += 1;
  addScore(r, 25);
}

export function armMissiles(r: RunState): void {
  r.missileAmmo = Math.min(r.missileAmmo + MISSILES_PER_PICKUP, MISSILE_CAP);
}

export function grantWeapon(r: RunState, w: 'miniguns' | 'rockets'): void {
  if (w === 'miniguns') {
    r.hasMiniguns = true;
    r.selected = 2;
  } else {
    r.hasRockets = true;
    r.selected = 3;
  }
}

export function ownsSlot(r: RunState, slot: WeaponSlot): boolean {
  switch (slot) {
    case 1: return true;                 // chain gun is never lost
    case 2: return r.hasMiniguns;
    case 3: return r.hasRockets;
    case 4: return r.missileAmmo > 0;
  }
}

/** Returns false and changes nothing when the slot is not owned. */
export function selectWeapon(r: RunState, slot: WeaponSlot): boolean {
  if (!ownsSlot(r, slot)) return false;
  r.selected = slot;
  return true;
}

export function cycleWeapon(r: RunState): void {
  for (let step = 1; step <= 4; step++) {
    const slot = (((r.selected - 1 + step) % 4) + 1) as WeaponSlot;
    if (ownsSlot(r, slot)) {
      r.selected = slot;
      return;
    }
  }
}

export function tickRun(r: RunState, dt: number): void {
  r.invulnTicks = Math.max(0, r.invulnTicks - 1);
  r.rocketCooldown = Math.max(0, r.rocketCooldown - dt);
}
