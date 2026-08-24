import { describe, expect, it } from 'vitest';
import { layerOffsets } from '../../engine/sprite';
import {
  CHOPPER_BODY,
  CHOPPER_ROTOR,
  LAYER,
  MISSILE,
  ROCKET_POD,
  createChopper,
} from './player';
import { MUZZLE_FLASH } from './shots';

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

  it('createChopper stacks body, pods, rotor, flashes, nose flash, missiles', () => {
    const chopper = createChopper();
    expect(chopper.layers).toHaveLength(9);
    expect(chopper.layers[LAYER.BODY].def).toBe(CHOPPER_BODY);
    expect(chopper.layers[LAYER.POD_L].def).toBe(ROCKET_POD);
    expect(chopper.layers[LAYER.POD_R].def).toBe(ROCKET_POD);
    expect(chopper.layers[LAYER.ROTOR].def).toBe(CHOPPER_ROTOR);
    expect(chopper.layers[LAYER.FLASH_L].def).toBe(MUZZLE_FLASH);
    expect(chopper.layers[LAYER.FLASH_R].def).toBe(MUZZLE_FLASH);
    expect(chopper.layers[LAYER.FLASH_NOSE].def).toBe(MUZZLE_FLASH);
    expect(chopper.layers[LAYER.FLASH_NOSE].attach).toEqual({ to: 'nose', by: 'mount' });
    expect(chopper.layers[LAYER.FLASH_NOSE].visible).toBe(false);
    expect(chopper.layers[LAYER.MISSILE_L].def).toBe(MISSILE);
    expect(chopper.layers[LAYER.MISSILE_L].attach).toEqual({ to: 'pylonL', by: 'mount' });
    expect(chopper.layers[LAYER.MISSILE_L].visible).toBe(false);
    expect(chopper.layers[LAYER.MISSILE_R].def).toBe(MISSILE);
    expect(chopper.layers[LAYER.MISSILE_R].attach).toEqual({ to: 'pylonR', by: 'mount' });
    expect(chopper.layers[LAYER.MISSILE_R].visible).toBe(false);
  });

  it('nose anchor sits on the fuselage centerline', () => {
    expect(CHOPPER_BODY.anchors.nose).toEqual([15, 10]);
  });

  it('muzzle flashes start hidden on the muzzle anchors', () => {
    const chopper = createChopper();
    expect(chopper.layers[LAYER.FLASH_L].visible).toBe(false);
    expect(chopper.layers[LAYER.FLASH_R].visible).toBe(false);
    expect(chopper.layers[LAYER.FLASH_L].attach).toEqual({ to: 'muzzleL', by: 'mount' });
    expect(chopper.layers[LAYER.FLASH_R].attach).toEqual({ to: 'muzzleR', by: 'mount' });
    expect(CHOPPER_BODY.anchors.muzzleL).toEqual([6, 13]);
    expect(CHOPPER_BODY.anchors.muzzleR).toEqual([25, 13]);
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
    expect(offsets[LAYER.ROTOR].x + hub[0]).toBe(mast[0]);
    expect(offsets[LAYER.ROTOR].y + hub[1]).toBe(mast[1]);
  });
});
