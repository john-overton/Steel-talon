import { describe, expect, it } from 'vitest';
import {
  armMissiles, collectSalvage, createRun, cycleWeapon, damagePlayer,
  grantWeapon, ownsSlot, selectWeapon, tickRun,
} from './run';

describe('createRun', () => {
  it('starts with 3 lives, 3 hp, chain gun selected, nothing owned', () => {
    const r = createRun();
    expect(r).toEqual({
      score: 0, lives: 3, hp: 3, salvage: 0, selected: 1,
      hasMiniguns: false, hasRockets: false, missileAmmo: 0,
      rocketCooldown: 0, invulnTicks: 0,
    });
  });
});

describe('damagePlayer', () => {
  it('full matrix: hit, hit, death, ... gameover', () => {
    const r = createRun();
    expect(damagePlayer(r)).toBe('hit');
    expect(r.hp).toBe(2);
    expect(r.invulnTicks).toBe(90);
    r.invulnTicks = 0;
    expect(damagePlayer(r)).toBe('hit');
    r.invulnTicks = 0;
    expect(damagePlayer(r)).toBe('death');
    expect(r.lives).toBe(2);
    expect(r.hp).toBe(3);
    expect(r.invulnTicks).toBe(180);
    // burn through remaining lives
    for (let life = 0; life < 2; life++) {
      for (let i = 0; i < 2; i++) { r.invulnTicks = 0; expect(damagePlayer(r)).toBe('hit'); }
      r.invulnTicks = 0;
      expect(damagePlayer(r)).toBe(life === 0 ? 'death' : 'gameover');
    }
    expect(r.lives).toBe(0);
    expect(r.hp).toBe(0);
  });

  it('invulnerability shrugs', () => {
    const r = createRun();
    r.invulnTicks = 5;
    expect(damagePlayer(r)).toBe('shrugged');
    expect(r.hp).toBe(3);
  });
});

describe('weapon ownership and selection', () => {
  it('only slot 1 owned at start; selecting unowned is a no-op', () => {
    const r = createRun();
    expect(ownsSlot(r, 1)).toBe(true);
    expect(ownsSlot(r, 2)).toBe(false);
    expect(selectWeapon(r, 2)).toBe(false);
    expect(r.selected).toBe(1);
  });

  it('grantWeapon unlocks and auto-selects', () => {
    const r = createRun();
    grantWeapon(r, 'miniguns');
    expect(r.hasMiniguns).toBe(true);
    expect(r.selected).toBe(2);
    grantWeapon(r, 'rockets');
    expect(r.selected).toBe(3);
  });

  it('slot 4 is owned only while ammo remains', () => {
    const r = createRun();
    expect(ownsSlot(r, 4)).toBe(false);
    armMissiles(r);
    expect(r.missileAmmo).toBe(3);
    expect(ownsSlot(r, 4)).toBe(true);
    armMissiles(r); armMissiles(r); armMissiles(r);
    expect(r.missileAmmo).toBe(9); // capped
  });

  it('cycle skips unowned slots and wraps', () => {
    const r = createRun();
    grantWeapon(r, 'rockets');   // selected 3, owns 1 and 3
    cycleWeapon(r);
    expect(r.selected).toBe(1);  // 4 unowned, 1 next owned after wrap
    cycleWeapon(r);
    expect(r.selected).toBe(3);
  });
});

describe('scoring and timers', () => {
  it('salvage pays 25 score', () => {
    const r = createRun();
    collectSalvage(r);
    expect(r.salvage).toBe(1);
    expect(r.score).toBe(25);
  });

  it('tickRun decays invuln (per tick) and rocket cooldown (per second)', () => {
    const r = createRun();
    r.invulnTicks = 2;
    r.rocketCooldown = 1;
    tickRun(r, 1 / 60);
    expect(r.invulnTicks).toBe(1);
    expect(r.rocketCooldown).toBeCloseTo(1 - 1 / 60);
    tickRun(r, 1 / 60);
    tickRun(r, 1 / 60);
    expect(r.invulnTicks).toBe(0); // floored
  });
});
