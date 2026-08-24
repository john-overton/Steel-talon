import { describe, expect, it } from 'vitest';
import { visibleRange } from './tilemap';

describe('visibleRange', () => {
  it('covers exactly the tiles intersecting the view', () => {
    // cam=0, view=480, tile=16 → tiles 0..29 (30 tiles * 16 = 480)
    expect(visibleRange(0, 480, 16)).toEqual([0, 29]);
  });

  it('includes partially visible tiles on both edges', () => {
    // cam=8: tile 0 is half visible; right edge at 488 → tile 30 half visible
    expect(visibleRange(8, 480, 16)).toEqual([0, 30]);
  });

  it('handles negative camera positions', () => {
    expect(visibleRange(-20, 64, 16)).toEqual([-2, 2]);
  });

  it('exact multiples do not overshoot', () => {
    expect(visibleRange(16, 32, 16)).toEqual([1, 2]);
  });
});
