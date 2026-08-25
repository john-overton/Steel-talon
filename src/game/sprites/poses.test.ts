import { describe, expect, it } from 'vitest';
import { parseGrid, type PixelGrid } from '../../engine/sprite';
import { bankGrid, buildPoseFrames, pitchGrid } from './poses';

const PAL = ['#000000', '#ff0000', '#00ff00'];

// 16x8 mirror-symmetric test craft: an oval, wide enough that a full-bank
// squash (4px) is a modest fraction of the width, as on the real 64px art.
const CRAFT = parseGrid([
  '....11111111....',
  '..122222222221..',
  '.12222222222221.',
  '1222222222222221',
  '1222222222222221',
  '.12222222222221.',
  '..122222222221..',
  '....11111111....',
], PAL);

function opaqueCount(g: PixelGrid): number {
  let n = 0;
  for (let i = 3; i < g.rgba.length; i += 4) if (g.rgba[i] > 0) n++;
  return n;
}

function occupiedRows(g: PixelGrid): { top: number; bottom: number } {
  let top = -1;
  let bottom = -1;
  for (let y = 0; y < g.height; y++) {
    for (let x = 0; x < g.width; x++) {
      if (g.rgba[(y * g.width + x) * 4 + 3] > 0) {
        if (top < 0) top = y;
        bottom = y;
        break;
      }
    }
  }
  return { top, bottom };
}

describe('bankGrid', () => {
  it('keeps dimensions and bounds opaque-pixel loss', () => {
    // slight bank drops ~squash/width of the columns (2/16 here): hold 25%
    const slight = bankGrid(CRAFT, 'left', 1);
    expect(slight.width).toBe(CRAFT.width);
    expect(slight.height).toBe(CRAFT.height);
    expect(opaqueCount(slight)).toBeGreaterThanOrEqual(opaqueCount(CRAFT) * 0.75);
    expect(opaqueCount(slight)).toBeLessThanOrEqual(opaqueCount(CRAFT));
    // full bank loses more on this small test grid (4/16 of columns): 55%
    const full = bankGrid(CRAFT, 'left', 2);
    expect(full.width).toBe(CRAFT.width);
    expect(full.height).toBe(CRAFT.height);
    expect(opaqueCount(full)).toBeGreaterThanOrEqual(opaqueCount(CRAFT) * 0.55);
    expect(opaqueCount(full)).toBeLessThanOrEqual(opaqueCount(CRAFT));
  });

  it('left and right banks of a symmetric input are near mirror images', () => {
    const l = bankGrid(CRAFT, 'left', 2);
    const r = bankGrid(CRAFT, 'right', 2);
    let mismatches = 0;
    for (let y = 0; y < l.height; y++) {
      for (let x = 0; x < l.width; x++) {
        const a = l.rgba[(y * l.width + x) * 4 + 3] > 0;
        const b = r.rgba[(y * r.width + (r.width - 1 - x)) * 4 + 3] > 0;
        if (a !== b) mismatches++;
      }
    }
    // rounding may disagree by a pixel here and there, never structurally
    expect(mismatches).toBeLessThanOrEqual(Math.ceil(l.width * l.height * 0.05));
  });

  it('actually moves pixels (not identity)', () => {
    const g = bankGrid(CRAFT, 'left', 2);
    expect(Array.from(g.rgba)).not.toEqual(Array.from(CRAFT.rgba));
  });
});

describe('pitchGrid', () => {
  it('compresses the occupied span toward the requested edge', () => {
    const base = occupiedRows(CRAFT); // {top: 0, bottom: 7}
    const up = pitchGrid(CRAFT, 'up', 2); // crush 4
    const upRows = occupiedRows(up);
    expect(upRows.top).toBe(base.top);
    expect(upRows.bottom).toBe(base.bottom - 4);
    const down = pitchGrid(CRAFT, 'down', 2);
    const downRows = occupiedRows(down);
    expect(downRows.bottom).toBe(base.bottom);
    expect(downRows.top).toBe(base.top + 4);
    expect(up.width).toBe(CRAFT.width);
    expect(up.height).toBe(CRAFT.height);
  });
});

describe('buildPoseFrames', () => {
  it('returns 17 frames, frame 0 the untouched neutral, all same dimensions', () => {
    const frames = buildPoseFrames(CRAFT);
    expect(frames).toHaveLength(17);
    expect(frames[0]).toBe(CRAFT);
    for (const f of frames) {
      expect(f.width).toBe(CRAFT.width);
      expect(f.height).toBe(CRAFT.height);
    }
    // non-neutral frames differ from neutral
    expect(Array.from(frames[1].rgba)).not.toEqual(Array.from(CRAFT.rgba));
  });

  it('override wins over the generated warp; wrong dimensions throw', () => {
    // must match the neutral's 16x8 footprint; mismatches are rejected below
    const override = parseGrid(['1111111111111111', ...Array(7).fill('................')], PAL);
    const frames = buildPoseFrames(CRAFT, { 'left-2': override });
    // left is POSE_DIR_ORDER[2] -> indices 5 (slight), 6 (full)
    expect(frames[6]).toBe(override);
    const tiny = parseGrid(['1'], PAL);
    expect(() => buildPoseFrames(CRAFT, { 'up-1': tiny })).toThrow(/1x1/);
  });
});
