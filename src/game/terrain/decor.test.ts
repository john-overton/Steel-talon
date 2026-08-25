import { describe, expect, it } from 'vitest';
import { BAND, PLOT_SIZE, bandAt, plotSpec } from './field';
import { decorationsIn, villageSites } from './decor';

const SEED = 0xc0ffee;

// Find a rect containing land in an occupied plot.
function landRect(): [number, number, number, number] {
  for (let c = 0; c < 10; c++) for (let r = 0; r < 10; r++) {
    if (!plotSpec(c, r, SEED).occupied) continue;
    for (let sx = 0; sx < 40; sx++) for (let sy = 0; sy < 40; sy++) {
      const x = c * PLOT_SIZE + sx * 125, y = r * PLOT_SIZE + sy * 125;
      if (bandAt(x, y, SEED) >= BAND.GRASS) return [x - 600, y - 600, x + 600, y + 600];
    }
  }
  throw new Error('no land found');
}

describe('decorationsIn', () => {
  it('is deterministic and stable across different query windows', () => {
    const [x0, y0, x1, y1] = landRect();
    const a = decorationsIn(x0, y0, x1, y1, SEED);
    expect(a).toEqual(decorationsIn(x0, y0, x1, y1, SEED));
    // same world position must yield the same decoration regardless of window
    const b = decorationsIn(x0 - 500, y0 - 500, x1 + 500, y1 + 500, SEED);
    for (const d of a) expect(b).toContainEqual(d);
  });
  it('places trees only on grass/jungle, boulders only on grass/rock', () => {
    const [x0, y0, x1, y1] = landRect();
    for (const d of decorationsIn(x0, y0, x1, y1, SEED)) {
      const band = bandAt(d.x, d.y, SEED);
      if (d.kind.startsWith('tree')) expect([BAND.GRASS, BAND.JUNGLE]).toContain(band);
      if (d.kind === 'boulder') expect([BAND.GRASS, BAND.ROCK]).toContain(band);
    }
  });
  it('finds some trees on a big enough land sweep', () => {
    const [x0, y0, x1, y1] = landRect();
    const all = decorationsIn(x0 - 1000, y0 - 1000, x1 + 1000, y1 + 1000, SEED);
    expect(all.some((d) => d.kind.startsWith('tree'))).toBe(true);
  });
  it('returns decorations sorted by y', () => {
    const [x0, y0, x1, y1] = landRect();
    const a = decorationsIn(x0, y0, x1, y1, SEED);
    for (let i = 1; i < a.length; i++) expect(a[i].y).toBeGreaterThanOrEqual(a[i - 1].y);
  });
});

describe('villageSites', () => {
  it('is deterministic, bounded 0..2, on beach/grass, empty for unoccupied plots', () => {
    let placed = 0;
    for (let c = 0; c < 12; c++) for (let r = 0; r < 12; r++) {
      const sites = villageSites(c, r, SEED);
      expect(sites).toEqual(villageSites(c, r, SEED));
      expect(sites.length).toBeLessThanOrEqual(2);
      if (!plotSpec(c, r, SEED).occupied) expect(sites).toEqual([]);
      for (const s of sites) {
        expect([BAND.BEACH, BAND.GRASS]).toContain(bandAt(s.x, s.y, SEED));
        placed++;
      }
    }
    expect(placed).toBeGreaterThan(5);
  });
  it('suppresses trees near village sites', () => {
    outer: for (let c = 0; c < 12; c++) for (let r = 0; r < 12; r++) {
      const sites = villageSites(c, r, SEED);
      if (!sites.length) continue;
      const s = sites[0];
      const near = decorationsIn(s.x - 48, s.y - 48, s.x + 48, s.y + 48, SEED);
      for (const d of near) {
        if (!d.kind.startsWith('tree') && d.kind !== 'boulder') continue;
        const dist = Math.hypot(d.x - s.x, d.y - s.y);
        expect(dist).toBeGreaterThanOrEqual(48);
      }
      break outer;
    }
  });
});
