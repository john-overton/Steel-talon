import { describe, expect, it } from 'vitest';
import { circlesOverlap } from './collide';

describe('circlesOverlap', () => {
  it('detects overlapping circles', () => {
    expect(circlesOverlap(0, 0, 5, 3, 0, 5)).toBe(true);
  });

  it('rejects distant circles', () => {
    expect(circlesOverlap(0, 0, 2, 100, 100, 2)).toBe(false);
  });

  it('treats exact touching as non-overlap (strict)', () => {
    expect(circlesOverlap(0, 0, 3, 5, 0, 2)).toBe(false); // distance 5 === 3+2
  });

  it('handles concentric circles', () => {
    expect(circlesOverlap(10, 10, 1, 10, 10, 8)).toBe(true);
  });
});
