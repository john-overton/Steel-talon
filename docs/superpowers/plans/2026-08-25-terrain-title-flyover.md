# Procedural Island Terrain + Title Flyover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Seeded procedural island terrain (smooth coastlines, elevation bands, coastal waves, scenery decorations) for TOP mode, showcased by an attract-mode title flyover.

**Architecture:** A pure scalar field `elevation(x, y, seed)` built from per-plot island SDFs warped by value noise. Everything downstream — 16px marching-squares terrain tiles, contour-following wave lines, seeded decoration placement — derives from that one field. The title scene becomes a camera drift over the archipelago with the chopper flying an autonomous path.

**Tech Stack:** Plain TypeScript strict, Canvas 2D, Vitest. No new dependencies. Spec: `docs/superpowers/specs/2026-08-25-terrain-title-flyover-design.md`.

## Global Constraints

- Branch: all work on `pass/terrain-title` off `main`.
- Determinism: no `Math.random()`, `Date.now()`, `performance.now()` in game logic. All randomness from integer hashes of (coords, seed).
- Zero runtime dependencies; assets are code (pixel-string grids or code-built `PixelGrid`s over `PALETTE` from `src/game/palette.ts`, base-32 chars, `.` = transparent).
- `src/engine/` must not import from `src/game/`. All new files this pass are game-side (`src/game/terrain/`, `src/game/sprites/`).
- No allocation in the hot loop where avoidable; tiles/sprites rasterized once at construction.
- TDD: failing test first, then implementation. Run a single file with `npx vitest run <path>`; typecheck with `npm run typecheck`.
- Per-repo preference: docs (`docs/architecture.md`, README) are updated once in the final task, not per-task.
- Commit after each task (small commits within a task are fine).

## Existing code you will consume

- `src/engine/tilemap.ts`: `visibleRange(cam, view, tileSize): [number, number]`, `drawTilemap`, `interface Tilemap`.
- `src/engine/sprite.ts`: `parseGrid(rows, palette): PixelGrid`, `rasterize(grid): HTMLCanvasElement`, `prepareLayered`, `drawLayered(ctx, prepared, cx, cy, scale=1)`.
- `src/game/palette.ts`: `PALETTE` (DawnBringer 32). Useful indices: sand `6`/`7` (#d9a066/#eec39a), greens `9`/`a`/`b`/`c` (#99e550/#6abe30/#37946e/#4b692f), browns `3`/`4`/`v` , grays `n`/`o`/`p`, water `g`/`h`/`i` (#306082/#5b6ee1/#639bff), shallow `j` (#5fcde4), foam/white `l` (#ffffff), pale `k` (#cbdbfc).
- `src/game/sprites/tiles.ts`: `createWaterTilemap()`, `WATER_FRAME_TICKS`, and the `cellHash` pattern to imitate.
- `src/game/sprites/player.ts`: `createChopper(): LayeredSprite`, `LAYER` name map.
- `src/game/scenes/top.ts`: reference for how scenes draw (`drawTilemap` then entities) and how rotor frames animate (search `LAYER.ROTOR` / rotor frame ticks and copy that idiom).

---

### Task 1: Island field — hash, noise, plots, shapes, bands

**Files:**
- Create: `src/game/terrain/field.ts`
- Test: `src/game/terrain/field.test.ts`

**Interfaces:**
- Consumes: nothing game-side (pure math).
- Produces (exact exports later tasks rely on):

```ts
export const PLOT_SIZE = 5000;
export const BAND = { DEEP: 0, SHALLOW: 1, BEACH: 2, GRASS: 3, JUNGLE: 4, ROCK: 5 } as const;
export type Band = (typeof BAND)[keyof typeof BAND];
// Ordered elevation thresholds: elevation < SHALLOW → DEEP, < BEACH → SHALLOW, etc.
export const THRESHOLD = { SHALLOW: 0.28, BEACH: 0.4, GRASS: 0.5, JUNGLE: 0.62, ROCK: 0.8 } as const;
export function hash2(ix: number, iy: number, seed: number): number; // uint32
export function unit(h: number): number;                             // uint32 → [0,1)
export function valueNoise(x: number, y: number, seed: number): number; // [0,1), C0-smooth
export type IslandShape = 'round' | 'crescent' | 'snake' | 'chain';
export interface PlotSpec {
  occupied: boolean; shape: IslandShape;
  scale: number;      // 0.1..0.95 fraction of plot the island footprint spans
  rot: number;        // radians
  cx: number; cy: number; // island center in plot-local units
}
export function plotSpec(plotCol: number, plotRow: number, seed: number): PlotSpec;
export function elevation(x: number, y: number, seed: number): number; // [0,1]
export function bandAt(x: number, y: number, seed: number): Band;
```

**Implementation notes (the how):**
- `hash2`: the `cellHash` recipe from `sprites/tiles.ts` extended with seed: `let h = (ix*374761393 + iy*668265263 + seed*974634331)|0; h = Math.imul(h ^ (h>>>13), 1274126177); return (h ^ (h>>>16)) >>> 0;`
- `valueNoise`: lattice at integer coords via `unit(hash2(ix,iy,seed))`, bilinear with smoothstep fade `t*t*(3-2*t)`.
- `plotSpec`: derive fields from successive hashes `hash2(pc, pr, seed^k)` for k=1..5. `occupied` ≈ 70% of plots. Shape weights: round 40%, crescent 20%, snake 20%, chain 20%. `cx,cy` jitter within central 40% of the plot.
- Shape SDFs (plot-local, after rotating/translating by spec, all return distance ≤0 inside):
  - round: `len(p) - R`
  - crescent: ring arc — `abs(len(p) - R*0.7) - R*0.3` clamped to an angular span of ~230°; outside the span, distance to the arc endpoints (round caps).
  - snake: distance to a 4-point polyline spine (points from hashes, spanning the footprint) minus a per-segment radius `R*0.25`.
  - chain: `min` of 2–5 small round/crescent SDFs at hashed offsets, each radius `R*(0.2..0.45)`.
  - `R = scale * PLOT_SIZE / 2`.
- `elevation`: locate plot; warp local coords with 2 octaves of `valueNoise` (amplitude `≈ R*0.25`, frequency `≈ 3/PLOT_SIZE` and double); evaluate SDF `d`; map `e = clamp(0.5 - d / (R*0.6), 0, 1)` then multiply by a border mask `m` that is 1 in the plot interior and smoothsteps to 0 within 200 units of the plot border (guarantees island never touches neighbors). Return `e*m`.
- `bandAt`: threshold walk over `THRESHOLD`.

- [ ] **Step 1: Write failing tests** in `src/game/terrain/field.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { BAND, PLOT_SIZE, THRESHOLD, bandAt, elevation, hash2, plotSpec, valueNoise } from './field';

const SEED = 0xc0ffee;

describe('hash2/valueNoise', () => {
  it('is deterministic and seed-sensitive', () => {
    expect(hash2(3, 7, SEED)).toBe(hash2(3, 7, SEED));
    expect(hash2(3, 7, SEED)).not.toBe(hash2(3, 7, SEED + 1));
  });
  it('valueNoise stays in [0,1) and is smooth-ish', () => {
    for (let i = 0; i < 200; i++) {
      const v = valueNoise(i * 13.7, i * 5.3, SEED);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
    const a = valueNoise(100, 100, SEED);
    const b = valueNoise(100.5, 100, SEED);
    expect(Math.abs(a - b)).toBeLessThan(0.5);
  });
});

describe('plotSpec', () => {
  it('is deterministic and produces all shapes and the scale range over many plots', () => {
    const shapes = new Set<string>();
    let min = 1, max = 0;
    for (let c = 0; c < 40; c++) for (let r = 0; r < 40; r++) {
      const s = plotSpec(c, r, SEED);
      expect(s).toEqual(plotSpec(c, r, SEED));
      if (!s.occupied) continue;
      shapes.add(s.shape);
      min = Math.min(min, s.scale); max = Math.max(max, s.scale);
    }
    expect(shapes).toEqual(new Set(['round', 'crescent', 'snake', 'chain']));
    expect(min).toBeGreaterThanOrEqual(0.1);
    expect(max).toBeLessThanOrEqual(0.95);
    expect(max - min).toBeGreaterThan(0.4); // real spread, not a constant
  });
  it('leaves some plots as open water', () => {
    let open = 0;
    for (let c = 0; c < 20; c++) for (let r = 0; r < 20; r++) if (!plotSpec(c, r, SEED).occupied) open++;
    expect(open).toBeGreaterThan(20);
  });
});

describe('elevation', () => {
  it('is deterministic, bounded, and zero on plot borders', () => {
    for (let i = 0; i < 100; i++) {
      const x = (i * 977) % (PLOT_SIZE * 5), y = (i * 1409) % (PLOT_SIZE * 5);
      const e = elevation(x, y, SEED);
      expect(e).toBe(elevation(x, y, SEED));
      expect(e).toBeGreaterThanOrEqual(0);
      expect(e).toBeLessThanOrEqual(1);
    }
    for (let i = 0; i < 50; i++) {
      expect(elevation(PLOT_SIZE, i * 137, SEED)).toBe(0);   // vertical border
      expect(elevation(i * 211, PLOT_SIZE * 2, SEED)).toBe(0); // horizontal border
    }
  });
  it('produces land in occupied plots (finds a beach-or-higher sample)', () => {
    let found = 0;
    for (let c = 0; c < 10; c++) for (let r = 0; r < 10; r++) {
      const s = plotSpec(c, r, SEED);
      if (!s.occupied) continue;
      let peak = 0;
      for (let sx = 0; sx < 25; sx++) for (let sy = 0; sy < 25; sy++) {
        peak = Math.max(peak, elevation(c * PLOT_SIZE + (sx + 0.5) * (PLOT_SIZE / 25), r * PLOT_SIZE + (sy + 0.5) * (PLOT_SIZE / 25), SEED));
      }
      if (peak >= THRESHOLD.BEACH) found++;
    }
    expect(found).toBeGreaterThan(30);
  });
});

describe('bandAt', () => {
  it('thresholds are strictly ordered', () => {
    expect(THRESHOLD.SHALLOW).toBeLessThan(THRESHOLD.BEACH);
    expect(THRESHOLD.BEACH).toBeLessThan(THRESHOLD.GRASS);
    expect(THRESHOLD.GRASS).toBeLessThan(THRESHOLD.JUNGLE);
    expect(THRESHOLD.JUNGLE).toBeLessThan(THRESHOLD.ROCK);
  });
  it('maps elevation to the right band', () => {
    // plot border is guaranteed elevation 0 → DEEP
    expect(bandAt(PLOT_SIZE, 0, SEED)).toBe(BAND.DEEP);
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run src/game/terrain/field.test.ts` → FAIL (module not found).
- [ ] **Step 3: Implement `src/game/terrain/field.ts`** per the notes above. Keep every helper exported in the Produces block; internal SDF helpers may stay private.
- [ ] **Step 4: Run tests + typecheck** — `npx vitest run src/game/terrain/field.test.ts` PASS; `npm run typecheck` clean. If the coverage/spread assertions fail, tune constants (occupancy %, falloff `R*0.6`, warp amplitude) — do not weaken the tests.
- [ ] **Step 5: Commit** — `git add src/game/terrain && git commit -m "feat: seeded island elevation field with plots, shapes, bands"`

---

### Task 2: Terrain tiles — marching squares + drawTerrain

**Files:**
- Create: `src/game/terrain/tiles.ts`
- Test: `src/game/terrain/tiles.test.ts`

**Interfaces:**
- Consumes: `BAND`, `Band`, `bandAt`, `hash2` from `./field`; `PixelGrid`, `rasterize` from `../../engine/sprite`; `visibleRange` from `../../engine/tilemap`; `PALETTE`.
- Produces:

```ts
export const TERRAIN_TILE = 16;
// Bit mask of corners at/above `band`: bit0=TL, bit1=TR, bit2=BR, bit3=BL.
export function marchCase(corners: [Band, Band, Band, Band], band: Band): number; // 0..15
// Per-pixel coverage for a case: bilinear of corner bits thresholded at 0.5.
export function coverage(caseMask: number, px: number, py: number): boolean;
export interface TerrainRenderer { draw(ctx: CanvasRenderingContext2D, camX: number, camY: number, seed: number): void; }
export function createTerrainRenderer(): TerrainRenderer;
```

**Implementation notes:**
- Pure logic (`marchCase`, `coverage`) is testable headlessly; canvas work stays inside `createTerrainRenderer`.
- `coverage(mask, px, py)`: corner values TL/TR/BR/BL ∈ {0,1} from the mask bits; `u=(px+0.5)/16, v=(py+0.5)/16`; bilinear interp; inside when `≥ 0.5`. This yields smooth diagonal/rounded iso-edges — the "smooth lines" of the spec.
- Tile textures (one function `bandTexture(band, variant): PixelGrid`, 16x16): solid base color per band with hashed speckle —
  SHALLOW: base `j`, speckle `i`/`k` (drawn as a translucent reef tint: also give SHALLOW pixels ~30% chance of transparency so animated water shows through);
  BEACH: base `7`, speckle `6`;
  GRASS: base `a`, speckle `9`;
  JUNGLE: base `c`, speckle `b`/`c` darker cluster;
  ROCK: base `n`, speckle `o`/`p`.
  3 variants per band via `hash2(variant, band, texSeed)` speckle positions.
- Rasterized tile cache built once in `createTerrainRenderer`: for each band ≥ SHALLOW, each of 16 cases, each of 3 variants, a 16x16 canvas where pixels with `coverage(mask,px,py)` true take the band texture pixel, else transparent. Case 15 = full interior tile.
- `draw`: for each visible 16px cell (via `visibleRange`), sample `bandAt` at its 4 corners (corner world coords = cell edges). Let `lo` = min corner band. For each band `b` from `max(lo, SHALLOW)+…` up to max corner band where `marchCase !== 0`, draw that band's case tile (variant by `hash2(col,row,b)`); lower bands beneath partial higher bands are covered by drawing bands in ascending order starting from `lo` (skip DEEP — water below shows). Cells with all corners DEEP draw nothing.
- Corner band samples: 4 `bandAt` calls per cell per band-loop is fine (spec: no caching until profiling demands it) — but compute the 4 corner bands once per cell and reuse across the band loop.

- [ ] **Step 1: Write failing tests:**

```ts
import { describe, expect, it } from 'vitest';
import { BAND, type Band } from './field';
import { TERRAIN_TILE, coverage, marchCase } from './tiles';

const c = (tl: Band, tr: Band, br: Band, bl: Band): [Band, Band, Band, Band] => [tl, tr, br, bl];

describe('marchCase', () => {
  it('encodes each corner in its own bit', () => {
    expect(marchCase(c(BAND.BEACH, BAND.DEEP, BAND.DEEP, BAND.DEEP), BAND.BEACH)).toBe(0b0001);
    expect(marchCase(c(BAND.DEEP, BAND.BEACH, BAND.DEEP, BAND.DEEP), BAND.BEACH)).toBe(0b0010);
    expect(marchCase(c(BAND.DEEP, BAND.DEEP, BAND.BEACH, BAND.DEEP), BAND.BEACH)).toBe(0b0100);
    expect(marchCase(c(BAND.DEEP, BAND.DEEP, BAND.DEEP, BAND.BEACH), BAND.BEACH)).toBe(0b1000);
  });
  it('counts higher bands as inside lower band cases', () => {
    expect(marchCase(c(BAND.ROCK, BAND.JUNGLE, BAND.GRASS, BAND.BEACH), BAND.BEACH)).toBe(0b1111);
    expect(marchCase(c(BAND.ROCK, BAND.JUNGLE, BAND.GRASS, BAND.BEACH), BAND.JUNGLE)).toBe(0b0011);
  });
});

describe('coverage', () => {
  it('full and empty cases', () => {
    expect(coverage(0b1111, 0, 0)).toBe(true);
    expect(coverage(0b1111, TERRAIN_TILE - 1, TERRAIN_TILE - 1)).toBe(true);
    expect(coverage(0b0000, 8, 8)).toBe(false);
  });
  it('single-corner case covers that corner only, with a curved boundary', () => {
    expect(coverage(0b0001, 0, 0)).toBe(true);            // TL corner
    expect(coverage(0b0001, 15, 15)).toBe(false);          // opposite corner
    expect(coverage(0b0001, 15, 0)).toBe(false);
    // area of a corner case is between a thin sliver and half the tile → curved, not square
    let area = 0;
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (coverage(0b0001, x, y)) area++;
    expect(area).toBeGreaterThan(16);
    expect(area).toBeLessThan(128);
  });
  it('edge case covers exactly the top half boundary-smoothly', () => {
    expect(coverage(0b0011, 8, 0)).toBe(true);   // top edge inside
    expect(coverage(0b0011, 8, 15)).toBe(false); // bottom outside
  });
  it('is symmetric under mask rotation', () => {
    let a = 0, b = 0;
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      if (coverage(0b0001, x, y)) a++;
      if (coverage(0b0010, x, y)) b++;
    }
    expect(a).toBe(b);
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run src/game/terrain/tiles.test.ts` → FAIL.
- [ ] **Step 3: Implement** `marchCase`, `coverage`, `bandTexture`, `createTerrainRenderer` per notes.
- [ ] **Step 4: Run tests + typecheck** — both clean. (Renderer canvas code is not unit-tested; it is exercised visually in Task 6/7.)
- [ ] **Step 5: Commit** — `git commit -am "feat: 16px marching-squares terrain tiles over the island field"`

---

### Task 3: Coastal waves

**Files:**
- Create: `src/game/terrain/waves.ts`
- Test: `src/game/terrain/waves.test.ts`

**Interfaces:**
- Consumes: `THRESHOLD`, `elevation`, `hash2`, `unit` from `./field`.
- Produces:

```ts
export const WAVE_CELL = 32;
export interface Wave { pts: Array<{ x: number; y: number }>; alpha: number } // world coords, alpha 0..1
export function wavesIn(x0: number, y0: number, x1: number, y1: number, seed: number, tick: number): Wave[];
export function drawWaves(ctx: CanvasRenderingContext2D, camX: number, camY: number, seed: number, tick: number): void;
```

**Implementation notes:**
- For each 32-unit cell in the rect: `h = hash2(col,row,seed^0x5eaf0a)`; host a wave when `h % 6 === 0` AND the cell-center elevation is in the shore band `[THRESHOLD.SHALLOW*0.6, THRESHOLD.BEACH)`.
- Gradient at a point: `gx = elevation(x+4,y,seed) - elevation(x-4,y,seed)`, same for `gy`; normalize (skip the wave if magnitude ~0). Contour dir = `(-gy, gx)`.
- Polyline: `3 + h % 10` points stepping 8 units along the contour direction, re-estimating the gradient each step so the line bends with the coast (snakey).
- Animation: period `T = 90 + (h >>> 8) % 60`, phase `p = ((tick + (h >>> 16) % T) % T) / T`. The whole polyline is offset along +gradient (toward land) by `(p - 1) * 24` (starts 24 units offshore, reaches the host position at end of cycle); `alpha = sin(p * PI)` (fade in, peak, fade out ≈ break at shore).
- `drawWaves`: `wavesIn` over the visible rect padded by 64; stroke each polyline once at `PALETTE[l]` white, `lineWidth 1.5`, `globalAlpha = wave.alpha * 0.8`, plus `lineCap 'round'`. Reset alpha after.
- Allocation note: `wavesIn` allocates small arrays per frame; acceptable (draw path, not the entity hot loop) — mirror how HUD draws.

- [ ] **Step 1: Write failing tests:**

```ts
import { describe, expect, it } from 'vitest';
import { PLOT_SIZE, THRESHOLD, elevation } from './field';
import { WAVE_CELL, wavesIn } from './waves';

const SEED = 0xc0ffee;

// Scan for a rect near a coastline: find an occupied-plot area with shore-band cells.
function shoreRect(): [number, number, number, number] {
  for (let c = 0; c < 10; c++) for (let r = 0; r < 10; r++) {
    for (let sx = 0; sx < 40; sx++) for (let sy = 0; sy < 40; sy++) {
      const x = c * PLOT_SIZE + sx * 125, y = r * PLOT_SIZE + sy * 125;
      const e = elevation(x, y, SEED);
      if (e > THRESHOLD.SHALLOW * 0.7 && e < THRESHOLD.BEACH) return [x - 400, y - 400, x + 400, y + 400];
    }
  }
  throw new Error('no shore found');
}

describe('wavesIn', () => {
  it('is deterministic for a given tick', () => {
    const [x0, y0, x1, y1] = shoreRect();
    expect(wavesIn(x0, y0, x1, y1, SEED, 120)).toEqual(wavesIn(x0, y0, x1, y1, SEED, 120));
  });
  it('finds waves near a coastline and none in open deep water', () => {
    const [x0, y0, x1, y1] = shoreRect();
    let any = 0;
    for (let t = 0; t < 240; t += 10) any += wavesIn(x0, y0, x1, y1, SEED, t).length;
    expect(any).toBeGreaterThan(0);
    // plot borders are guaranteed deep water
    expect(wavesIn(PLOT_SIZE - 40, -40, PLOT_SIZE + 40, 40, SEED, 120)).toEqual([]);
  });
  it('waves have 3..12 points, finite coords, alpha in [0,1]', () => {
    const [x0, y0, x1, y1] = shoreRect();
    for (let t = 0; t < 240; t += 15) {
      for (const w of wavesIn(x0, y0, x1, y1, SEED, t)) {
        expect(w.pts.length).toBeGreaterThanOrEqual(3);
        expect(w.pts.length).toBeLessThanOrEqual(12);
        expect(w.alpha).toBeGreaterThanOrEqual(0);
        expect(w.alpha).toBeLessThanOrEqual(1);
        for (const p of w.pts) { expect(Number.isFinite(p.x)).toBe(true); expect(Number.isFinite(p.y)).toBe(true); }
      }
    }
  });
  it('animates: a wave drifts toward land over its cycle', () => {
    const [x0, y0, x1, y1] = shoreRect();
    let moved = false;
    const a = wavesIn(x0, y0, x1, y1, SEED, 0);
    const b = wavesIn(x0, y0, x1, y1, SEED, 30);
    if (a.length && b.length && a[0].pts.length && b[0].pts.length) {
      moved = a[0].pts[0].x !== b[0].pts[0].x || a[0].pts[0].y !== b[0].pts[0].y || a[0].alpha !== b[0].alpha;
    } else moved = a.length !== b.length; // waves appearing/disappearing also proves animation
    expect(moved).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify failure.**
- [ ] **Step 3: Implement `waves.ts`** per notes (WAVE_CELL export included).
- [ ] **Step 4: Tests + typecheck pass.**
- [ ] **Step 5: Commit** — `git commit -am "feat: contour-following coastal wave lines"`

---

### Task 4: Decoration sprites + placement

**Files:**
- Create: `src/game/sprites/terrain-decor.ts` (pixel grids)
- Create: `src/game/terrain/decor.ts` (placement)
- Test: `src/game/terrain/decor.test.ts`, `src/game/sprites/terrain-decor.test.ts`

**Interfaces:**
- Consumes: `BAND`, `bandAt`, `elevation`, `THRESHOLD`, `PLOT_SIZE`, `hash2`, `unit`, `plotSpec` from `../terrain/field` (sprites file consumes only `parseGrid`/`PALETTE`).
- Produces:

```ts
// sprites/terrain-decor.ts — plain PixelGrids (single-frame, no anchors needed)
export const TREE_SMALL: PixelGrid;   // ~12x12 canopy, dark 'c' under-ring, 'a'/'9' highlights
export const TREE_MED: PixelGrid;     // ~16x16
export const TREE_LARGE: PixelGrid;   // ~24x24
export const HUT: PixelGrid;          // ~14x12, walls '3'/'4', thatched roof '6'/'v', door '2'
export const BOULDER: PixelGrid;      // ~12x10, grays 'n'/'o'/'p'
export const PATH_PATCH: PixelGrid;   // ~24x18 sand clearing, '7' with '6' edge speckle

// terrain/decor.ts
export type DecorKind = 'treeS' | 'treeM' | 'treeL' | 'hut' | 'boulder' | 'path';
export interface Decoration { kind: DecorKind; x: number; y: number } // world coords, sprite center
export const DECOR_CELL = 32;
export function villageSites(plotCol: number, plotRow: number, seed: number): Array<{ x: number; y: number }>;
export function decorationsIn(x0: number, y0: number, x1: number, y1: number, seed: number): Decoration[];
```

**Implementation notes:**
- Grids: hand-write pixel-string rows (any size is fine — `parseGrid` is size-agnostic). Trees read from above: irregular round canopy, `c` (dark) outer ring/underside on the lower-right, `a` body, `9` sun highlights upper-left, occasional `b`. Hut from above: rectangular thatch `6`/`v` stripes with a `4` wall outline and `2` shadow along the bottom edge.
- `villageSites(pc, pr, seed)`: if plot unoccupied → `[]`. `n = hash2(pc,pr,seed^0x71a9e) % 3` sites (0–2). For each site k: start at the island center (`cx,cy` from `plotSpec`), march outward along direction `angle = unit(hash2(pc, pr, seed^(0xbead + k))) * 2π` in 40-unit steps (≤ 120 steps) until `bandAt` returns BEACH or GRASS with the *next* step DEEP/SHALLOW-ward (i.e. first BEACH/GRASS encountered walking outward from high ground); place there. If never found, skip the site. Deterministic and bounded.
- `decorationsIn`: iterate `DECOR_CELL` cells intersecting the rect. Per cell: center + jitter (`unit(hash2)*24-12` each axis) → sample band at the jittered point.
  - JUNGLE: tree when `h % 10 < 6` (dense). Size by another hash: S 50% / M 30% / L 20%.
  - GRASS: tree when `h % 10 === 0` (sparse); boulder when `h % 17 === 0`.
  - ROCK: boulder when `h % 7 === 0`.
  - Villages: for each plot overlapping the rect (±1), for each `villageSites` site inside the padded rect: emit one `path` at the site, then `2 + hash2 % 4` huts ringed around it at radius 14–26, hashed angles. Suppression: skip any tree/boulder within 48 units of a village site (check sites of the cell's own plot and neighbors whose sites are near).
  - Sort result by `y` (painter's order for overlap) before returning.

- [ ] **Step 1: Write failing tests:**

`src/game/sprites/terrain-decor.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { BOULDER, HUT, PATH_PATCH, TREE_LARGE, TREE_MED, TREE_SMALL } from './terrain-decor';

describe('terrain decor grids', () => {
  it('all parse with sensible sizes and some opaque pixels', () => {
    for (const g of [TREE_SMALL, TREE_MED, TREE_LARGE, HUT, BOULDER, PATH_PATCH]) {
      expect(g.width).toBeGreaterThanOrEqual(8);
      expect(g.height).toBeGreaterThanOrEqual(8);
      let opaque = 0;
      for (let i = 3; i < g.rgba.length; i += 4) if (g.rgba[i] === 255) opaque++;
      expect(opaque).toBeGreaterThan(g.width * g.height * 0.3);
    }
    expect(TREE_SMALL.width).toBeLessThan(TREE_MED.width);
    expect(TREE_MED.width).toBeLessThan(TREE_LARGE.width);
  });
});
```

`src/game/terrain/decor.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { BAND, PLOT_SIZE, bandAt, plotSpec } from './field';
import { decorationsIn, villageSites } from './decor';

const SEED = 0xc0ffee;

// Find a rect containing land in an occupied plot.
function landRect(): [number, number, number, number] {
  for (let c = 0; c < 10; c++) for (let r = 0; r < 10; r++) {
    if (!plotSpec(c, r, SEED).occupied) continue;
    for (let sx = 0; sx < 40; sx++) for (let sy = 0; sy < 40; sy++) {
      const x = c * PLOT_SIZE + sx * 125, y = r * PLOT_SIZE + sy * 125;
      if (bandAt(x, y, SEED) >= BAND.GRASS) return [x - 600, y - 600, x + 600, y + 600];
    }
  }
  throw new Error('no land found');
}

describe('decorationsIn', () => {
  it('is deterministic and stable across different query windows', () => {
    const [x0, y0, x1, y1] = landRect();
    const a = decorationsIn(x0, y0, x1, y1, SEED);
    expect(a).toEqual(decorationsIn(x0, y0, x1, y1, SEED));
    // same world position must yield the same decoration regardless of window
    const b = decorationsIn(x0 - 500, y0 - 500, x1 + 500, y1 + 500, SEED);
    for (const d of a) expect(b).toContainEqual(d);
  });
  it('places trees only on grass/jungle, boulders only on grass/rock', () => {
    const [x0, y0, x1, y1] = landRect();
    for (const d of decorationsIn(x0, y0, x1, y1, SEED)) {
      const band = bandAt(d.x, d.y, SEED);
      if (d.kind.startsWith('tree')) expect([BAND.GRASS, BAND.JUNGLE]).toContain(band);
      if (d.kind === 'boulder') expect([BAND.GRASS, BAND.ROCK]).toContain(band);
    }
  });
  it('finds some trees on a big enough land sweep', () => {
    const [x0, y0, x1, y1] = landRect();
    const all = decorationsIn(x0 - 1000, y0 - 1000, x1 + 1000, y1 + 1000, SEED);
    expect(all.some((d) => d.kind.startsWith('tree'))).toBe(true);
  });
  it('returns decorations sorted by y', () => {
    const [x0, y0, x1, y1] = landRect();
    const a = decorationsIn(x0, y0, x1, y1, SEED);
    for (let i = 1; i < a.length; i++) expect(a[i].y).toBeGreaterThanOrEqual(a[i - 1].y);
  });
});

describe('villageSites', () => {
  it('is deterministic, bounded 0..2, on beach/grass, empty for unoccupied plots', () => {
    let placed = 0;
    for (let c = 0; c < 12; c++) for (let r = 0; r < 12; r++) {
      const sites = villageSites(c, r, SEED);
      expect(sites).toEqual(villageSites(c, r, SEED));
      expect(sites.length).toBeLessThanOrEqual(2);
      if (!plotSpec(c, r, SEED).occupied) expect(sites).toEqual([]);
      for (const s of sites) {
        expect([BAND.BEACH, BAND.GRASS]).toContain(bandAt(s.x, s.y, SEED));
        placed++;
      }
    }
    expect(placed).toBeGreaterThan(5);
  });
  it('suppresses trees near village sites', () => {
    outer: for (let c = 0; c < 12; c++) for (let r = 0; r < 12; r++) {
      const sites = villageSites(c, r, SEED);
      if (!sites.length) continue;
      const s = sites[0];
      const near = decorationsIn(s.x - 48, s.y - 48, s.x + 48, s.y + 48, SEED);
      for (const d of near) {
        if (!d.kind.startsWith('tree') && d.kind !== 'boulder') continue;
        const dist = Math.hypot(d.x - s.x, d.y - s.y);
        expect(dist).toBeGreaterThanOrEqual(48);
      }
      break outer;
    }
  });
});
```

- [ ] **Step 2: Run to verify failure** (both files).
- [ ] **Step 3: Implement** `sprites/terrain-decor.ts` then `terrain/decor.ts` per notes.
- [ ] **Step 4: Tests + typecheck pass.** Tune densities if the "finds some trees" sweep fails; keep tests as written.
- [ ] **Step 5: Commit** — `git commit -am "feat: seeded scenery decorations — trees, villages, boulders"`

---

### Task 5: Terrain layer facade

**Files:**
- Create: `src/game/terrain/index.ts`
- Test: covered by existing task tests (facade is wiring only)

**Interfaces:**
- Consumes: Tasks 1–4.
- Produces the single object scenes use:

```ts
export interface TerrainLayer {
  // Draws terrain tiles, waves, and decorations for the visible rect.
  // Call after the water tilemap draw. tick drives wave animation.
  draw(ctx: CanvasRenderingContext2D, camX: number, camY: number, tick: number): void;
}
export function createTerrainLayer(seed: number): TerrainLayer;
```

**Implementation notes:** construct `createTerrainRenderer()` once; rasterize the six decor grids once (`rasterize` from engine/sprite) into a `Record<DecorKind, HTMLCanvasElement>`; `draw` = terrain tiles → `drawWaves` → `decorationsIn(camX-32, camY-32, camX+WIDTH+32, camY+HEIGHT+32, seed)` drawn centered with `Math.round`. Import `WIDTH`/`HEIGHT` from `../../engine/renderer`.

- [ ] **Step 1: Implement `index.ts`** (no new unit tests — pure wiring of tested parts; keep it under ~60 lines).
- [ ] **Step 2: `npm run typecheck` + full `npm test` still green.**
- [ ] **Step 3: Commit** — `git commit -am "feat: terrain layer facade (tiles + waves + decor)"`

---

### Task 6: Title flyover

**Files:**
- Modify: `src/game/scenes/title.ts`
- Modify: `src/game/main.ts` (pass a `TerrainLayer` into the title deps)
- Test: `src/game/scenes/title.test.ts` (extend; existing tests must keep passing)

**Interfaces:**
- Consumes: `createTerrainLayer` (Task 5), `createChopper`, `LAYER`, `prepareLayered`, `drawLayered`.
- Produces: `TitleDeps` gains `terrain: TerrainLayer`. Exported pure helpers for tests:

```ts
// Camera world position at a tick: slow incommensurate drift so the path never visibly loops.
export function attractCamera(ticks: number): { x: number; y: number };
// Chopper position/heading in SCREEN coords at a tick.
export function attractChopper(ticks: number): { x: number; y: number; heading: number };
```

**Implementation notes:**
- `attractCamera`: `x = 2500 + t*0.35 + 1400*Math.sin(t*0.00073)`, `y = 2500 + t*0.28 + 1400*Math.sin(t*0.00101 + 2)` (t in ticks; ~25 px/s combined drift; crosses plot after plot). Values exported as consts is fine.
- `attractChopper`: lissajous inside the screen with margins: `x = 320 + 190*Math.sin(t*0.006)`, `y = 260 + 120*Math.sin(t*0.0043 + 1.3)`; `heading = Math.atan2(dy, dx)` from the analytic derivative, then rendered rotated by `heading + PI/2` *only partially*: draw rotated by `clamp(bankLean, -0.35, 0.35)` where `bankLean = wrapped angle delta`… **Keep it simple:** rotate the sprite to face its velocity direction (`heading + Math.PI/2` since the sprite faces up) — full rotation, smooth path, reads as flying. (Bank frames come next pass per the spec.)
- Draw order in `draw()`: water tilemap (existing, but scrolled by `attractCamera` position instead of `bgY` — use `cam.x % tileSize`-style offsets via `drawTilemap(ctx, water, cam.x, cam.y, ...)`) → `deps.terrain.draw(ctx, cam.x, cam.y, ticks)` → chopper shadow (dark `#000` ellipse, `globalAlpha 0.3`, offset +10,+14, radii 12x6) → chopper via `ctx.save(); ctx.translate(sx, sy); ctx.rotate(a); drawLayered(ctx, chopper, 0, 0); ctx.restore()` → text.
- Chopper prepared once at scene construction: `prepareLayered(createChopper())`; hide weapon flash/missile layers exactly as `top.ts` does on its first frames (`LAYER.FLASH_L` etc. `visible = false`); animate rotor: copy the rotor-frame idiom from `top.ts` (search `LAYER.ROTOR`).
- Remove the 55% full-screen dim. Behind each text block draw a backing: `ctx.globalAlpha = 0.45; ctx.fillStyle = '#000'; ctx.fillRect(...)` sized to the text (title block: one rect ~x 140..500, y 120..200; prompt/notice lines: rect height 20 around each line, width ~ text extent + 16). Keep all existing text, colors, blink logic, F1/F2, seed readout.
- `main.ts`: `const terrain = createTerrainLayer(seed);` next to `createWaterTilemap()`, pass `terrain` into `createTitleScene` deps (and keep it around for Task 7).
- Existing tests construct the title scene — they will need the new dep; provide a real `createTerrainLayer(0xc0ffee)`? **No** — tests run headless (no canvas). Give `TitleDeps.terrain` the `TerrainLayer` interface and in tests pass a stub `{ draw() {} }`. Check how existing title tests stub `water`/audio and follow that pattern.

- [ ] **Step 1: Extend `title.test.ts` with failing tests** (keep every existing test untouched):

```ts
// added imports
import { attractCamera, attractChopper } from './title';

describe('attract mode paths', () => {
  it('camera drifts smoothly and never visibly loops early', () => {
    const a = attractCamera(0), b = attractCamera(60), c = attractCamera(36_000);
    expect(a).toEqual(attractCamera(0)); // pure
    const v = Math.hypot(b.x - a.x, b.y - a.y); // px per second
    expect(v).toBeGreaterThan(5);
    expect(v).toBeLessThan(80);
    expect(Math.hypot(c.x - a.x, c.y - a.y)).toBeGreaterThan(2000); // net drift, no closed loop
  });
  it('chopper stays on screen with margin and heading follows motion', () => {
    for (let t = 0; t < 20_000; t += 37) {
      const p = attractChopper(t);
      expect(p.x).toBeGreaterThan(60); expect(p.x).toBeLessThan(580);
      expect(p.y).toBeGreaterThan(60); expect(p.y).toBeLessThan(420);
    }
    const p0 = attractChopper(100), p1 = attractChopper(101);
    const motion = Math.atan2(p1.y - p0.y, p1.x - p0.x);
    // heading within a quarter-turn of instantaneous motion (analytic vs finite difference)
    const d = Math.abs(Math.atan2(Math.sin(p0.heading - motion), Math.cos(p0.heading - motion)));
    expect(d).toBeLessThan(Math.PI / 4);
  });
});
```

Also update every existing `createTitleScene({...})` call in the test file to add `terrain: { draw() {} }`.

- [ ] **Step 2: Run `npx vitest run src/game/scenes/title.test.ts`** → new tests FAIL, old ones still meaningful.
- [ ] **Step 3: Implement** title changes + `main.ts` wiring per notes.
- [ ] **Step 4: Full `npm test` + `npm run typecheck` green.**
- [ ] **Step 5: Visual check** — `npm run dev`, confirm: islands drift by, coast waves animate, chopper flies a curved path with rotor spin and shadow, text readable, F1/F2 still work, two-press start unchanged. Fix what looks wrong (tile seams, wave density, text backing sizes).
- [ ] **Step 6: Commit** — `git commit -am "feat: attract-mode title flyover over seeded archipelago"`

---

### Task 7: TOP mode hookup

**Files:**
- Modify: `src/game/scenes/top.ts` (add `terrain: TerrainLayer` to deps; draw it after water)
- Modify: `src/game/main.ts` (pass the same `terrain` into the TOP scene deps)
- Test: `src/game/scenes/top.test.ts` (update constructions with the stub; existing tests keep passing)

**Interfaces:** Consumes `TerrainLayer` from Task 5. No new exports.

- [ ] **Step 1: Add `terrain` to TOP deps and draw call** — in `top.ts` `draw()`, immediately after the `drawTilemap(... water ...)` line: `deps.terrain.draw(ctx, camera.x, camera.y, ticks);`. Update `top.test.ts` constructions with `terrain: { draw() {} }` and `main.ts` with the real layer (both places TOP deps are built — search `makeRng` in main.ts, there are two).
- [ ] **Step 2: Full `npm test` + `npm run typecheck` green.**
- [ ] **Step 3: Visual check in dev server** — start a run: islands scroll under the fight as scenery; gameplay unchanged.
- [ ] **Step 4: Commit** — `git commit -am "feat: draw terrain layer in TOP mode"`

---

### Task 8: Docs cleanup pass

**Files:**
- Modify: `docs/architecture.md` (add `src/game/terrain/` section: field → tiles → waves → decor → facade; title attract mode; TOP draw order)
- Modify: `README.md` only if commands/structure statements became inaccurate.

- [ ] **Step 1: Update `docs/architecture.md`** to describe the current state (no history/plans): the terrain module boundary, the one-field-many-consumers dataflow, the title flyover, and the scene draw order. Match the doc's existing style — short sentences, real paths.
- [ ] **Step 2: Verify claims against code** (exports named in the doc exist).
- [ ] **Step 3: Commit** — `git commit -am "docs: architecture for terrain system and title flyover"`

