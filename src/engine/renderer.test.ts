import { describe, expect, it } from 'vitest';
import { computePresentation, HEIGHT, WIDTH } from './renderer';

describe('computePresentation', () => {
  it('exports the 640x480 contract', () => {
    expect(WIDTH).toBe(640);
    expect(HEIGHT).toBe(480);
  });

  it('uses 1x at exactly 640x480 with no offset', () => {
    expect(computePresentation(640, 480)).toEqual({ scale: 1, x: 0, y: 0 });
  });

  it('picks the largest integer scale that fits', () => {
    expect(computePresentation(1920, 1080).scale).toBe(2); // 1080/480 = 2.25 → 2
    expect(computePresentation(1280, 960).scale).toBe(2);
    expect(computePresentation(3840, 2160).scale).toBe(4);
  });

  it('never goes below 1x even when the window is smaller', () => {
    expect(computePresentation(320, 240).scale).toBe(1);
  });

  it('centers with letterbox offsets', () => {
    const p = computePresentation(1920, 1080); // 2x → 1280x960 image
    expect(p.x).toBe((1920 - 1280) / 2);
    expect(p.y).toBe((1080 - 960) / 2);
  });
});
