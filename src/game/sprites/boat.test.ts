import { describe, expect, it } from 'vitest';
import { layerOffsets } from '../../engine/sprite';
import { BOAT_HULL, BOAT_TURRET, TURRET_LAYER, createBoat, turretFrame } from './boat';

describe('drone boat sprite', () => {
  it('hull is a single 48x32 frame', () => {
    expect(BOAT_HULL.frames).toHaveLength(1);
    expect(BOAT_HULL.frames[0].width).toBe(48);
    expect(BOAT_HULL.frames[0].height).toBe(32);
  });

  it('turret has 16 rotation frames, all 16x16, mounted at the rotation centre', () => {
    expect(BOAT_TURRET.frames).toHaveLength(16);
    for (const f of BOAT_TURRET.frames) {
      expect(f.width).toBe(16);
      expect(f.height).toBe(16);
    }
    expect(BOAT_TURRET.anchors.mount).toEqual([8, 8]);
  });

  it('the barrel survives rotation and points along each cardinal frame', () => {
    const [mx, my] = BOAT_TURRET.anchors.mount;
    const alphaAt = (f: number, x: number, y: number) =>
      BOAT_TURRET.frames[f].rgba[(y * 16 + x) * 4 + 3];
    // Beyond BODY_R the only opaque pixels are barrel; the box ends at r 5.
    const BODY_R = 6;
    // Is anything opaque past the body radius along a unit direction?
    const barrelReaches = (f: number, dx: number, dy: number) => {
      for (let r = BODY_R; r <= 7; r++) {
        if (alphaAt(f, mx + dx * r, my + dy * r) === 255) return true;
      }
      return false;
    };

    // Frame 0 (base art) aims down-screen and nowhere else.
    expect(barrelReaches(0, 0, 1)).toBe(true);
    expect(barrelReaches(0, 1, 0)).toBe(false);
    expect(barrelReaches(0, -1, 0)).toBe(false);
    expect(barrelReaches(0, 0, -1)).toBe(false);

    // +90° right, 180° up, -90° left — each keeps the barrel, exclusively.
    expect(barrelReaches(4, 1, 0)).toBe(true);
    expect(barrelReaches(4, 0, 1)).toBe(false);
    expect(barrelReaches(8, 0, -1)).toBe(true);
    expect(barrelReaches(8, 0, 1)).toBe(false);
    expect(barrelReaches(12, -1, 0)).toBe(true);
    expect(barrelReaches(12, 0, 1)).toBe(false);
  });

  it('no rotation frame clips the barrel away', () => {
    const [mx, my] = BOAT_TURRET.anchors.mount;
    for (let f = 0; f < 16; f++) {
      const theta = (f * Math.PI * 2) / 16;
      // Barrel tip direction for this frame: (sin θ, cos θ), radius ~7.
      const x = Math.round(mx + Math.sin(theta) * 6);
      const y = Math.round(my + Math.cos(theta) * 6);
      expect(BOAT_TURRET.frames[f].rgba[(y * 16 + x) * 4 + 3]).toBe(255);
    }
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
