import { describe, expect, it } from 'vitest';
import { createRun, grantWeapon, armMissiles } from './run';
import { formatScore, LIVES_ICON, slotView } from './hud';

describe('formatScore', () => {
  it('zero-pads to six digits and clamps', () => {
    expect(formatScore(0)).toBe('000000');
    expect(formatScore(1250)).toBe('001250');
    expect(formatScore(2_000_000)).toBe('999999');
  });
});

describe('slotView', () => {
  it('reflects ownership and selection', () => {
    const r = createRun();
    expect(slotView(r, 1)).toEqual({ owned: true, selected: true, label: '1' });
    expect(slotView(r, 2).owned).toBe(false);
    grantWeapon(r, 'miniguns');
    expect(slotView(r, 2)).toEqual({ owned: true, selected: true, label: '2' });
    expect(slotView(r, 1).selected).toBe(false);
    armMissiles(r);
    expect(slotView(r, 4).owned).toBe(true);
  });
});

describe('LIVES_ICON', () => {
  it('is a single 8x8 frame', () => {
    expect(LIVES_ICON.frames).toHaveLength(1);
    expect(LIVES_ICON.frames[0].width).toBe(8);
    expect(LIVES_ICON.frames[0].height).toBe(8);
  });
});
