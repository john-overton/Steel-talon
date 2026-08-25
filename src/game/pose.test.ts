import { describe, expect, it } from 'vitest';
import {
  createPoseTracker, POSE_DIR_ORDER, POSE_RAMP_TICKS, poseDir,
  poseFrameIndex, poseFromVelocity, type PoseDir, type PoseIntensity,
} from './pose';

describe('poseDir', () => {
  it('maps the 8 directions and the dead zone', () => {
    expect(poseDir(0, 0)).toBe('neutral');
    expect(poseDir(0.005, -0.005)).toBe('neutral'); // inside dead zone
    expect(poseDir(0, -1)).toBe('up');
    expect(poseDir(0, 1)).toBe('down');
    expect(poseDir(-1, 0)).toBe('left');
    expect(poseDir(1, 0)).toBe('right');
    expect(poseDir(-1, -1)).toBe('upleft');
    expect(poseDir(1, -1)).toBe('upright');
    expect(poseDir(-1, 1)).toBe('downleft');
    expect(poseDir(1, 1)).toBe('downright');
  });

  it('honors a custom dead zone per axis', () => {
    expect(poseDir(30, -100, 40)).toBe('up'); // x below the 40 dead zone
  });
});

describe('poseFrameIndex', () => {
  it('maps neutral and intensity 0 to frame 0', () => {
    expect(poseFrameIndex('neutral', 2)).toBe(0);
    expect(poseFrameIndex('left', 0)).toBe(0);
  });

  it('maps all 16 dir/intensity pairs to distinct indices 1-16 in order', () => {
    const seen: number[] = [];
    for (const dir of POSE_DIR_ORDER) {
      for (const intensity of [1, 2] as const) {
        seen.push(poseFrameIndex(dir, intensity));
      }
    }
    expect(seen).toEqual([...Array(16).keys()].map((i) => i + 1));
  });
});

describe('poseFromVelocity', () => {
  it('selects intensity by thresholds and dead-zones each axis at slow', () => {
    expect(poseFromVelocity(0, 0, 40, 90)).toEqual({ dir: 'neutral', intensity: 0 });
    expect(poseFromVelocity(39, 0, 40, 90)).toEqual({ dir: 'neutral', intensity: 0 });
    expect(poseFromVelocity(-50, 0, 40, 90)).toEqual({ dir: 'left', intensity: 1 });
    expect(poseFromVelocity(120, 0, 40, 90)).toEqual({ dir: 'right', intensity: 2 });
    expect(poseFromVelocity(-100, -100, 40, 90)).toEqual({ dir: 'upleft', intensity: 2 });
    // y below slow: pure lateral even though vy is nonzero
    expect(poseFromVelocity(60, 20, 40, 90)).toEqual({ dir: 'right', intensity: 1 });
  });
});

describe('PoseTracker', () => {
  it('ramps 0 -> 1 -> 2 at POSE_RAMP_TICKS per step while a direction is held', () => {
    const t = createPoseTracker();
    t.tick('left'); // adopts dir at step 0
    expect(t.dir).toBe('left');
    expect(t.intensity()).toBe(0);
    for (let i = 0; i < POSE_RAMP_TICKS; i++) t.tick('left'); // step -> 6
    expect(t.intensity()).toBe(1);
    for (let i = 0; i < POSE_RAMP_TICKS; i++) t.tick('left'); // step -> 12
    expect(t.intensity()).toBe(2);
    t.tick('left'); // saturates
    expect(t.intensity()).toBe(2);
  });

  it('decays through intensities on release, then adopts the new direction', () => {
    const t = createPoseTracker();
    for (let i = 0; i < 1 + POSE_RAMP_TICKS * 2; i++) t.tick('left'); // full lean
    const seen: Array<[PoseDir, PoseIntensity]> = [];
    for (let i = 0; i < POSE_RAMP_TICKS * 2; i++) {
      t.tick('right');
      seen.push([t.dir, t.intensity()]);
    }
    // decays while still showing 'left', never skipping a step
    expect(seen[0]).toEqual(['left', 1]); // step 11
    expect(seen[POSE_RAMP_TICKS - 1]).toEqual(['left', 1]); // step 6
    expect(seen[POSE_RAMP_TICKS]).toEqual(['left', 0]); // step 5
    expect(seen[POSE_RAMP_TICKS * 2 - 1]).toEqual(['right', 0]); // step 0: adopt
    for (let i = 0; i < POSE_RAMP_TICKS; i++) t.tick('right');
    expect(t.intensity()).toBe(1);
    expect(t.dir).toBe('right');
  });

  it('holding neutral decays to neutral and stays there', () => {
    const t = createPoseTracker();
    for (let i = 0; i < 10; i++) t.tick('up');
    for (let i = 0; i < 20; i++) t.tick('neutral');
    expect(t.dir).toBe('neutral');
    expect(t.intensity()).toBe(0);
    expect(t.step).toBe(0);
  });
});
