import { describe, expect, it } from 'vitest';
import { CHOPPER_FRAMES } from './player';

describe('CHOPPER_FRAMES', () => {
  it('parses two frames of identical 16-wide dimensions', () => {
    expect(CHOPPER_FRAMES).toHaveLength(2);
    for (const frame of CHOPPER_FRAMES) {
      expect(frame.width).toBe(16);
      expect(frame.height).toBe(CHOPPER_FRAMES[0].height);
      expect(frame.rgba.length).toBe(frame.width * frame.height * 4);
    }
  });
});
