import { describe, expect, it } from 'vitest';
import { layerOffsets } from '../../engine/sprite';
import { BOAT_HULL, BOAT_TURRET, TURRET_LAYER, createBoat, turretFrame } from './boat';

describe('drone boat sprite', () => {
  it('hull is a single 48x32 frame', () => {
    expect(BOAT_HULL.frames).toHaveLength(1);
    expect(BOAT_HULL.frames[0].width).toBe(48);
    expect(BOAT_HULL.frames[0].height).toBe(32);
  });

  it('turret has 16 rotation frames, all 12x12, mounted at the rotation centre', () => {
    expect(BOAT_TURRET.frames).toHaveLength(16);
    for (const f of BOAT_TURRET.frames) {
      expect(f.width).toBe(12);
      expect(f.height).toBe(12);
    }
    expect(BOAT_TURRET.anchors.mount).toEqual([6, 4]);
  });

  it('frame 0 points the barrel down, frame 4 points it right', () => {
    const alphaAt = (f: number, x: number, y: number) =>
      BOAT_TURRET.frames[f].rgba[(y * 12 + x) * 4 + 3];
    // Base art: barrel pixels below the mount (6,10 opaque), nothing at (11,4).
    expect(alphaAt(0, 6, 10)).toBe(255);
    expect(alphaAt(0, 11, 4)).toBe(0);
    // Rotated +90° (frame 4): barrel extends right of the mount.
    expect(alphaAt(4, 11, 4)).toBe(255);
  });

  it('turretFrame quantizes angles to the nearest of 16 steps, wrapping', () => {
    expect(turretFrame(0)).toBe(0);
    expect(turretFrame(Math.PI / 2)).toBe(4);
    expect(turretFrame(-Math.PI / 2)).toBe(12);
    expect(turretFrame(Math.PI)).toBe(8);
    expect(turretFrame(0.1)).toBe(0);          // < half a step
    expect(turretFrame(Math.PI / 8)).toBe(1);  // exactly one step
  });

  it('exports the turret layer index', () => {
    expect(TURRET_LAYER).toBe(1);
    expect(createBoat().layers[TURRET_LAYER].def).toBe(BOAT_TURRET);
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
