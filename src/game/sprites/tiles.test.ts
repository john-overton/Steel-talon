import { describe, expect, it } from 'vitest';
import { pickWaterTile, WATER_TILES } from './tiles';

describe('water tiles', () => {
  it('has 3 variants x 2 frames of 16x16', () => {
    expect(WATER_TILES).toHaveLength(6);
    for (const g of WATER_TILES) {
      expect(g.width).toBe(16);
      expect(g.height).toBe(16);
    }
  });

  it('pickWaterTile is stable for the same cell', () => {
    for (let i = 0; i < 20; i++) {
      expect(pickWaterTile(7, 13, 0)).toBe(pickWaterTile(7, 13, 0));
    }
  });

  it('frame parity selects the animation frame of the same variant', () => {
    const a = pickWaterTile(3, 5, 0);
    const b = pickWaterTile(3, 5, 1);
    expect(Math.floor(a / 2)).toBe(Math.floor(b / 2));
    expect(a % 2).toBe(0);
    expect(b % 2).toBe(1);
  });

  it('variant distribution is mostly calm with some chop and foam', () => {
    const counts = [0, 0, 0];
    for (let row = 0; row < 40; row++) {
      for (let col = 0; col < 40; col++) {
        counts[Math.floor(pickWaterTile(col, row, 0) / 2)]++;
      }
    }
    expect(counts[0]).toBeGreaterThan(1000); // calm dominates (of 1600)
    expect(counts[1]).toBeGreaterThan(50);   // chop present
    expect(counts[2]).toBeGreaterThan(10);   // foam present
    expect(counts[2]).toBeLessThan(counts[1]); // foam rarest
  });
});
