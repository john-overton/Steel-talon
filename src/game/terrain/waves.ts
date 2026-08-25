/**
 * Contour-following coastal wave lines: short polylines that hug the
 * shore band and drift toward land on a per-cell animation cycle. Pure
 * function of (cell, seed, tick) — no retained state. `wavesIn` is the
 * testable core; `drawWaves` is the thin canvas boundary.
 */
import { THRESHOLD, elevation, hash2 } from './field';
import { PALETTE } from '../palette';

export const WAVE_CELL = 32;

export interface Wave {
  pts: Array<{ x: number; y: number }>;
  alpha: number;
}

const GRAD_EPS = 4;
const STEP = 8;
const OFFSHORE = 24;
const SHORE_LOW_FACTOR = 0.6;

/** Gradient of elevation at a point via central difference. */
function gradientAt(x: number, y: number, seed: number): { gx: number; gy: number } {
  const gx = elevation(x + GRAD_EPS, y, seed) - elevation(x - GRAD_EPS, y, seed);
  const gy = elevation(x, y + GRAD_EPS, seed) - elevation(x, y - GRAD_EPS, seed);
  return { gx, gy };
}

/** Waves whose host cell lies within [x0,y0]..[x1,y1], for a given animation tick. */
export function wavesIn(x0: number, y0: number, x1: number, y1: number, seed: number, tick: number): Wave[] {
  const waves: Wave[] = [];

  const c0 = Math.floor(x0 / WAVE_CELL);
  const c1 = Math.floor(x1 / WAVE_CELL);
  const r0 = Math.floor(y0 / WAVE_CELL);
  const r1 = Math.floor(y1 / WAVE_CELL);

  for (let row = r0; row <= r1; row++) {
    for (let col = c0; col <= c1; col++) {
      const h = hash2(col, row, seed ^ 0x5eaf0a);
      if (h % 6 !== 0) continue;

      const cx = col * WAVE_CELL + WAVE_CELL / 2;
      const cy = row * WAVE_CELL + WAVE_CELL / 2;
      const e = elevation(cx, cy, seed);
      if (e < THRESHOLD.SHALLOW * SHORE_LOW_FACTOR || e >= THRESHOLD.BEACH) continue;

      const { gx: gx0, gy: gy0 } = gradientAt(cx, cy, seed);
      const mag0 = Math.hypot(gx0, gy0);
      if (mag0 < 1e-6) continue;

      const T = 90 + ((h >>> 8) % 60);
      const p = ((tick + ((h >>> 16) % T)) % T) / T;
      const alpha = Math.sin(p * Math.PI);
      const offset = (p - 1) * OFFSHORE;

      const count = 3 + (h % 10);
      const pts: Array<{ x: number; y: number }> = [];
      let px = cx;
      let py = cy;
      for (let i = 0; i < count; i++) {
        const { gx, gy } = gradientAt(px, py, seed);
        const mag = Math.hypot(gx, gy);
        const ngx = mag > 1e-6 ? gx / mag : gx0 / mag0;
        const ngy = mag > 1e-6 ? gy / mag : gy0 / mag0;
        // Contour dir = (-gy, gx); offset the whole line along +gradient.
        pts.push({ x: px + ngx * offset, y: py + ngy * offset });
        px += -ngy * STEP;
        py += ngx * STEP;
      }

      waves.push({ pts, alpha });
    }
  }

  return waves;
}

/** Strokes visible coastal wave lines in white over the current view. */
export function drawWaves(ctx: CanvasRenderingContext2D, camX: number, camY: number, seed: number, tick: number): void {
  const pad = 64;
  const waves = wavesIn(camX - pad, camY - pad, camX + ctx.canvas.width + pad, camY + ctx.canvas.height + pad, seed, tick);

  ctx.strokeStyle = PALETTE[21]; // white
  ctx.lineWidth = 1.5;
  ctx.lineCap = 'round';

  for (const wave of waves) {
    if (wave.pts.length < 2) continue;
    ctx.globalAlpha = wave.alpha * 0.8;
    ctx.beginPath();
    ctx.moveTo(wave.pts[0].x - camX, wave.pts[0].y - camY);
    for (let i = 1; i < wave.pts.length; i++) {
      ctx.lineTo(wave.pts[i].x - camX, wave.pts[i].y - camY);
    }
    ctx.stroke();
  }

  ctx.globalAlpha = 1;
}
