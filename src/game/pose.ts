// Pose selection for banked/pitched craft sprites: pure direction mapping,
// stateless velocity thresholds for smooth analytic movers (title flyover,
// delta weave), and an integer tick-ramped tracker for binary key input
// (TOP player). Deterministic; no allocation after creation.
export type PoseDir =
  | 'neutral' | 'up' | 'down' | 'left' | 'right'
  | 'upleft' | 'upright' | 'downleft' | 'downright';
export type PoseIntensity = 0 | 1 | 2;

export const POSE_DEADZONE = 0.01;
export const POSE_RAMP_TICKS = 6;

// Frame-array ordering shared with buildPoseFrames(): index 0 is neutral,
// then each direction below at slight-then-full intensity.
export const POSE_DIR_ORDER = [
  'up', 'down', 'left', 'right', 'upleft', 'upright', 'downleft', 'downright',
] as const;

export function poseDir(dx: number, dy: number, deadzone = POSE_DEADZONE): PoseDir {
  const x = Math.abs(dx) < deadzone ? 0 : Math.sign(dx);
  const y = Math.abs(dy) < deadzone ? 0 : Math.sign(dy);
  if (x === 0 && y === 0) return 'neutral';
  if (x === 0) return y < 0 ? 'up' : 'down';
  if (y === 0) return x < 0 ? 'left' : 'right';
  if (y < 0) return x < 0 ? 'upleft' : 'upright';
  return x < 0 ? 'downleft' : 'downright';
}

export function poseFrameIndex(dir: PoseDir, intensity: PoseIntensity): number {
  if (dir === 'neutral' || intensity === 0) return 0;
  const ord = POSE_DIR_ORDER.indexOf(dir as (typeof POSE_DIR_ORDER)[number]);
  return 1 + ord * 2 + (intensity - 1);
}

export function poseFromVelocity(
  vx: number, vy: number, slow: number, fast: number,
): { dir: PoseDir; intensity: PoseIntensity } {
  const ax = Math.abs(vx) < slow ? 0 : Math.abs(vx);
  const ay = Math.abs(vy) < slow ? 0 : Math.abs(vy);
  const speed = Math.max(ax, ay);
  const intensity: PoseIntensity = speed >= fast ? 2 : speed >= slow ? 1 : 0;
  return { dir: poseDir(vx, vy, slow), intensity };
}

export interface PoseTracker {
  dir: PoseDir;
  step: number;
  tick(target: PoseDir): void;
  intensity(): PoseIntensity;
}

export function createPoseTracker(): PoseTracker {
  return {
    dir: 'neutral',
    step: 0,
    tick(target: PoseDir): void {
      if (target === this.dir) {
        // Neutral has no lean to ramp into: it is always step 0.
        if (this.dir === 'neutral') this.step = 0;
        else if (this.step < POSE_RAMP_TICKS * 2) this.step++;
      } else if (this.step > 0) {
        this.step--;
        if (this.step === 0) this.dir = target;
      } else {
        this.dir = target;
      }
    },
    intensity(): PoseIntensity {
      return this.step >= POSE_RAMP_TICKS * 2 ? 2 : this.step >= POSE_RAMP_TICKS ? 1 : 0;
    },
  };
}
