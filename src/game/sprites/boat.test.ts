import { describe, expect, it } from 'vitest';
import { layerOffsets } from '../../engine/sprite';
import { BOAT_HULL, BOAT_TURRET, createBoat } from './boat';

describe('drone boat sprite', () => {
  it('hull is a single 24x16 frame', () => {
    expect(BOAT_HULL.frames).toHaveLength(1);
    expect(BOAT_HULL.frames[0].width).toBe(24);
    expect(BOAT_HULL.frames[0].height).toBe(16);
  });

  it('every anchor lies inside its sprite bounds', () => {
    for (const def of [BOAT_HULL, BOAT_TURRET]) {
      const { width, height } = def.frames[0];
      for (const [x, y] of Object.values(def.anchors)) {
        expect(x).toBeGreaterThanOrEqual(0);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThan(width);
        expect(y).toBeLessThan(height);
      }
    }
  });

  it('createBoat stacks hull then turret', () => {
    const boat = createBoat();
    expect(boat.layers).toHaveLength(2);
    expect(boat.layers[0].def).toBe(BOAT_HULL);
    expect(boat.layers[1].def).toBe(BOAT_TURRET);
  });

  it('turret sits fully inside the hull footprint', () => {
    const boat = createBoat();
    const offsets = layerOffsets(boat);
    const { width, height } = BOAT_TURRET.frames[0];
    expect(offsets[1].x).toBeGreaterThanOrEqual(0);
    expect(offsets[1].y).toBeGreaterThanOrEqual(0);
    expect(offsets[1].x + width).toBeLessThanOrEqual(24);
    expect(offsets[1].y + height).toBeLessThanOrEqual(16);
  });
});
