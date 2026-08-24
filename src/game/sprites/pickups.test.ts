import { describe, expect, it } from 'vitest';
import {
  CRATE, MINIGUN_PICKUP, ROCKET_PICKUP, rotateGrid, SALVAGE,
} from './pickups';

describe('rotateGrid', () => {
  it('rotates 90° clockwise', () => {
    expect(rotateGrid(['ab', 'cd'])).toEqual(['ca', 'db']);
    expect(rotateGrid(['abc', 'def'])).toEqual(['da', 'eb', 'fc']);
  });

  it('four rotations return the original', () => {
    const g = ['ab.', '.cd', 'e..'];
    let r = g;
    for (let i = 0; i < 4; i++) r = rotateGrid(r);
    expect(r).toEqual(g);
  });
});

describe('weapon pickups', () => {
  for (const [name, def] of [['minigun', MINIGUN_PICKUP], ['rocket', ROCKET_PICKUP]] as const) {
    it(`${name} pickup has 4 rotating 32x32 frames with a centered anchor`, () => {
      expect(def.frames).toHaveLength(4);
      for (const f of def.frames) {
        expect(f.width).toBe(32);
        expect(f.height).toBe(32);
      }
      expect(def.anchors.center).toEqual([16, 16]);
    });

    it(`${name} frames differ (rotation + glow pulse are visible)`, () => {
      const [a, b] = def.frames;
      // Array.from rather than Node's Buffer: tsconfig lib is ES2022 + DOM only.
      expect(Array.from(a.rgba)).not.toEqual(Array.from(b.rgba));
    });
  }
});

describe('crate and salvage', () => {
  it('crate is 12x10 with center anchor', () => {
    expect(CRATE.frames).toHaveLength(1);
    expect(CRATE.frames[0].width).toBe(12);
    expect(CRATE.frames[0].height).toBe(10);
    expect(CRATE.anchors.center).toEqual([6, 5]);
  });

  it('salvage spins two 8x8 frames', () => {
    expect(SALVAGE.frames).toHaveLength(2);
    for (const f of SALVAGE.frames) {
      expect(f.width).toBe(8);
      expect(f.height).toBe(8);
    }
  });
});
