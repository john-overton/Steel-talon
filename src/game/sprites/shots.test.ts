import { describe, expect, it } from 'vitest';
import { MUZZLE_FLASH, ROCKET, TRACER } from './shots';

describe('shot sprites', () => {
  it('tracer is a single 4x8 frame with a center anchor', () => {
    expect(TRACER.frames).toHaveLength(1);
    expect(TRACER.frames[0].width).toBe(4);
    expect(TRACER.frames[0].height).toBe(8);
    expect(TRACER.anchors.center).toEqual([2, 4]);
  });

  it('muzzle flash has two 9x9 frames and a mount anchor', () => {
    expect(MUZZLE_FLASH.frames).toHaveLength(2);
    for (const f of MUZZLE_FLASH.frames) {
      expect(f.width).toBe(9);
      expect(f.height).toBe(9);
    }
    expect(MUZZLE_FLASH.anchors.mount).toEqual([4, 4]);
  });

  it('ROCKET is a 4x10 single frame with a center anchor', () => {
    expect(ROCKET.frames).toHaveLength(1);
    expect(ROCKET.frames[0].width).toBe(4);
    expect(ROCKET.frames[0].height).toBe(10);
    expect(ROCKET.anchors.center).toEqual([2, 5]);
  });
});
