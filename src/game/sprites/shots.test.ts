import { describe, expect, it } from 'vitest';
import { MUZZLE_FLASH, ROCKET, TRACER } from './shots';

describe('shot sprites', () => {
  it('tracer is a single 2x4 frame with a center anchor', () => {
    expect(TRACER.frames).toHaveLength(1);
    expect(TRACER.frames[0].width).toBe(2);
    expect(TRACER.frames[0].height).toBe(4);
    expect(TRACER.anchors.center).toEqual([1, 2]);
  });

  it('muzzle flash has two 5x5 frames and a mount anchor', () => {
    expect(MUZZLE_FLASH.frames).toHaveLength(2);
    for (const f of MUZZLE_FLASH.frames) {
      expect(f.width).toBe(5);
      expect(f.height).toBe(5);
    }
    expect(MUZZLE_FLASH.anchors.mount).toEqual([2, 2]);
  });

  it('ROCKET is a 2x5 single frame with a center anchor', () => {
    expect(ROCKET.frames).toHaveLength(1);
    expect(ROCKET.frames[0].width).toBe(2);
    expect(ROCKET.frames[0].height).toBe(5);
    expect(ROCKET.anchors.center).toEqual([1, 2]);
  });
});
