import { describe, expect, it } from 'vitest';
import { layerOffsets } from '../../engine/sprite';
import { createDelta, DELTA_BODY, DELTA_JET } from './delta';

describe('delta drone sprite', () => {
  it('body is a single 48x32 frame', () => {
    expect(DELTA_BODY.frames).toHaveLength(1);
    expect(DELTA_BODY.frames[0].width).toBe(48);
    expect(DELTA_BODY.frames[0].height).toBe(32);
  });

  it('jet has two frames of identical size with a mount anchor', () => {
    expect(DELTA_JET.frames).toHaveLength(2);
    expect(DELTA_JET.frames[0].width).toBe(DELTA_JET.frames[1].width);
    expect(DELTA_JET.frames[0].height).toBe(DELTA_JET.frames[1].height);
    expect(DELTA_JET.frames[0].width).toBe(8);
    expect(DELTA_JET.frames[0].height).toBe(6);
    expect(DELTA_JET.anchors.mount).toEqual([4, 5]);
  });

  it('jet frames differ in flame length, not just colour', () => {
    const lit = (f: number): number => {
      const { rgba } = DELTA_JET.frames[f];
      let n = 0;
      for (let i = 3; i < rgba.length; i += 4) if (rgba[i] > 0) n++;
      return n;
    };
    expect(lit(1)).toBeLessThan(lit(0));
  });

  it('tail anchor sits on the centreline at the exhaust nozzle', () => {
    expect(DELTA_BODY.anchors.tail).toEqual([24, 5]);
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
    expect(offsets[1].x + jet.width).toBeLessThanOrEqual(48);
    expect(offsets[1].y + jet.height).toBeLessThanOrEqual(32);
  });
});
