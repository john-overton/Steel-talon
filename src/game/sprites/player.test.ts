import { describe, expect, it } from 'vitest';
import { layerOffsets } from '../../engine/sprite';
import {
  CHOPPER_BODY,
  CHOPPER_ROTOR,
  MISSILE,
  ROCKET_POD,
  createChopper,
} from './player';

describe('chopper sprite', () => {
  it('body is a single 32x32 frame', () => {
    expect(CHOPPER_BODY.frames).toHaveLength(1);
    expect(CHOPPER_BODY.frames[0].width).toBe(32);
    expect(CHOPPER_BODY.frames[0].height).toBe(32);
  });

  it('rotor has two frames of identical dimensions with a hub anchor', () => {
    expect(CHOPPER_ROTOR.frames).toHaveLength(2);
    const [a, b] = CHOPPER_ROTOR.frames;
    expect(a.width).toBe(b.width);
    expect(a.height).toBe(b.height);
    expect(CHOPPER_ROTOR.anchors.hub).toBeDefined();
  });

  it('every anchor lies inside its sprite bounds', () => {
    for (const def of [CHOPPER_BODY, CHOPPER_ROTOR, ROCKET_POD, MISSILE]) {
      const { width, height } = def.frames[0];
      for (const [x, y] of Object.values(def.anchors)) {
        expect(x).toBeGreaterThanOrEqual(0);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThan(width);
        expect(y).toBeLessThan(height);
      }
    }
  });

  it('body exposes pylon hardpoints for future missile pickups', () => {
    expect(CHOPPER_BODY.anchors.pylonL).toBeDefined();
    expect(CHOPPER_BODY.anchors.pylonR).toBeDefined();
    expect(MISSILE.anchors.mount).toBeDefined();
  });

  it('createChopper stacks body, two rocket pods, then rotor on top', () => {
    const chopper = createChopper();
    expect(chopper.layers).toHaveLength(4);
    expect(chopper.layers[0].def).toBe(CHOPPER_BODY);
    expect(chopper.layers[1].def).toBe(ROCKET_POD);
    expect(chopper.layers[2].def).toBe(ROCKET_POD);
    expect(chopper.layers[3].def).toBe(CHOPPER_ROTOR);
  });

  it('layer offsets keep every layer inside the 32x32 body footprint', () => {
    const chopper = createChopper();
    const offsets = layerOffsets(chopper);
    chopper.layers.forEach((layer, i) => {
      const { width, height } = layer.def.frames[0];
      expect(offsets[i].x).toBeGreaterThanOrEqual(0);
      expect(offsets[i].y).toBeGreaterThanOrEqual(0);
      expect(offsets[i].x + width).toBeLessThanOrEqual(32);
      expect(offsets[i].y + height).toBeLessThanOrEqual(32);
    });
  });

  it('centers the rotor hub on the body mast', () => {
    const chopper = createChopper();
    const offsets = layerOffsets(chopper);
    const hub = CHOPPER_ROTOR.anchors.hub;
    const mast = CHOPPER_BODY.anchors.mast;
    expect(offsets[3].x + hub[0]).toBe(mast[0]);
    expect(offsets[3].y + hub[1]).toBe(mast[1]);
  });
});
