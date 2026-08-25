/**
 * Scenery decoration placement: trees, boulders, and villages (huts around
 * a sand clearing) scattered over the island field. Pure functions of world
 * coordinates and seed — no state, so results are stable regardless of the
 * query window (`decorationsIn`) or iteration order (`villageSites`).
 */
import { BAND, PLOT_SIZE, bandAt, hash2, plotSpec, unit } from './field';

export type DecorKind = 'treeS' | 'treeM' | 'treeL' | 'hut' | 'boulder' | 'path';
export interface Decoration {
  kind: DecorKind;
  x: number;
  y: number;
} // world coords, sprite center

export const DECOR_CELL = 32;

// -- Village site search -----------------------------------------------

const SITE_COUNT_SEED = 0x71a9e;
const SITE_ANGLE_SEED = 0xbead;
const SITE_STEP = 40;
const SITE_MAX_STEPS = 120;

const siteCache = new Map<string, Array<{ x: number; y: number }>>();

/**
 * Deterministic 0-2 village anchor points for a plot. Each site is found by
 * marching outward from the island center along a hashed direction, in
 * fixed 40-unit steps (bounded at 120 steps), stopping at the first
 * BEACH/GRASS band encountered — i.e. the first flat ground walking down
 * from high interior terrain toward the water. Marches that never reach
 * BEACH/GRASS within the step budget are skipped. Unoccupied plots yield [].
 */
export function villageSites(plotCol: number, plotRow: number, seed: number): Array<{ x: number; y: number }> {
  const key = `${plotCol},${plotRow},${seed}`;
  const cached = siteCache.get(key);
  if (cached) return cached;

  const spec = plotSpec(plotCol, plotRow, seed);
  if (!spec.occupied) {
    siteCache.set(key, []);
    return [];
  }

  const n = hash2(plotCol, plotRow, seed ^ SITE_COUNT_SEED) % 3;
  const originX = plotCol * PLOT_SIZE + spec.cx;
  const originY = plotRow * PLOT_SIZE + spec.cy;
  const sites: Array<{ x: number; y: number }> = [];

  for (let k = 0; k < n; k++) {
    const angle = unit(hash2(plotCol, plotRow, seed ^ (SITE_ANGLE_SEED + k))) * Math.PI * 2;
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    for (let step = 1; step <= SITE_MAX_STEPS; step++) {
      const x = originX + dx * SITE_STEP * step;
      const y = originY + dy * SITE_STEP * step;
      const band = bandAt(x, y, seed);
      if (band === BAND.BEACH || band === BAND.GRASS) {
        sites.push({ x, y });
        break;
      }
    }
  }

  siteCache.set(key, sites);
  return sites;
}

// -- Decoration placement ------------------------------------------------

const CELL_JITTER_X_SEED = 0x9f2c;
const CELL_JITTER_Y_SEED = 0x3ae1;
const DENSITY_SEED = 0xd3c0;
const TREE_SIZE_SEED = 0x51ee;
const HUT_COUNT_SEED = 0x4b07;
const HUT_ANGLE_SEED = 0x77c1;
const HUT_RADIUS_SEED = 0x2c9f;

const VILLAGE_SUPPRESS_RADIUS = 48;
const VILLAGE_PAD = 80; // >= hut ring max radius, keeps village emission window-position-driven only
const HUT_RADIUS_MIN = 14;
const HUT_RADIUS_MAX = 26;

function pickTreeSize(cx: number, cy: number, seed: number): DecorKind {
  const r = unit(hash2(cx, cy, seed ^ TREE_SIZE_SEED));
  if (r < 0.5) return 'treeS';
  if (r < 0.8) return 'treeM';
  return 'treeL';
}

/**
 * True if (px,py) falls within VILLAGE_SUPPRESS_RADIUS of any village site
 * belonging to the point's own plot or its 8 neighbors. Depends only on the
 * position (not the query window), so results stay consistent across
 * differently-sized `decorationsIn` calls.
 */
function suppressedByVillage(px: number, py: number, seed: number): boolean {
  const pc = Math.floor(px / PLOT_SIZE);
  const pr = Math.floor(py / PLOT_SIZE);
  for (let dc = -1; dc <= 1; dc++) {
    for (let dr = -1; dr <= 1; dr++) {
      for (const s of villageSites(pc + dc, pr + dr, seed)) {
        if (Math.hypot(px - s.x, py - s.y) < VILLAGE_SUPPRESS_RADIUS) return true;
      }
    }
  }
  return false;
}

/** All decorations whose footprint intersects the world-space rect, sorted by y. */
export function decorationsIn(x0: number, y0: number, x1: number, y1: number, seed: number): Decoration[] {
  const out: Decoration[] = [];

  // Villages: emit a path + huts for every site (of any plot overlapping the
  // padded rect) that itself lands inside the padded rect.
  const pc0 = Math.floor((x0 - VILLAGE_PAD) / PLOT_SIZE) - 1;
  const pc1 = Math.floor((x1 + VILLAGE_PAD) / PLOT_SIZE) + 1;
  const pr0 = Math.floor((y0 - VILLAGE_PAD) / PLOT_SIZE) - 1;
  const pr1 = Math.floor((y1 + VILLAGE_PAD) / PLOT_SIZE) + 1;

  for (let pc = pc0; pc <= pc1; pc++) {
    for (let pr = pr0; pr <= pr1; pr++) {
      const sites = villageSites(pc, pr, seed);
      for (let k = 0; k < sites.length; k++) {
        const s = sites[k];
        if (s.x < x0 - VILLAGE_PAD || s.x > x1 + VILLAGE_PAD || s.y < y0 - VILLAGE_PAD || s.y > y1 + VILLAGE_PAD) {
          continue;
        }
        out.push({ kind: 'path', x: s.x, y: s.y });
        const hutCount = 2 + (hash2(pc, pr, seed ^ (HUT_COUNT_SEED + k)) % 4);
        for (let j = 0; j < hutCount; j++) {
          const a = unit(hash2(pc, pr, seed ^ (HUT_ANGLE_SEED + k * 16 + j))) * Math.PI * 2;
          const r = HUT_RADIUS_MIN + unit(hash2(pc, pr, seed ^ (HUT_RADIUS_SEED + k * 16 + j))) * (HUT_RADIUS_MAX - HUT_RADIUS_MIN);
          out.push({ kind: 'hut', x: s.x + Math.cos(a) * r, y: s.y + Math.sin(a) * r });
        }
      }
    }
  }

  // Trees/boulders: one candidate per DECOR_CELL cell intersecting the rect.
  const cx0 = Math.floor(x0 / DECOR_CELL);
  const cx1 = Math.floor(x1 / DECOR_CELL);
  const cy0 = Math.floor(y0 / DECOR_CELL);
  const cy1 = Math.floor(y1 / DECOR_CELL);

  for (let cx = cx0; cx <= cx1; cx++) {
    for (let cy = cy0; cy <= cy1; cy++) {
      const jx = unit(hash2(cx, cy, seed ^ CELL_JITTER_X_SEED)) * 24 - 12;
      const jy = unit(hash2(cx, cy, seed ^ CELL_JITTER_Y_SEED)) * 24 - 12;
      const px = cx * DECOR_CELL + DECOR_CELL / 2 + jx;
      const py = cy * DECOR_CELL + DECOR_CELL / 2 + jy;
      const band = bandAt(px, py, seed);

      let kind: DecorKind | null = null;
      const h = hash2(cx, cy, seed ^ DENSITY_SEED);
      if (band === BAND.JUNGLE) {
        if (h % 10 < 6) kind = pickTreeSize(cx, cy, seed);
      } else if (band === BAND.GRASS) {
        if (h % 10 === 0) kind = pickTreeSize(cx, cy, seed);
        else if (h % 17 === 0) kind = 'boulder';
      } else if (band === BAND.ROCK) {
        if (h % 7 === 0) kind = 'boulder';
      }
      if (!kind) continue;

      if (suppressedByVillage(px, py, seed)) continue;

      out.push({ kind, x: px, y: py });
    }
  }

  out.sort((a, b) => a.y - b.y);
  return out;
}
