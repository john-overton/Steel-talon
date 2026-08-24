import { describe, expect, it } from 'vitest';
import { pickWaterTile, WATER_TILES } from './tiles';
import type { PixelGrid } from '../../engine/sprite';

// 'g' (#306082) is the solid base every tile starts from; anything else is a fleck.
const BASE = [0x30, 0x60, 0x82];

function fleckCount(g: PixelGrid): number {
  let n = 0;
  for (let i = 0; i < g.width * g.height; i++) {
    const o = i * 4;
    if (g.rgba[o] !== BASE[0] || g.rgba[o + 1] !== BASE[1] || g.rgba[o + 2] !== BASE[2]) n++;
  }
  return n;
}

function fleckKeys(g: PixelGrid): Set<number> {
  const keys = new Set<number>();
  for (let i = 0; i < g.width * g.height; i++) {
    const o = i * 4;
    if (g.rgba[o] !== BASE[0] || g.rgba[o + 1] !== BASE[1] || g.rgba[o + 2] !== BASE[2]) keys.add(i);
  }
  return keys;
}

function distinctColors(g: PixelGrid): Set<number> {
  const colors = new Set<number>();
  for (let i = 0; i < g.width * g.height; i++) {
    const o = i * 4;
    if (g.rgba[o] === BASE[0] && g.rgba[o + 1] === BASE[1] && g.rgba[o + 2] === BASE[2]) continue;
    colors.add((g.rgba[o] << 16) | (g.rgba[o + 1] << 8) | g.rgba[o + 2]);
  }
  return colors;
}

describe('water tiles', () => {
  it('has 3 variants x 2 frames of 32x32', () => {
    expect(WATER_TILES).toHaveLength(6);
    for (const g of WATER_TILES) {
      expect(g.width).toBe(32);
      expect(g.height).toBe(32);
    }
  });

  it('every tile is opaque (no transparent gaps in the sea)', () => {
    for (const g of WATER_TILES) {
      for (let i = 0; i < g.width * g.height; i++) expect(g.rgba[i * 4 + 3]).toBe(255);
    }
  });

  it('fleck density rises from calm to chop', () => {
    const [calmA, calmB, chopA, chopB, foamA, foamB] = WATER_TILES;
    for (const g of [calmA, calmB]) {
      expect(fleckCount(g)).toBeGreaterThanOrEqual(12);
      expect(fleckCount(g)).toBeLessThan(40);
    }
    for (const g of [chopA, chopB, foamA, foamB]) {
      expect(fleckCount(g)).toBeGreaterThan(40);
      // Still mostly open water: under 15% of the 1024 pixels.
      expect(fleckCount(g)).toBeLessThan(150);
    }
    expect(fleckCount(chopA)).toBeGreaterThan(fleckCount(calmA));
  });

  it('every tile uses at least two fleck colors', () => {
    for (const g of WATER_TILES) expect(distinctColors(g).size).toBeGreaterThanOrEqual(2);
  });

  it('animation frames differ in fleck placement, not just color', () => {
    for (let v = 0; v < 3; v++) {
      const a = fleckKeys(WATER_TILES[v * 2]);
      const b = fleckKeys(WATER_TILES[v * 2 + 1]);
      const moved = [...a].filter((k) => !b.has(k)).length;
      // Most flecks land somewhere new on the alternate frame.
      expect(moved).toBeGreaterThan(a.size / 2);
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
