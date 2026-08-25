import { describe, expect, it } from 'vitest';
import { BAND, PLOT_SIZE, THRESHOLD, bandAt, elevation, hash2, plotSpec, valueNoise } from './field';

const SEED = 0xc0ffee;

describe('hash2/valueNoise', () => {
  it('is deterministic and seed-sensitive', () => {
    expect(hash2(3, 7, SEED)).toBe(hash2(3, 7, SEED));
    expect(hash2(3, 7, SEED)).not.toBe(hash2(3, 7, SEED + 1));
  });
  it('valueNoise stays in [0,1) and is smooth-ish', () => {
    for (let i = 0; i < 200; i++) {
      const v = valueNoise(i * 13.7, i * 5.3, SEED);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
    const a = valueNoise(100, 100, SEED);
    const b = valueNoise(100.5, 100, SEED);
    expect(Math.abs(a - b)).toBeLessThan(0.5);
  });
});

describe('plotSpec', () => {
  it('is deterministic and produces all shapes and the scale range over many plots', () => {
    const shapes = new Set<string>();
    let min = 1, max = 0;
    for (let c = 0; c < 40; c++) for (let r = 0; r < 40; r++) {
      const s = plotSpec(c, r, SEED);
      expect(s).toEqual(plotSpec(c, r, SEED));
      if (!s.occupied) continue;
      shapes.add(s.shape);
      min = Math.min(min, s.scale); max = Math.max(max, s.scale);
    }
    expect(shapes).toEqual(new Set(['round', 'crescent', 'snake', 'chain']));
    expect(min).toBeGreaterThanOrEqual(0.1);
    expect(max).toBeLessThanOrEqual(0.95);
    expect(max - min).toBeGreaterThan(0.4); // real spread, not a constant
  });
  it('leaves some plots as open water', () => {
    let open = 0;
    for (let c = 0; c < 20; c++) for (let r = 0; r < 20; r++) if (!plotSpec(c, r, SEED).occupied) open++;
    expect(open).toBeGreaterThan(20);
  });
});

describe('elevation', () => {
  it('is deterministic, bounded, and zero on plot borders', () => {
    for (let i = 0; i < 100; i++) {
      const x = (i * 977) % (PLOT_SIZE * 5), y = (i * 1409) % (PLOT_SIZE * 5);
      const e = elevation(x, y, SEED);
      expect(e).toBe(elevation(x, y, SEED));
      expect(e).toBeGreaterThanOrEqual(0);
      expect(e).toBeLessThanOrEqual(1);
    }
    for (let i = 0; i < 50; i++) {
      expect(elevation(PLOT_SIZE, i * 137, SEED)).toBe(0);   // vertical border
      expect(elevation(i * 211, PLOT_SIZE * 2, SEED)).toBe(0); // horizontal border
    }
  });
  it('produces land in occupied plots (finds a beach-or-higher sample)', () => {
    let found = 0;
    for (let c = 0; c < 10; c++) for (let r = 0; r < 10; r++) {
      const s = plotSpec(c, r, SEED);
      if (!s.occupied) continue;
      let peak = 0;
      for (let sx = 0; sx < 25; sx++) for (let sy = 0; sy < 25; sy++) {
        peak = Math.max(peak, elevation(c * PLOT_SIZE + (sx + 0.5) * (PLOT_SIZE / 25), r * PLOT_SIZE + (sy + 0.5) * (PLOT_SIZE / 25), SEED));
      }
      if (peak >= THRESHOLD.BEACH) found++;
    }
    expect(found).toBeGreaterThan(30);
  });
});

describe('bandAt', () => {
  it('thresholds are strictly ordered', () => {
    expect(THRESHOLD.SHALLOW).toBeLessThan(THRESHOLD.BEACH);
    expect(THRESHOLD.BEACH).toBeLessThan(THRESHOLD.GRASS);
    expect(THRESHOLD.GRASS).toBeLessThan(THRESHOLD.JUNGLE);
    expect(THRESHOLD.JUNGLE).toBeLessThan(THRESHOLD.ROCK);
  });
  it('maps elevation to the right band', () => {
    // plot border is guaranteed elevation 0 → DEEP
    expect(bandAt(PLOT_SIZE, 0, SEED)).toBe(BAND.DEEP);
  });
});
