import { describe, expect, it } from 'vitest';
import { layerOffsets } from '../../engine/sprite';
import { createDelta, DELTA_BODY, DELTA_JET } from './delta';

describe('delta drone sprite', () => {
  it('body is a single 24x16 frame', () => {
    expect(DELTA_BODY.frames).toHaveLength(1);
    expect(DELTA_BODY.frames[0].width).toBe(24);
    expect(DELTA_BODY.frames[0].height).toBe(16);
  });

  it('jet has two frames of identical size with a mount anchor', () => {
    expect(DELTA_JET.frames).toHaveLength(2);
    expect(DELTA_JET.frames[0].width).toBe(DELTA_JET.frames[1].width);
    expect(DELTA_JET.frames[0].height).toBe(DELTA_JET.frames[1].height);
    expect(DELTA_JET.anchors.mount).toBeDefined();
  });

  it('anchors lie inside sprite bounds', () => {
    for (const def of [DELTA_BODY, DELTA_JET]) {
      const { width, height } = def.frames[0];
      for (const [x, y] of Object.values(def.anchors)) {
        expect(x).toBeGreaterThanOrEqual(0);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThan(width);
        expect(y).toBeLessThan(height);
      }
    }
  });

  it('createDelta layers body then jet, jet fully inside the body footprint', () => {
    const delta = createDelta();
    expect(delta.layers).toHaveLength(2);
    expect(delta.layers[0].def).toBe(DELTA_BODY);
    expect(delta.layers[1].def).toBe(DELTA_JET);
    const offsets = layerOffsets(delta);
    const jet = DELTA_JET.frames[0];
    expect(offsets[1].x).toBeGreaterThanOrEqual(0);
    expect(offsets[1].y).toBeGreaterThanOrEqual(0);
    expect(offsets[1].x + jet.width).toBeLessThanOrEqual(24);
    expect(offsets[1].y + jet.height).toBeLessThanOrEqual(16);
  });
});
