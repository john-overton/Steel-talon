import { describe, expect, it } from 'vitest';
import { layerOffsets } from '../../engine/sprite';
import { BOAT_HULL, BOAT_TURRET, createBoat } from './boat';

describe('drone boat sprite', () => {
  it('hull is a single 48x32 frame', () => {
    expect(BOAT_HULL.frames).toHaveLength(1);
    expect(BOAT_HULL.frames[0].width).toBe(48);
    expect(BOAT_HULL.frames[0].height).toBe(32);
  });

  it('turret is a single 12x12 frame mounted at its rotation centre', () => {
    expect(BOAT_TURRET.frames).toHaveLength(1);
    expect(BOAT_TURRET.frames[0].width).toBe(12);
    expect(BOAT_TURRET.frames[0].height).toBe(12);
    expect(BOAT_TURRET.anchors.mount).toEqual([6, 4]);
  });

  it('turret anchor sits on the hull centerline', () => {
    expect(BOAT_HULL.anchors.turret[0]).toBeGreaterThanOrEqual(22);
    expect(BOAT_HULL.anchors.turret[0]).toBeLessThanOrEqual(25);
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
    expect(offsets[1].x + width).toBeLessThanOrEqual(48);
    expect(offsets[1].y + height).toBeLessThanOrEqual(32);
  });
});
