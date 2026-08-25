/**
 * Seeded procedural island field: deterministic elevation over an infinite
 * grid of square plots. Pure math, no dependencies. Later systems (tiles,
 * waves, decorations) query `elevation`/`bandAt` for world coordinates.
 */

export const PLOT_SIZE = 5000;

export const BAND = { DEEP: 0, SHALLOW: 1, BEACH: 2, GRASS: 3, JUNGLE: 4, ROCK: 5 } as const;
export type Band = (typeof BAND)[keyof typeof BAND];

// Ordered elevation thresholds: elevation < SHALLOW → DEEP, < BEACH → SHALLOW, etc.
export const THRESHOLD = { SHALLOW: 0.28, BEACH: 0.4, GRASS: 0.5, JUNGLE: 0.62, ROCK: 0.8 } as const;

/** Integer-lattice hash, extended with a seed. uint32 output. */
export function hash2(ix: number, iy: number, seed: number): number {
  let h = (ix * 374761393 + iy * 668265263 + seed * 974634331) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

/** uint32 → [0,1) */
export function unit(h: number): number {
  return h / 4294967296;
}

/**
 * Bilinear value noise over the integer lattice, smoothstep-faded. [0,1).
 * Callers control frequency by pre-scaling x/y (lattice spacing is 1 unit).
 */
export function valueNoise(x: number, y: number, seed: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;

  const v00 = unit(hash2(ix, iy, seed));
  const v10 = unit(hash2(ix + 1, iy, seed));
  const v01 = unit(hash2(ix, iy + 1, seed));
  const v11 = unit(hash2(ix + 1, iy + 1, seed));

  const tx = fx * fx * (3 - 2 * fx);
  const ty = fy * fy * (3 - 2 * fy);

  const top = v00 + (v10 - v00) * tx;
  const bottom = v01 + (v11 - v01) * tx;
  return top + (bottom - top) * ty;
}

export type IslandShape = 'round' | 'crescent' | 'snake' | 'chain';

export interface PlotSpec {
  occupied: boolean;
  shape: IslandShape;
  scale: number; // 0.1..0.95 fraction of plot the island footprint spans
  rot: number; // radians
  cx: number; // island center in plot-local units
  cy: number;
}

/** Derives the fixed island layout for a plot from successive hashes. */
export function plotSpec(plotCol: number, plotRow: number, seed: number): PlotSpec {
  const occupiedRoll = unit(hash2(plotCol, plotRow, seed ^ 1));
  const occupied = occupiedRoll < 0.7;

  const shapeRoll = unit(hash2(plotCol, plotRow, seed ^ 2));
  let shape: IslandShape;
  if (shapeRoll < 0.4) shape = 'round';
  else if (shapeRoll < 0.6) shape = 'crescent';
  else if (shapeRoll < 0.8) shape = 'snake';
  else shape = 'chain';

  const scale = 0.1 + unit(hash2(plotCol, plotRow, seed ^ 3)) * 0.85;
  const rot = unit(hash2(plotCol, plotRow, seed ^ 4)) * Math.PI * 2;

  // Jitter the center within the central 40% of the plot.
  const jx = unit(hash2(plotCol, plotRow, seed ^ 5));
  const jy = unit(hash2(plotCol, plotRow, seed ^ 6));
  const cx = (0.3 + jx * 0.4) * PLOT_SIZE;
  const cy = (0.3 + jy * 0.4) * PLOT_SIZE;

  return { occupied, shape, scale, rot, cx, cy };
}

interface Vec2 {
  x: number;
  y: number;
}

function len(p: Vec2): number {
  return Math.sqrt(p.x * p.x + p.y * p.y);
}

function angleOf(p: Vec2): number {
  return Math.atan2(p.y, p.x);
}

/** Shortest signed angular difference a-b, wrapped to [-PI, PI]. */
function angleDiff(a: number, b: number): number {
  let d = (a - b) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function sdRound(p: Vec2, r: number): number {
  return len(p) - r;
}

const CRESCENT_HALF_SPAN = ((230 / 2) * Math.PI) / 180;

function sdCrescent(p: Vec2, r: number): number {
  const ringR = r * 0.7;
  const tubeR = r * 0.3;
  const a = angleOf(p);
  const diff = angleDiff(a, 0);
  if (Math.abs(diff) <= CRESCENT_HALF_SPAN) {
    return Math.abs(len(p) - ringR) - tubeR;
  }
  // Outside the angular span: distance to the nearer endpoint cap.
  const edgeAngle = diff > 0 ? CRESCENT_HALF_SPAN : -CRESCENT_HALF_SPAN;
  const cap: Vec2 = { x: Math.cos(edgeAngle) * ringR, y: Math.sin(edgeAngle) * ringR };
  const dx = p.x - cap.x;
  const dy = p.y - cap.y;
  return Math.sqrt(dx * dx + dy * dy) - tubeR;
}

function sdSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const apx = p.x - a.x;
  const apy = p.y - a.y;
  const abLenSq = abx * abx + aby * aby;
  const t = abLenSq > 0 ? Math.max(0, Math.min(1, (apx * abx + apy * aby) / abLenSq)) : 0;
  const cx = a.x + abx * t;
  const cy = a.y + aby * t;
  const dx = p.x - cx;
  const dy = p.y - cy;
  return Math.sqrt(dx * dx + dy * dy);
}

function sdSnake(p: Vec2, r: number, plotCol: number, plotRow: number, seed: number): number {
  const spineR = r * 0.25;
  const points: Vec2[] = [];
  for (let i = 0; i < 4; i++) {
    const hx = unit(hash2(plotCol, plotRow, seed ^ (10 + i * 2)));
    const hy = unit(hash2(plotCol, plotRow, seed ^ (11 + i * 2)));
    const t = i / 3;
    // Spine spans roughly across the footprint, from -r to +r along x, with y jitter.
    const px = -r + t * r * 2;
    const py = (hy - 0.5) * r * 1.2 + (hx - 0.5) * r * 0.4;
    points.push({ x: px, y: py });
  }
  let best = Infinity;
  for (let i = 0; i < points.length - 1; i++) {
    best = Math.min(best, sdSegment(p, points[i], points[i + 1]));
  }
  return best - spineR;
}

function sdChain(p: Vec2, r: number, plotCol: number, plotRow: number, seed: number): number {
  const countRoll = unit(hash2(plotCol, plotRow, seed ^ 20));
  const count = 2 + Math.floor(countRoll * 4); // 2..5
  let best = Infinity;
  for (let i = 0; i < count; i++) {
    const hOx = unit(hash2(plotCol, plotRow, seed ^ (21 + i * 3)));
    const hOy = unit(hash2(plotCol, plotRow, seed ^ (22 + i * 3)));
    const hR = unit(hash2(plotCol, plotRow, seed ^ (23 + i * 3)));
    const ox = (hOx - 0.5) * r * 1.6;
    const oy = (hOy - 0.5) * r * 1.6;
    const rr = r * (0.2 + hR * 0.25);
    const dx = p.x - ox;
    const dy = p.y - oy;
    best = Math.min(best, sdRound({ x: dx, y: dy }, rr));
  }
  return best;
}

function islandSdf(localX: number, localY: number, spec: PlotSpec, plotCol: number, plotRow: number, seed: number): number {
  const dx = localX - spec.cx;
  const dy = localY - spec.cy;
  const cos = Math.cos(-spec.rot);
  const sin = Math.sin(-spec.rot);
  const p: Vec2 = { x: dx * cos - dy * sin, y: dx * sin + dy * cos };
  const r = (spec.scale * PLOT_SIZE) / 2;
  switch (spec.shape) {
    case 'round':
      return sdRound(p, r);
    case 'crescent':
      return sdCrescent(p, r);
    case 'snake':
      return sdSnake(p, r, plotCol, plotRow, seed);
    case 'chain':
      return sdChain(p, r, plotCol, plotRow, seed);
  }
}

const BORDER_FADE = 200; // units within the plot border where elevation smoothsteps to 0

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** World-space elevation in [0,1]. Guaranteed 0 at every plot border. */
export function elevation(x: number, y: number, seed: number): number {
  const plotCol = Math.floor(x / PLOT_SIZE);
  const plotRow = Math.floor(y / PLOT_SIZE);
  const localX = x - plotCol * PLOT_SIZE;
  const localY = y - plotRow * PLOT_SIZE;

  const spec = plotSpec(plotCol, plotRow, seed);
  if (!spec.occupied) return 0;

  const r = (spec.scale * PLOT_SIZE) / 2;

  // Warp local coords with 2 octaves of value noise before evaluating the SDF.
  const freq1 = 3 / PLOT_SIZE;
  const freq2 = freq1 * 2;
  const amp1 = r * 0.25;
  const amp2 = amp1 * 0.5;
  const wx =
    localX +
    (valueNoise(localX * freq1, localY * freq1, seed ^ 100) - 0.5) * 2 * amp1 +
    (valueNoise(localX * freq2, localY * freq2, seed ^ 101) - 0.5) * 2 * amp2;
  const wy =
    localY +
    (valueNoise(localX * freq1, localY * freq1, seed ^ 102) - 0.5) * 2 * amp1 +
    (valueNoise(localX * freq2, localY * freq2, seed ^ 103) - 0.5) * 2 * amp2;

  const d = islandSdf(wx, wy, spec, plotCol, plotRow, seed);
  const e = Math.max(0, Math.min(1, 0.5 - d / (r * 0.6)));

  const distToBorder = Math.min(localX, PLOT_SIZE - localX, localY, PLOT_SIZE - localY);
  const mask = smoothstep(0, BORDER_FADE, distToBorder);

  return e * mask;
}

/** Threshold walk over `THRESHOLD`. */
export function bandAt(x: number, y: number, seed: number): Band {
  const e = elevation(x, y, seed);
  if (e < THRESHOLD.SHALLOW) return BAND.DEEP;
  if (e < THRESHOLD.BEACH) return BAND.SHALLOW;
  if (e < THRESHOLD.GRASS) return BAND.BEACH;
  if (e < THRESHOLD.JUNGLE) return BAND.GRASS;
  if (e < THRESHOLD.ROCK) return BAND.JUNGLE;
  return BAND.ROCK;
}
