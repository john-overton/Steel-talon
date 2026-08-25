import { describe, expect, it } from 'vitest';
import { BAND, type Band } from './field';
import { TERRAIN_TILE, coverage, marchCase } from './tiles';

const c = (tl: Band, tr: Band, br: Band, bl: Band): [Band, Band, Band, Band] => [tl, tr, br, bl];

describe('marchCase', () => {
  it('encodes each corner in its own bit', () => {
    expect(marchCase(c(BAND.BEACH, BAND.DEEP, BAND.DEEP, BAND.DEEP), BAND.BEACH)).toBe(0b0001);
    expect(marchCase(c(BAND.DEEP, BAND.BEACH, BAND.DEEP, BAND.DEEP), BAND.BEACH)).toBe(0b0010);
    expect(marchCase(c(BAND.DEEP, BAND.DEEP, BAND.BEACH, BAND.DEEP), BAND.BEACH)).toBe(0b0100);
    expect(marchCase(c(BAND.DEEP, BAND.DEEP, BAND.DEEP, BAND.BEACH), BAND.BEACH)).toBe(0b1000);
  });
  it('counts higher bands as inside lower band cases', () => {
    expect(marchCase(c(BAND.ROCK, BAND.JUNGLE, BAND.GRASS, BAND.BEACH), BAND.BEACH)).toBe(0b1111);
    expect(marchCase(c(BAND.ROCK, BAND.JUNGLE, BAND.GRASS, BAND.BEACH), BAND.JUNGLE)).toBe(0b0011);
  });
});

describe('coverage', () => {
  it('full and empty cases', () => {
    expect(coverage(0b1111, 0, 0)).toBe(true);
    expect(coverage(0b1111, TERRAIN_TILE - 1, TERRAIN_TILE - 1)).toBe(true);
    expect(coverage(0b0000, 8, 8)).toBe(false);
  });
  it('single-corner case covers that corner only, with a curved boundary', () => {
    expect(coverage(0b0001, 0, 0)).toBe(true);            // TL corner
    expect(coverage(0b0001, 15, 15)).toBe(false);          // opposite corner
    expect(coverage(0b0001, 15, 0)).toBe(false);
    // area of a corner case is between a thin sliver and half the tile → curved, not square
    let area = 0;
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (coverage(0b0001, x, y)) area++;
    expect(area).toBeGreaterThan(16);
    expect(area).toBeLessThan(128);
  });
  it('edge case covers exactly the top half boundary-smoothly', () => {
    expect(coverage(0b0011, 8, 0)).toBe(true);   // top edge inside
    expect(coverage(0b0011, 8, 15)).toBe(false); // bottom outside
  });
  it('is symmetric under mask rotation', () => {
    let a = 0, b = 0;
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      if (coverage(0b0001, x, y)) a++;
      if (coverage(0b0010, x, y)) b++;
    }
    expect(a).toBe(b);
  });
});
