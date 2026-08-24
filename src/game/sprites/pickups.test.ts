import { describe, expect, it } from 'vitest';
import {
  CRATE, MINIGUN_PICKUP, ROCKET_PICKUP, rotateGrid, SALVAGE,
} from './pickups';
import type { PixelGrid } from '../../engine/sprite';

// RGB of one pixel, so the ring-pulse assertions can name a colour.
function pixel(grid: PixelGrid, x: number, y: number): [number, number, number] {
  const o = (y * grid.width + x) * 4;
  return [grid.rgba[o], grid.rgba[o + 1], grid.rgba[o + 2]];
}

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
    it(`${name} pickup has 4 rotating 64x64 frames with a centered anchor`, () => {
      expect(def.frames).toHaveLength(4);
      for (const f of def.frames) {
        expect(f.width).toBe(64);
        expect(f.height).toBe(64);
      }
      expect(def.anchors.center).toEqual([32, 32]);
    });

    it(`${name} frames differ (rotation + glow pulse are visible)`, () => {
      const [a, b] = def.frames;
      // Array.from rather than Node's Buffer: tsconfig lib is ES2022 + DOM only.
      expect(Array.from(a.rgba)).not.toEqual(Array.from(b.rgba));
    });

    it(`${name} glow ring at radius 28 pulses yellow to white`, () => {
      // (32, 4) is 28px straight up from the centre: on the ring, clear of the
      // 32x32 glyph inset at 16.
      const [a, b] = def.frames;
      expect(pixel(a, 32, 4)).toEqual([0xfb, 0xf2, 0x36]); // palette '8'
      expect(pixel(b, 32, 4)).toEqual([0xff, 0xff, 0xff]); // palette 'l'
      expect(pixel(a, 32, 4)).not.toEqual(pixel(b, 32, 4));
    });
  }
});

describe('crate and salvage', () => {
  it('crate is 24x20 with center anchor', () => {
    expect(CRATE.frames).toHaveLength(1);
    expect(CRATE.frames[0].width).toBe(24);
    expect(CRATE.frames[0].height).toBe(20);
    expect(CRATE.anchors.center).toEqual([12, 10]);
  });

  it('salvage glints across two 16x16 frames', () => {
    expect(SALVAGE.frames).toHaveLength(2);
    for (const f of SALVAGE.frames) {
      expect(f.width).toBe(16);
      expect(f.height).toBe(16);
    }
    const [a, b] = SALVAGE.frames;
    expect(Array.from(a.rgba)).not.toEqual(Array.from(b.rgba));
    // The glint travels from the upper-left facet to the lower-right one.
    expect(pixel(a, 5, 3)).toEqual([0xcb, 0xdb, 0xfc]); // palette 'k'
    expect(pixel(b, 5, 3)).not.toEqual([0xcb, 0xdb, 0xfc]);
    expect(pixel(b, 9, 9)).toEqual([0xcb, 0xdb, 0xfc]);
    expect(pixel(a, 9, 9)).not.toEqual([0xcb, 0xdb, 0xfc]);
  });
});
