// Fixed 60Hz timestep: update logic is deterministic and frame-rate
// independent; render runs once per animation frame. Callers drive frame()
// from requestAnimationFrame; tests drive it with synthetic timestamps.
export const STEP = 1000 / 60;
const MAX_FRAME = 250; // clamp so a background tab doesn't spiral
// STEP is not exactly representable in binary floating point, so repeated
// subtraction leaves a sub-picosecond shortfall (3 * STEP - 3 * STEP != 0).
// Without this tolerance an exact N-step gap would run only N-1 updates.
const EPSILON = 1e-9;

export interface Loop { frame(now: number): void }

export function createLoop(update: (dt: number) => void, render: () => void): Loop {
  let last: number | null = null;
  let acc = 0;
  return {
    frame(now) {
      if (last !== null) {
        acc += Math.min(now - last, MAX_FRAME);
        while (acc >= STEP - EPSILON) {
          update(STEP / 1000);
          acc -= STEP;
        }
      }
      last = now;
      render();
    },
  };
}
