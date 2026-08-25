import { describe, expect, it } from 'vitest';
import { BOULDER, HUT, PATH_PATCH, TREE_LARGE, TREE_MED, TREE_SMALL } from './terrain-decor';

describe('terrain decor grids', () => {
  it('all parse with sensible sizes and some opaque pixels', () => {
    for (const g of [TREE_SMALL, TREE_MED, TREE_LARGE, HUT, BOULDER, PATH_PATCH]) {
      expect(g.width).toBeGreaterThanOrEqual(8);
      expect(g.height).toBeGreaterThanOrEqual(8);
      let opaque = 0;
      for (let i = 3; i < g.rgba.length; i += 4) if (g.rgba[i] === 255) opaque++;
      expect(opaque).toBeGreaterThan(g.width * g.height * 0.3);
    }
    expect(TREE_SMALL.width).toBeLessThan(TREE_MED.width);
    expect(TREE_MED.width).toBeLessThan(TREE_LARGE.width);
  });
});
