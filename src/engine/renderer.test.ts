import { describe, expect, it } from 'vitest';
import { computePresentation, HEIGHT, upscaleFactor, WIDTH } from './renderer';

describe('computePresentation', () => {
  it('exports the 640x480 contract', () => {
    expect(WIDTH).toBe(640);
    expect(HEIGHT).toBe(480);
  });

  it('uses 1x at exactly 640x480 with no offset', () => {
    expect(computePresentation(640, 480)).toEqual({ scale: 1, x: 0, y: 0 });
  });

  it('picks the largest fractional scale that fits', () => {
    expect(computePresentation(1920, 1080).scale).toBeCloseTo(1080 / 480, 10); // 2.25
    expect(computePresentation(1280, 960).scale).toBeCloseTo(2, 10);
    expect(computePresentation(3840, 2160).scale).toBeCloseTo(2160 / 480, 10); // 4.5
    expect(computePresentation(1504, 812).scale).toBeCloseTo(812 / 480, 10); // ≈1.6917
  });

  it('scales below 1x when the window is smaller than the buffer', () => {
    const p = computePresentation(320, 240);
    expect(p.scale).toBeCloseTo(0.5, 10);
    expect(p.x).toBeCloseTo(0, 10);
    expect(p.y).toBeCloseTo(0, 10);
  });

  it('centers with letterbox offsets', () => {
    const p = computePresentation(1920, 1080); // 2.25x → 1440x1080 image
    expect(p.x).toBeCloseTo((1920 - 1440) / 2, 10);
    expect(p.y).toBeCloseTo((1080 - 1080) / 2, 10);
  });

  it('letterboxes on x only for a wide window (1504x812)', () => {
    const p = computePresentation(1504, 812);
    const scale = 812 / 480;
    expect(p.y).toBeCloseTo(0, 10);
    expect(p.x).toBeCloseTo((1504 - WIDTH * scale) / 2, 10);
  });
});

describe('upscaleFactor', () => {
  it('rounds up to the smallest integer factor >= scale, clamped to 1x', () => {
    expect(upscaleFactor(1.69)).toBe(2);
    expect(upscaleFactor(0.5)).toBe(1);
    expect(upscaleFactor(2)).toBe(2);
    expect(upscaleFactor(4.5)).toBe(5);
  });
});
