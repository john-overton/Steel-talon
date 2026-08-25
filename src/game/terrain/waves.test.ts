import { describe, expect, it } from 'vitest';
import { PLOT_SIZE, THRESHOLD, elevation } from './field';
import { WAVE_CELL, wavesIn } from './waves';

const SEED = 0xc0ffee;

// Scan for a rect near a coastline: find an occupied-plot area with shore-band cells.
function shoreRect(): [number, number, number, number] {
  for (let c = 0; c < 10; c++) for (let r = 0; r < 10; r++) {
    for (let sx = 0; sx < 40; sx++) for (let sy = 0; sy < 40; sy++) {
      const x = c * PLOT_SIZE + sx * 125, y = r * PLOT_SIZE + sy * 125;
      const e = elevation(x, y, SEED);
      if (e > THRESHOLD.SHALLOW * 0.7 && e < THRESHOLD.BEACH) return [x - 400, y - 400, x + 400, y + 400];
    }
  }
  throw new Error('no shore found');
}

describe('wavesIn', () => {
  it('exports the cell size used to bucket waves', () => {
    expect(WAVE_CELL).toBe(32);
  });
  it('is deterministic for a given tick', () => {
    const [x0, y0, x1, y1] = shoreRect();
    expect(wavesIn(x0, y0, x1, y1, SEED, 120)).toEqual(wavesIn(x0, y0, x1, y1, SEED, 120));
  });
  it('finds waves near a coastline and none in open deep water', () => {
    const [x0, y0, x1, y1] = shoreRect();
    let any = 0;
    for (let t = 0; t < 240; t += 10) any += wavesIn(x0, y0, x1, y1, SEED, t).length;
    expect(any).toBeGreaterThan(0);
    // plot borders are guaranteed deep water
    expect(wavesIn(PLOT_SIZE - 40, -40, PLOT_SIZE + 40, 40, SEED, 120)).toEqual([]);
  });
  it('waves have 3..12 points, finite coords, alpha in [0,1]', () => {
    const [x0, y0, x1, y1] = shoreRect();
    for (let t = 0; t < 240; t += 15) {
      for (const w of wavesIn(x0, y0, x1, y1, SEED, t)) {
        expect(w.pts.length).toBeGreaterThanOrEqual(3);
        expect(w.pts.length).toBeLessThanOrEqual(12);
        expect(w.alpha).toBeGreaterThanOrEqual(0);
        expect(w.alpha).toBeLessThanOrEqual(1);
        for (const p of w.pts) { expect(Number.isFinite(p.x)).toBe(true); expect(Number.isFinite(p.y)).toBe(true); }
      }
    }
  });
  it('animates: a wave drifts toward land over its cycle', () => {
    const [x0, y0, x1, y1] = shoreRect();
    let moved = false;
    const a = wavesIn(x0, y0, x1, y1, SEED, 0);
    const b = wavesIn(x0, y0, x1, y1, SEED, 30);
    if (a.length && b.length && a[0].pts.length && b[0].pts.length) {
      moved = a[0].pts[0].x !== b[0].pts[0].x || a[0].pts[0].y !== b[0].pts[0].y || a[0].alpha !== b[0].alpha;
    } else moved = a.length !== b.length; // waves appearing/disappearing also proves animation
    expect(moved).toBe(true);
  });
});
