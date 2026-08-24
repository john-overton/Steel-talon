# Steel Talon Pass 3 — Milestones 7–10 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Level 1 TOP vertical slice — title screen → scrolling seeded training lane with two enemy kinds, a four-slot weapon arsenal, pickups, HUD, and music → SEGMENT COMPLETE / GAME OVER → title, with the `start(seed)` / `gameover(score, salvage)` shell seam wired.

**Architecture:** Real camera + world-space entities (draw at `pos − camera`). Engine gains `tilemap.ts`, `scene.ts`, a camera field on the renderer, `noise()` and a lookahead sequencer in `audio.ts`. The game gains `waves.ts` (seeded wave script), `weapons.ts` (four-slot arsenal), `run.ts` (run state), `hud.ts`, two songs, and `title`/`top` scenes; `main.ts` shrinks to the shell seam.

**Tech Stack:** TypeScript strict + Vite, Vitest, Canvas 2D, Web Audio. Zero runtime dependencies.

## Global Constraints

- Engine/game boundary: nothing in `src/engine/` may import from `src/game/`.
- Determinism: all gameplay randomness through the one seeded mulberry32 (`world.rng` / the run RNG). Never `Math.random()`, `Date.now()`, or `performance.now()` in update logic. Audio output and the sequencer use the AudioContext clock (exempt).
- No allocation in the hot loop: pools only; reused module-level result objects; tilemap draw loops allocate nothing per frame.
- Assets are code: pixel-string grids indexing `PALETTE` (base-32 chars, `.` = transparent). No image or sound files.
- TypeScript strict; `noUnusedLocals`; no `any`.
- TDD: write the failing test first. Run a single file with `npx vitest run <path>`; full suite `npm test`; `npm run typecheck` before every commit.
- Camera/world: `SCROLL_SPEED = 60` px/s; `LEVEL_LENGTH = 11_280` px; camera starts at `y = LEVEL_LENGTH − HEIGHT` and scrolls toward 0; entities despawn 32 px (`CAM_MARGIN`) outside the camera rect.
- Weapons: chain gun 120 rpm (0.5 s interval), dmg 0.75, single `nose` barrel. Miniguns 240 rpm per barrel (0.25 s), dmg 1.0, both pods. Rockets: salvo of exactly 10, one per 3 ticks, alternating pylons, dmg 2, launch speed 120 px/s, linear accel 900 px/s², seeded spread ±4°, 20 s cooldown after the salvo ends. Missiles: 0.5 s interval, dmg 3, speed 300 px/s, homing turn cap 3.5 rad/s, splash 24 px radius for 1 dmg, ammo +3/crate max 9.
- Enemies: boat hp 3, radius 10, world vel (0, 40), turret fires aimed 140 px/s shots every 2.4 s ± 0.4 s (seeded), score 100, salvage chance 0.25. Delta hp 2, radius 8, world vel (0, 120), weave `x = baseX + sin(age × 2.2) × 28`, one straight-down 200 px/s shot when within 220 px of the player's y, score 150, salvage chance 0.40.
- Run state: 3 lives, 3 hp per life; hit → 90 invuln ticks; death → respawn in place, 180 invuln ticks; salvage +25 score.
- Palette indices (base-32 char → color): `1` dark, `5` orange, `6` brass, `8` yellow, `9` green, `g`/`h` deep blues, `i`/`j` light blue/cyan, `l` white, `m` light gray-blue, `o`/`p` grays.
- Player-facing text tone: late-80s action movie, sincere with a wink ("GOOD SHOOTING, TEX.").

---

### Task 1: Renderer camera + engine/scene.ts

**Files:**
- Modify: `src/engine/renderer.ts` (add `camera` to `Renderer` and `createRenderer`)
- Create: `src/engine/scene.ts`
- Test: `src/engine/scene.test.ts`, extend `src/engine/renderer.test.ts`

**Interfaces:**
- Consumes: existing `Renderer` from `src/engine/renderer.ts`.
- Produces: `Renderer.camera: { x: number; y: number }` (starts `{x: 0, y: 0}`; the renderer never applies it — game draw code subtracts it). `Scene { enter(): void; update(dt: number): void; draw(ctx: CanvasRenderingContext2D): void }`, `SceneManager { current: Scene | null; switchTo(s: Scene): void; update(dt: number): void; draw(ctx: CanvasRenderingContext2D): void }`, `createSceneManager(): SceneManager`.

- [ ] **Step 1: Write the failing tests**

Append to `src/engine/renderer.test.ts` (it already imports `computePresentation`; add `createRenderer` usage only if a DOM canvas is available — it is not in the headless suite, so test the camera on the interface type via a scene-level check instead). Create `src/engine/scene.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createSceneManager, type Scene } from './scene';

function stubScene(): Scene & { entered: number; updated: number[]; drawn: number } {
  const s = {
    entered: 0,
    updated: [] as number[],
    drawn: 0,
    enter() { s.entered++; },
    update(dt: number) { s.updated.push(dt); },
    draw() { s.drawn++; },
  };
  return s;
}

describe('scene manager', () => {
  it('starts with no current scene and ignores update/draw', () => {
    const mgr = createSceneManager();
    expect(mgr.current).toBeNull();
    expect(() => mgr.update(1 / 60)).not.toThrow();
    expect(() => mgr.draw(null as unknown as CanvasRenderingContext2D)).not.toThrow();
  });

  it('switchTo sets current and calls enter() exactly once', () => {
    const mgr = createSceneManager();
    const a = stubScene();
    mgr.switchTo(a);
    expect(mgr.current).toBe(a);
    expect(a.entered).toBe(1);
  });

  it('update and draw delegate to the current scene', () => {
    const mgr = createSceneManager();
    const a = stubScene();
    mgr.switchTo(a);
    mgr.update(1 / 60);
    mgr.draw(null as unknown as CanvasRenderingContext2D);
    expect(a.updated).toEqual([1 / 60]);
    expect(a.drawn).toBe(1);
  });

  it('switching scenes enters the new scene and stops updating the old', () => {
    const mgr = createSceneManager();
    const a = stubScene();
    const b = stubScene();
    mgr.switchTo(a);
    mgr.switchTo(b);
    mgr.update(1 / 60);
    expect(b.entered).toBe(1);
    expect(a.updated).toHaveLength(0);
    expect(b.updated).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run src/engine/scene.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement**

`src/engine/scene.ts`:

```ts
// Scenes are the spec's { enter, update, draw } triple (engine spec §7).
// The manager is deliberately minimal: no stack, no transitions.
export interface Scene {
  enter(): void;
  update(dt: number): void;
  draw(ctx: CanvasRenderingContext2D): void;
}

export interface SceneManager {
  current: Scene | null;
  switchTo(s: Scene): void;
  update(dt: number): void;
  draw(ctx: CanvasRenderingContext2D): void;
}

export function createSceneManager(): SceneManager {
  const mgr: SceneManager = {
    current: null,
    switchTo(s) {
      mgr.current = s;
      s.enter();
    },
    update(dt) {
      mgr.current?.update(dt);
    },
    draw(ctx) {
      mgr.current?.draw(ctx);
    },
  };
  return mgr;
}
```

In `src/engine/renderer.ts`, add to the `Renderer` interface:

```ts
export interface Camera { x: number; y: number }

export interface Renderer {
  ctx: CanvasRenderingContext2D;
  // World-space view origin. The renderer never applies it; game draw code
  // subtracts it (draw at pos - camera). Owned/reset by the active scene.
  camera: Camera;
  present(): void;
  resize(): void;
}
```

and in `createRenderer`'s returned object add `camera: { x: 0, y: 0 },`.

- [ ] **Step 4: Verify** — `npx vitest run src/engine/scene.test.ts` PASS, `npm run typecheck` clean, `npm test` green.
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: renderer camera field + scene manager"`

---

### Task 2: engine/tilemap.ts

**Files:**
- Create: `src/engine/tilemap.ts`
- Test: `src/engine/tilemap.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces:

```ts
export interface Tilemap {
  tileSize: number;
  tiles: CanvasImageSource[];
  pickTile(col: number, row: number, frame: number): number;
}
export function visibleRange(cam: number, view: number, tileSize: number): [number, number];
export function drawTilemap(
  ctx: CanvasRenderingContext2D, map: Tilemap,
  camX: number, camY: number, viewW: number, viewH: number, frame: number,
): void;
```

`visibleRange(cam, view, tileSize)` returns the first and last (inclusive) tile indices whose span intersects `[cam, cam + view)`. Indices may be negative (world y above 0 never happens in TOP, but the math is general).

- [ ] **Step 1: Write the failing test** — `src/engine/tilemap.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { visibleRange } from './tilemap';

describe('visibleRange', () => {
  it('covers exactly the tiles intersecting the view', () => {
    // cam=0, view=480, tile=16 → tiles 0..29 (30 tiles * 16 = 480)
    expect(visibleRange(0, 480, 16)).toEqual([0, 29]);
  });

  it('includes partially visible tiles on both edges', () => {
    // cam=8: tile 0 is half visible; right edge at 488 → tile 30 half visible
    expect(visibleRange(8, 480, 16)).toEqual([0, 30]);
  });

  it('handles negative camera positions', () => {
    expect(visibleRange(-20, 64, 16)).toEqual([-2, 2]);
  });

  it('exact multiples do not overshoot', () => {
    expect(visibleRange(16, 32, 16)).toEqual([1, 2]);
  });
});
```

- [ ] **Step 2: Verify failure** — `npx vitest run src/engine/tilemap.test.ts` → FAIL.
- [ ] **Step 3: Implement** — `src/engine/tilemap.ts`:

```ts
// Repeating tile grid drawn relative to a camera. The engine knows nothing
// about what the tiles depict; the game supplies rasterized tiles and a
// pure pickTile(col,row,frame) that indexes them.
export interface Tilemap {
  tileSize: number;
  tiles: CanvasImageSource[];
  pickTile(col: number, row: number, frame: number): number;
}

// First and last (inclusive) tile indices whose span intersects
// [cam, cam + view). Pure; used by drawTilemap and tested headlessly.
export function visibleRange(cam: number, view: number, tileSize: number): [number, number] {
  const first = Math.floor(cam / tileSize);
  const last = Math.ceil((cam + view) / tileSize) - 1;
  return [first, last];
}

export function drawTilemap(
  ctx: CanvasRenderingContext2D, map: Tilemap,
  camX: number, camY: number, viewW: number, viewH: number, frame: number,
): void {
  const [c0, c1] = visibleRange(camX, viewW, map.tileSize);
  const [r0, r1] = visibleRange(camY, viewH, map.tileSize);
  for (let row = r0; row <= r1; row++) {
    for (let col = c0; col <= c1; col++) {
      const tile = map.tiles[map.pickTile(col, row, frame)];
      if (tile) {
        ctx.drawImage(tile, col * map.tileSize - camX, row * map.tileSize - camY);
      }
    }
  }
}
```

- [ ] **Step 4: Verify** — test PASS, typecheck clean.
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: engine tilemap with camera-relative visible range"`

---

### Task 3: Water tiles (game/sprites/tiles.ts)

**Files:**
- Create: `src/game/sprites/tiles.ts`
- Test: `src/game/sprites/tiles.test.ts`

**Interfaces:**
- Consumes: `parseGrid`, `rasterize`, `PixelGrid` from `src/engine/sprite.ts`; `Tilemap` from `src/engine/tilemap.ts`; `PALETTE`.
- Produces:

```ts
export const WATER_TILES: PixelGrid[];          // 6 grids: 3 variants x 2 animation frames
export function pickWaterTile(col: number, row: number, frame: number): number;
export function createWaterTilemap(): Tilemap;  // rasterizes WATER_TILES (browser only)
export const WATER_FRAME_TICKS = 30;            // advance animation frame every 30 ticks
```

Layout of `WATER_TILES`: index `variant * 2 + (frame % 2)` — variants 0 calm, 1 chop, 2 foam. `pickWaterTile` hashes (col,row) to a variant (~80% calm / ~15% chop / ~5% foam), stable across calls, and returns `variant * 2 + (frame % 2)`.

- [ ] **Step 1: Write the failing test** — `src/game/sprites/tiles.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { pickWaterTile, WATER_TILES } from './tiles';

describe('water tiles', () => {
  it('has 3 variants x 2 frames of 16x16', () => {
    expect(WATER_TILES).toHaveLength(6);
    for (const g of WATER_TILES) {
      expect(g.width).toBe(16);
      expect(g.height).toBe(16);
    }
  });

  it('pickWaterTile is stable for the same cell', () => {
    for (let i = 0; i < 20; i++) {
      expect(pickWaterTile(7, 13, 0)).toBe(pickWaterTile(7, 13, 0));
    }
  });

  it('frame parity selects the animation frame of the same variant', () => {
    const a = pickWaterTile(3, 5, 0);
    const b = pickWaterTile(3, 5, 1);
    expect(Math.floor(a / 2)).toBe(Math.floor(b / 2));
    expect(a % 2).toBe(0);
    expect(b % 2).toBe(1);
  });

  it('variant distribution is mostly calm with some chop and foam', () => {
    const counts = [0, 0, 0];
    for (let row = 0; row < 40; row++) {
      for (let col = 0; col < 40; col++) {
        counts[Math.floor(pickWaterTile(col, row, 0) / 2)]++;
      }
    }
    expect(counts[0]).toBeGreaterThan(1000); // calm dominates (of 1600)
    expect(counts[1]).toBeGreaterThan(50);   // chop present
    expect(counts[2]).toBeGreaterThan(10);   // foam present
    expect(counts[2]).toBeLessThan(counts[1]); // foam rarest
  });
});
```

- [ ] **Step 2: Verify failure.**
- [ ] **Step 3: Implement** — `src/game/sprites/tiles.ts`:

```ts
// Caribbean water: three 16x16 variants (calm, light chop, foam fleck),
// two shimmer frames each. Rows are generated from sparkle coordinates so
// every row is exactly 16 chars by construction. Palette: g deep blue,
// h/i highlights, l white foam.
import { parseGrid, rasterize, type PixelGrid } from '../../engine/sprite';
import type { Tilemap } from '../../engine/tilemap';
import { PALETTE } from '../palette';

export const WATER_FRAME_TICKS = 30;

const SIZE = 16;

// [x, y, paletteChar] sparkles over a solid deep-blue base.
type Fleck = [number, number, string];

function tile(flecks: Fleck[]): PixelGrid {
  const rows = Array.from({ length: SIZE }, () => new Array<string>(SIZE).fill('g'));
  for (const [x, y, ch] of flecks) rows[y][x] = ch;
  return parseGrid(rows.map((r) => r.join('')), PALETTE);
}

const CALM_A: Fleck[] = [[5, 2, 'h'], [10, 5, 'h'], [2, 9, 'h'], [13, 13, 'h']];
const CALM_B: Fleck[] = [[5, 3, 'h'], [10, 6, 'h'], [2, 10, 'h'], [13, 14, 'h']];
const CHOP_A: Fleck[] = [
  [4, 1, 'h'], [5, 1, 'h'], [10, 3, 'i'], [11, 3, 'h'], [12, 3, 'h'],
  [2, 5, 'h'], [3, 5, 'h'], [4, 5, 'i'], [7, 8, 'h'], [8, 8, 'h'],
  [1, 11, 'i'], [2, 11, 'h'], [11, 13, 'i'], [12, 13, 'h'],
];
const CHOP_B: Fleck[] = [
  [4, 2, 'i'], [5, 2, 'h'], [11, 4, 'h'], [12, 4, 'h'], [13, 4, 'i'],
  [2, 6, 'h'], [3, 6, 'h'], [4, 6, 'i'], [7, 9, 'i'], [8, 9, 'h'], [9, 9, 'h'],
  [2, 12, 'i'], [3, 12, 'h'], [12, 14, 'i'], [13, 14, 'h'],
];
const FOAM_A: Fleck[] = [
  [5, 2, 'l'], [6, 2, 'l'], [7, 2, 'i'], [4, 3, 'i'], [5, 3, 'l'],
  [10, 6, 'l'], [11, 6, 'l'], [9, 7, 'i'], [10, 7, 'l'], [11, 7, 'l'], [12, 7, 'i'],
  [2, 10, 'l'], [13, 13, 'l'],
];
const FOAM_B: Fleck[] = [
  [6, 2, 'l'], [7, 2, 'i'], [5, 3, 'i'], [6, 3, 'l'],
  [11, 6, 'l'], [12, 6, 'l'], [10, 7, 'i'], [11, 7, 'l'], [12, 7, 'l'],
  [4, 10, 'l'], [12, 13, 'l'],
];

export const WATER_TILES: PixelGrid[] = [
  tile(CALM_A), tile(CALM_B),
  tile(CHOP_A), tile(CHOP_B),
  tile(FOAM_A), tile(FOAM_B),
];

// Small integer hash of the cell -> stable variant choice.
function cellHash(col: number, row: number): number {
  let h = (col * 374761393 + row * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

export function pickWaterTile(col: number, row: number, frame: number): number {
  const r = cellHash(col, row) % 100;
  const variant = r < 80 ? 0 : r < 95 ? 1 : 2;
  return variant * 2 + (frame % 2);
}

export function createWaterTilemap(): Tilemap {
  return {
    tileSize: 16,
    tiles: WATER_TILES.map(rasterize),
    pickTile: pickWaterTile,
  };
}
```

- [ ] **Step 4: Verify** — test PASS, typecheck clean, `npm test` green.
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: animated water tile set + deterministic variant picker"`

---

### Task 4: entities.ts world-space rework (typed pools, camera bounds, spawn helpers)

**Files:**
- Modify: `src/game/entities.ts`, `src/game/entities.test.ts`, `src/game/main.ts` (keep the sandbox compiling)

**Interfaces:**
- Consumes: existing pool/collide/rng engine modules.
- Produces (later tasks rely on these exact shapes):

```ts
export const CAM_MARGIN = 32;

export interface Bullet extends Entity {
  kind: 'bullet';
  dmg: number;
  splash: boolean;      // on hit, damage enemies within SPLASH_RADIUS by 1
  homing: boolean;      // steer toward nearest enemy (turn-rate capped)
  accel: number;        // px/s² along current velocity direction
  trail: boolean;       // emit smoke every TRAIL_TICKS
  trailCount: number;
}
export interface Enemy extends Entity {
  kind: 'enemy';
  enemyKind: 'boat' | 'delta';
  fireTimer: number;    // boats: seconds to next aimed shot
  baseX: number;        // deltas: weave center
  hasFired: boolean;    // deltas: single shot latch
  score: number;
  salvageChance: number;
}
export type PickupKind = 'minigun' | 'rockets' | 'crate' | 'salvage';
export interface Pickup extends Entity {
  kind: 'pickup';
  pickupKind: PickupKind;
}
export interface World {
  bullets: Pool<Bullet>;
  enemyBullets: Pool<Entity>;
  enemies: Pool<Enemy>;
  pickups: Pool<Pickup>;
  particles: Pool<Particle>;
  rng: () => number;
}
export function createWorld(rng: () => number): World; // bullets 64, enemyBullets 64, enemies 16, pickups 16, particles 256
export function tickBullets(w: World, dt: number, camY: number): void;
export function tickEnemyBullets(w: World, dt: number, camY: number): void;
export function tickEnemies(w: World, dt: number, camY: number, player: Vec2): void; // bounds only here; behaviors in Task 6
export function tickPickups(w: World, dt: number, camY: number, player: Vec2): void;
export function tickParticles(w: World, dt: number): void;      // unchanged
export function spawnBoat(w: World, x: number, y: number): Enemy | undefined;
export function spawnDelta(w: World, x: number, y: number): Enemy | undefined;
export function spawnPickup(w: World, kind: PickupKind, x: number, y: number): Pickup | undefined;
export function spawnTrailSmoke(w: World, x: number, y: number): void;
```

Unchanged and still exported: `Vec2`, `Entity`, `Particle`, `Muzzle`, `FireControl`, `createFireControl`, `tickFire`, `FIRE_INTERVAL`, `FLASH_TICKS`, `spawnSmoke`, `CollisionResult`, `collideBulletsEnemies` (dmg/splash/salvage arrive in Task 6; this task only makes it use `b.dmg` — see below). **Deleted:** `Spawner`, `createSpawner`, `tickSpawner`, `tickEnemies`' old fixed-screen bound (replaced), `tickSpawner` tests.

Details:

- `makeBullet()` factory: entity defaults plus `dmg: 1, splash: false, homing: false, accel: 0, trail: false, trailCount: 0`. `tickFire` sets `b.dmg = 1` (and leaves the other flags at rest — it must reset ALL of them on spawn reuse: `splash/homing/trail = false`, `accel = 0`, `trailCount = 0`).
- `tickBullets(w, dt, camY)`: homing steering first (only if `b.homing` — find nearest live enemy by squared distance; if none, fly straight; else rotate velocity toward it capped at `HOMING_TURN_RATE = 3.5` rad/s, preserving speed), then `accel` (scale velocity by `(s + accel*dt)/s` where `s = hypot(vel)`, skip when `s === 0`), then integrate, then trail (`if (b.trail && b.trailCount++ % TRAIL_TICKS === 0) spawnTrailSmoke(w, b.pos.x, b.pos.y)` with `TRAIL_TICKS = 4`), then despawn when `b.pos.y < camY - CAM_MARGIN || b.pos.y > camY + HEIGHT + CAM_MARGIN || b.age > 2`.
- `tickEnemyBullets`: integrate pos/age, despawn outside the same camera-margin band. No homing/accel/trail.
- `tickEnemies(w, dt, camY, player: Vec2)`: replaces the old signature — this task ONLY moves the despawn bound to `e.pos.y > camY + HEIGHT + CAM_MARGIN` and adds the `player` parameter (unused until Task 6 adds behaviors; underscore-name it `_player` to satisfy noUnusedLocals... no: keep the name `player` and reference it in Task 6; for THIS task, accept the parameter but prefix with underscore `_player` and rename in Task 6).
- `tickPickups(w, dt, player: Vec2)`: integrate; magnetize: if squared distance to player < `MAGNET_RADIUS * MAGNET_RADIUS` (`MAGNET_RADIUS = 56`), set velocity toward the player at `MAGNET_SPEED = 220`; despawn below `camY + HEIGHT + CAM_MARGIN` — wait, that needs camY: signature is `tickPickups(w: World, dt: number, camY: number, player: Vec2): void`.
- `spawnBoat`: hp 3, radius 10, vel (0, 40), `fireTimer = 2.0 + w.rng() * 0.8`, score 100, salvageChance 0.25, enemyKind 'boat'.
- `spawnDelta`: hp 2, radius 8, vel (0, 120), `baseX = x`, hasFired false, score 150, salvageChance 0.40, enemyKind 'delta'.
- `spawnPickup`: radius 14 for 'minigun'/'rockets', 8 for 'crate', 6 for 'salvage'; vel (0, 40) weapons, (0, 45) crate, (0, 30) salvage.
- `spawnTrailSmoke`: one particle, size 1, color `PALETTE[24]`, life 0.4, vel `(w.rng()*8-4, 20)`.
- `collideBulletsEnemies`: change `e.hp--` to `e.hp -= b.dmg` (Task 6 adds splash/salvage/score).
- `main.ts`: replace the deleted spawner block with a temporary inline cadence (module-level `let spawnTimer = 1.5`; in `update`: `spawnTimer -= dt; if (spawnTimer <= 0) { spawnTimer = 1.5; spawnBoat(world, 24 + rng() * (WIDTH - 48), -16); }`) and pass `0` for `camY` and `{x: chopper.x, y: chopper.y}` where new signatures require them (module-level reused `const PLAYER_POS = {x: 0, y: 0}` mutated per tick — no per-tick allocation). The sandbox must still run: boats fall, guns kill them.

- [ ] **Step 1: Update the failing tests first.** In `src/game/entities.test.ts`: delete the `tickSpawner`/`createSpawner` describe block; update every `tickBullets(w, dt)` call to `tickBullets(w, dt, 0)`, `tickEnemies(w, dt)` to `tickEnemies(w, dt, 0, {x: 320, y: 400})`; add:

```ts
describe('typed spawns', () => {
  it('spawnBoat fills boat fields', () => {
    const w = createWorld(mulberry32(1));
    const e = spawnBoat(w, 100, -16);
    expect(e).toBeDefined();
    expect(e!.enemyKind).toBe('boat');
    expect(e!.hp).toBe(3);
    expect(e!.radius).toBe(10);
    expect(e!.vel).toEqual({ x: 0, y: 40 });
    expect(e!.score).toBe(100);
    expect(e!.salvageChance).toBeCloseTo(0.25);
    expect(e!.fireTimer).toBeGreaterThanOrEqual(2.0);
    expect(e!.fireTimer).toBeLessThanOrEqual(2.8);
  });

  it('spawnDelta fills delta fields', () => {
    const w = createWorld(mulberry32(1));
    const e = spawnDelta(w, 200, -16);
    expect(e!.enemyKind).toBe('delta');
    expect(e!.hp).toBe(2);
    expect(e!.baseX).toBe(200);
    expect(e!.hasFired).toBe(false);
    expect(e!.vel.y).toBe(120);
  });

  it('bullet spawn via tickFire resets projectile flags', () => {
    const w = createWorld(mulberry32(1));
    const fc = createFireControl();
    tickFire(w, fc, [{ x: 10, y: 10, dir: -1 }], true, 1 / 60);
    const b = w.bullets.items.find((x) => x.alive)!;
    // dirty the flags, kill it, respawn, verify reset
    b.splash = true; b.homing = true; b.accel = 99; b.trail = true; b.trailCount = 7; b.alive = false;
    fc.cooldown = 0;
    tickFire(w, fc, [{ x: 10, y: 10, dir: -1 }], true, 1 / 60);
    const b2 = w.bullets.items.find((x) => x.alive)!;
    expect(b2.dmg).toBe(1);
    expect(b2.splash).toBe(false);
    expect(b2.homing).toBe(false);
    expect(b2.accel).toBe(0);
    expect(b2.trail).toBe(false);
    expect(b2.trailCount).toBe(0);
  });
});

describe('camera-relative bounds', () => {
  it('bullets despawn above the camera band', () => {
    const w = createWorld(mulberry32(1));
    const b = w.bullets.spawn()!;
    b.pos.x = 100; b.pos.y = 1000 - CAM_MARGIN - 1; b.vel.y = 0; b.age = 0;
    tickBullets(w, 1 / 60, 1000);
    expect(b.alive).toBe(false);
  });

  it('enemies despawn below the camera band', () => {
    const w = createWorld(mulberry32(1));
    const e = spawnBoat(w, 100, 1000 + HEIGHT + CAM_MARGIN + 5)!;
    tickEnemies(w, 1 / 60, 1000, { x: 0, y: 0 });
    expect(e.alive).toBe(false);
  });

  it('enemy bullets integrate and despawn outside the band', () => {
    const w = createWorld(mulberry32(1));
    const b = w.enemyBullets.spawn()!;
    b.pos.x = 50; b.pos.y = 500; b.vel.x = 0; b.vel.y = 140; b.age = 0;
    tickEnemyBullets(w, 1 / 60, 0);
    expect(b.pos.y).toBeCloseTo(500 + 140 / 60);
    b.pos.y = HEIGHT + CAM_MARGIN + 1;
    tickEnemyBullets(w, 1 / 60, 0);
    expect(b.alive).toBe(false);
  });
});

describe('homing, accel, trail', () => {
  it('acceleration scales speed linearly', () => {
    const w = createWorld(mulberry32(1));
    const b = w.bullets.spawn()!;
    b.pos.x = 100; b.pos.y = 400; b.vel.x = 0; b.vel.y = -120; b.accel = 900; b.age = 0;
    tickBullets(w, 1 / 60, 0);
    expect(Math.abs(b.vel.y)).toBeCloseTo(120 + 900 / 60, 3);
    expect(b.vel.x).toBeCloseTo(0);
  });

  it('homing turns toward the nearest enemy, capped per tick', () => {
    const w = createWorld(mulberry32(1));
    spawnBoat(w, 300, 100);
    const b = w.bullets.spawn()!;
    b.pos.x = 100; b.pos.y = 100; b.vel.x = 0; b.vel.y = -300; b.homing = true; b.age = 0;
    const before = Math.atan2(b.vel.y, b.vel.x);
    tickBullets(w, 1 / 60, 0);
    const after = Math.atan2(b.vel.y, b.vel.x);
    const turned = Math.abs(after - before);
    expect(turned).toBeGreaterThan(0);
    expect(turned).toBeLessThanOrEqual(3.5 / 60 + 1e-9);
    expect(Math.hypot(b.vel.x, b.vel.y)).toBeCloseTo(300, 3);
  });

  it('trail emits one smoke particle every 4 ticks', () => {
    const w = createWorld(mulberry32(1));
    const b = w.bullets.spawn()!;
    b.pos.x = 100; b.pos.y = 300; b.vel.y = -120; b.trail = true; b.trailCount = 0; b.age = 0;
    for (let i = 0; i < 8; i++) tickBullets(w, 1 / 60, 0);
    expect(w.particles.countAlive()).toBe(2);
  });
});

describe('pickups', () => {
  it('spawnPickup sets kind-specific radius and drift', () => {
    const w = createWorld(mulberry32(1));
    expect(spawnPickup(w, 'minigun', 10, 10)!.radius).toBe(14);
    expect(spawnPickup(w, 'crate', 10, 10)!.radius).toBe(8);
    expect(spawnPickup(w, 'salvage', 10, 10)!.radius).toBe(6);
  });

  it('salvage magnetizes toward a close player', () => {
    const w = createWorld(mulberry32(1));
    const p = spawnPickup(w, 'salvage', 100, 100)!;
    tickPickups(w, 1 / 60, 0, { x: 110, y: 110 }); // within 56px
    const speed = Math.hypot(p.vel.x, p.vel.y);
    expect(speed).toBeCloseTo(220, 1);
    expect(p.vel.x).toBeGreaterThan(0);
    expect(p.vel.y).toBeGreaterThan(0);
  });

  it('far pickups keep drifting down', () => {
    const w = createWorld(mulberry32(1));
    const p = spawnPickup(w, 'salvage', 100, 100)!;
    tickPickups(w, 1 / 60, 0, { x: 500, y: 400 });
    expect(p.vel).toEqual({ x: 0, y: 30 });
  });
});
```

(Adjust imports at the top of the test file to include `CAM_MARGIN, spawnBoat, spawnDelta, spawnPickup, tickEnemyBullets, tickPickups` and `HEIGHT` from the renderer.)

- [ ] **Step 2: Verify failure** — `npx vitest run src/game/entities.test.ts` → FAIL (missing exports).
- [ ] **Step 3: Implement** per the Produces block and Details above. Keep every function allocation-free in steady state (spawn helpers only touch pooled objects).
- [ ] **Step 4: Verify** — entities tests PASS; `npm test` (main.ts adjustments compile); `npm run typecheck`. Manually confirm the dev sandbox still runs if the server is up.
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: world-space entities — typed pools, camera bounds, homing/accel/trail projectiles"`

---

### Task 5: Delta drone sprite (game/sprites/delta.ts)

**Files:**
- Create: `src/game/sprites/delta.ts`
- Test: `src/game/sprites/delta.test.ts`

**Interfaces:**
- Consumes: `parseGrid`, `SpriteDef`, `LayeredSprite` from engine sprite; `PALETTE`.
- Produces: `DELTA_BODY: SpriteDef` (single 24x16 frame; anchors `{ tail: [11, 14] }`), `DELTA_JET: SpriteDef` (two 4x3 flicker frames; anchor `{ mount: [1, 0] }`), `createDelta(): LayeredSprite` (body + jet on `tail`).

- [ ] **Step 1: Write the failing test** — `src/game/sprites/delta.test.ts` (same shape as `boat.test.ts`):

```ts
import { describe, expect, it } from 'vitest';
import { layerOffsets } from '../../engine/sprite';
import { createDelta, DELTA_BODY, DELTA_JET } from './delta';

describe('delta drone sprite', () => {
  it('body is a single 24x16 frame', () => {
    expect(DELTA_BODY.frames).toHaveLength(1);
    expect(DELTA_BODY.frames[0].width).toBe(24);
    expect(DELTA_BODY.frames[0].height).toBe(16);
  });

  it('jet has two frames of identical size with a mount anchor', () => {
    expect(DELTA_JET.frames).toHaveLength(2);
    expect(DELTA_JET.frames[0].width).toBe(DELTA_JET.frames[1].width);
    expect(DELTA_JET.frames[0].height).toBe(DELTA_JET.frames[1].height);
    expect(DELTA_JET.anchors.mount).toBeDefined();
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
    expect(offsets[1].x + jet.width).toBeLessThanOrEqual(24);
    expect(offsets[1].y + jet.height).toBeLessThanOrEqual(16);
  });
});
```

- [ ] **Step 2: Verify failure.**
- [ ] **Step 3: Implement** — `src/game/sprites/delta.ts`. Delta-wing target drone flying DOWN-screen (nose at the bottom), orange/gray training livery. Palette: `5` orange, `p`/`m` grays, `j` cyan canopy glint, `1` dark, `8` yellow jet core. 24 columns x 16 rows; every row exactly 24 chars:

```ts
// Delta-wing target drone: flies down-screen (nose at the bottom edge),
// bright orange training livery over gray, cyan canopy glint. The jet
// flicker layer sits at the trailing (top) edge on the tail anchor.
import { parseGrid, type LayeredSprite, type SpriteDef } from '../../engine/sprite';
import { PALETTE } from '../palette';

const BODY_ROWS = [
  '55p................mp55.',
  '55pp..............pp55..',
  '.55pp............pp55...',
  '.555pp..........pp555...',
  '..555pp........pp555....',
  '..5555pp..1..pp5555.....',
  '...5555pp.m.pp5555......',
  '...55555ppmpp55555......',
  '....5555pmmmp5555.......',
  '....555pmmmmmp555.......',
  '.....55pmmjmmp55........',
  '.....5pmmmjmmmp5........',
  '......pmmmjmmmp.........',
  '......pmm111mmp.........',
  '.......pm111mp..........',
  '........p111p...........',
];

export const DELTA_BODY: SpriteDef = {
  frames: [parseGrid(BODY_ROWS, PALETTE)],
  anchors: { tail: [11, 14] },
};

export const DELTA_JET: SpriteDef = {
  frames: [
    parseGrid(['.8..', '.55.', '....'], PALETTE),
    parseGrid(['.88.', '.5..', '.5..'], PALETTE),
  ],
  anchors: { mount: [1, 0] },
};

export function createDelta(): LayeredSprite {
  return {
    layers: [
      { def: DELTA_BODY, frame: 0 },
      { def: DELTA_JET, frame: 0, attach: { to: 'tail', by: 'mount' } },
    ],
  };
}
```

**Row-length check is on you:** every BODY_ROWS string must be exactly 24 chars and every jet row 4 chars — `parseGrid` throws otherwise and the test suite catches it at import. Adjust padding dots if a row is off; keep the delta silhouette (wide at the top/trailing edge, narrowing to the nose at the bottom). Art is a guide, not a literal — tweak pixels freely as long as dimensions, anchors, and layer structure match the tests.

- [ ] **Step 4: Verify** — test PASS, `npm test`, typecheck.
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: delta-wing target drone sprite"`

---

### Task 6: Enemy behaviors + player-side collisions (entities.ts)

**Files:**
- Modify: `src/game/entities.ts`, `src/game/entities.test.ts`

**Interfaces:**
- Consumes: Task 4's `Enemy`, `World`, pools.
- Produces:

```ts
export function tickEnemies(w: World, dt: number, camY: number, player: Vec2): void; // now with behaviors
export const SPLASH_RADIUS = 24;
export interface CollisionResult { hits: number; kills: number; score: number; }
export function collideBulletsEnemies(w: World): CollisionResult;  // dmg, splash, salvage drops, score
export function collideEnemyBulletsPlayer(w: World, player: Vec2, radius: number, invulnerable: boolean): boolean;
export function collideEnemiesPlayer(w: World, player: Vec2, radius: number, invulnerable: boolean): boolean;
export function collidePickupsPlayer(w: World, player: Vec2, radius: number, onCollect: (kind: PickupKind) => void): void;
```

Behavior details:

- Boats (`enemyKind === 'boat'`): integrate pos; `fireTimer -= dt`; when `fireTimer <= 0` AND the boat is inside the visible band (`camY <= pos.y <= camY + HEIGHT`): spawn one enemy bullet aimed at the player's current position (normalize `player − pos`, speed 140; if the player is exactly on the boat, fire straight down), reset `fireTimer = 2.0 + w.rng() * 0.8`.
- Deltas: `pos.x = baseX + Math.sin(age * 2.2) * 28` (overwrite x each tick; vel.x stays 0); integrate y; if `!hasFired && Math.abs(player.y - pos.y) < 220`: spawn one enemy bullet vel (0, 200), `hasFired = true`.
- Kill path shared: extract a private `killEnemy(w, e, result)` from `collideBulletsEnemies`: sets dead, `result.kills++`, `result.score += e.score`, 12-particle burst life 0.5, 4 lingering smoke life 1.2, and salvage: `if (w.rng() < e.salvageChance) spawnPickup(w, 'salvage', e.pos.x, e.pos.y)`.
- Splash: when a bullet with `splash` hits, after the direct damage loop over `w.enemies.forEachAlive` again: enemies (other than the direct target) within `SPLASH_RADIUS` of the impact take 1 damage (and go through `killEnemy` if they die).
- `collideEnemyBulletsPlayer` / `collideEnemiesPlayer`: if `invulnerable`, return false without checks. On overlap (`circlesOverlap`): enemy bullet dies (rammed enemies do NOT die — the player bounces off), spawn a 3-particle spark at the impact, return true (at most one hit per call — return early).
- `collidePickupsPlayer`: on overlap, pickup dies, `onCollect(pickup.pickupKind)` fires. No allocation — callback style.
- `CollisionResult` module-level reused object gains `score: 0` reset per call.

- [ ] **Step 1: Write the failing tests** — append to `src/game/entities.test.ts`:

```ts
describe('enemy behaviors', () => {
  it('boat fires an aimed shot when timer elapses on-screen', () => {
    const w = createWorld(mulberry32(7));
    const boat = spawnBoat(w, 100, 100)!;
    boat.fireTimer = 0.01;
    tickEnemies(w, 1 / 60, 0, { x: 200, y: 300 });
    expect(w.enemyBullets.countAlive()).toBe(1);
    const b = w.enemyBullets.items.find((x) => x.alive)!;
    const speed = Math.hypot(b.vel.x, b.vel.y);
    expect(speed).toBeCloseTo(140, 1);
    expect(b.vel.x).toBeGreaterThan(0); // aimed right-down toward (200,300)
    expect(b.vel.y).toBeGreaterThan(0);
    expect(boat.fireTimer).toBeGreaterThan(1.9); // reset
  });

  it('boat holds fire while off-screen', () => {
    const w = createWorld(mulberry32(7));
    const boat = spawnBoat(w, 100, -100)!;
    boat.fireTimer = 0.01;
    tickEnemies(w, 1 / 60, 0, { x: 200, y: 300 });
    expect(w.enemyBullets.countAlive()).toBe(0);
  });

  it('delta weaves as a pure function of age', () => {
    const w = createWorld(mulberry32(7));
    const d = spawnDelta(w, 300, 50)!;
    for (let i = 0; i < 30; i++) tickEnemies(w, 1 / 60, 0, { x: 0, y: 1000 });
    expect(d.pos.x).toBeCloseTo(300 + Math.sin(d.age * 2.2) * 28, 5);
  });

  it('delta fires exactly once when close to player y', () => {
    const w = createWorld(mulberry32(7));
    const d = spawnDelta(w, 300, 50)!;
    for (let i = 0; i < 10; i++) tickEnemies(w, 1 / 60, 0, { x: 300, y: 200 });
    expect(w.enemyBullets.countAlive()).toBe(1);
    expect(d.hasFired).toBe(true);
    const b = w.enemyBullets.items.find((x) => x.alive)!;
    expect(b.vel).toEqual({ x: 0, y: 200 });
  });
});

describe('player-side collisions', () => {
  it('enemy bullet hits the player once and dies', () => {
    const w = createWorld(mulberry32(7));
    const b = w.enemyBullets.spawn()!;
    b.pos.x = 100; b.pos.y = 100; b.radius = 2;
    expect(collideEnemyBulletsPlayer(w, { x: 100, y: 100 }, 10, false)).toBe(true);
    expect(b.alive).toBe(false);
  });

  it('invulnerability shrugs off bullets and ramming', () => {
    const w = createWorld(mulberry32(7));
    const b = w.enemyBullets.spawn()!;
    b.pos.x = 100; b.pos.y = 100; b.radius = 2;
    spawnBoat(w, 100, 100);
    expect(collideEnemyBulletsPlayer(w, { x: 100, y: 100 }, 10, true)).toBe(false);
    expect(collideEnemiesPlayer(w, { x: 100, y: 100 }, 10, true)).toBe(false);
    expect(b.alive).toBe(true);
  });

  it('ramming an enemy hurts the player but not the enemy', () => {
    const w = createWorld(mulberry32(7));
    const e = spawnBoat(w, 100, 100)!;
    expect(collideEnemiesPlayer(w, { x: 105, y: 100 }, 10, false)).toBe(true);
    expect(e.alive).toBe(true);
  });
});

describe('damage, splash, salvage, score', () => {
  it('kills award score in the result', () => {
    const w = createWorld(mulberry32(9));
    const e = spawnBoat(w, 100, 100)!;
    e.hp = 1;
    const b = w.bullets.spawn()!;
    b.pos.x = 100; b.pos.y = 100; b.radius = 2; b.dmg = 1;
    const r = collideBulletsEnemies(w);
    expect(r.kills).toBe(1);
    expect(r.score).toBe(100);
  });

  it('dmg 3 one-shots a boat', () => {
    const w = createWorld(mulberry32(9));
    spawnBoat(w, 100, 100);
    const b = w.bullets.spawn()!;
    b.pos.x = 100; b.pos.y = 100; b.radius = 4; b.dmg = 3;
    expect(collideBulletsEnemies(w).kills).toBe(1);
  });

  it('splash damages nearby enemies by 1', () => {
    const w = createWorld(mulberry32(9));
    const near = spawnBoat(w, 120, 100)!;   // 20px away — inside 24
    const far = spawnBoat(w, 160, 100)!;    // 60px away — outside
    const target = spawnBoat(w, 100, 100)!;
    const b = w.bullets.spawn()!;
    b.pos.x = 100; b.pos.y = 100; b.radius = 4; b.dmg = 3; b.splash = true;
    collideBulletsEnemies(w);
    expect(target.alive).toBe(false);
    expect(near.hp).toBe(2);
    expect(far.hp).toBe(3);
  });

  it('salvage drops are seeded by enemy chance', () => {
    // With enough kills at chance 1.0 vs 0.0 the pickup counts differ.
    const w = createWorld(mulberry32(11));
    const e = spawnBoat(w, 100, 100)!;
    e.hp = 1; e.salvageChance = 1;
    const b = w.bullets.spawn()!;
    b.pos.x = 100; b.pos.y = 100; b.radius = 2; b.dmg = 1;
    collideBulletsEnemies(w);
    expect(w.pickups.countAlive()).toBe(1);
    expect(w.pickups.items.find((p) => p.alive)!.pickupKind).toBe('salvage');
  });

  it('pickup collection fires the callback and kills the pickup', () => {
    const w = createWorld(mulberry32(11));
    spawnPickup(w, 'crate', 100, 100);
    const got: string[] = [];
    collidePickupsPlayer(w, { x: 100, y: 100 }, 10, (k) => got.push(k));
    expect(got).toEqual(['crate']);
    expect(w.pickups.countAlive()).toBe(0);
  });
});
```

- [ ] **Step 2: Verify failure.**
- [ ] **Step 3: Implement** per the behavior details. Rename Task 4's `_player` parameter to `player` now that it's used.
- [ ] **Step 4: Verify** — full `npm test` + typecheck.
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: enemy fire, delta weave, splash, salvage drops, player collisions"`

---

### Task 7: game/waves.ts — seeded wave script

**Files:**
- Create: `src/game/waves.ts` (replaces the stub), `src/game/waves.test.ts`
- Modify: `src/game/main.ts` (swap the temporary inline spawner for a wave runner pinned at camY 0)

**Interfaces:**
- Consumes: `World`, `spawnBoat`, `spawnDelta`, `spawnPickup`, `CAM_MARGIN` from entities; `WIDTH`, `HEIGHT` from renderer.
- Produces:

```ts
export const SCROLL_SPEED = 60;                 // px/s, camera scroll rate
export const LEVEL_LENGTH = 11_280;             // px: HEIGHT + 180 s * 60 px/s
export type SpawnKind = 'boat' | 'delta' | 'missileCrate' | 'minigunPickup' | 'rocketPickup';
export interface SpawnEvent { atY: number; kind: SpawnKind; x: number; }
export function generateWaveScript(rng: () => number, levelLength: number): SpawnEvent[];
export interface WaveRunner { script: SpawnEvent[]; next: number; }
export function createWaveRunner(script: SpawnEvent[]): WaveRunner;
export function tickWaves(w: World, runner: WaveRunner, camY: number): void;
```

Generation model: the level plays for `(levelLength − HEIGHT) / SCROLL_SPEED` seconds (180 for the real length). An event at level-time `t` seconds spawns at world `atY = (levelLength − HEIGHT) − SCROLL_SPEED * t − CAM_MARGIN` (just above the view when the camera passes). Events are generated band by band in time order, each `t` jittered by the rng, then the array is sorted by `atY` **descending** (earliest first). `x` positions: `24 + rng() * (WIDTH − 48)`, clamped to `[24, WIDTH − 24]` after any pair/trio offset.

Bands (times in level seconds; every `± j` is `t + (rng()*2−1)*j`):

1. **Warm-up (4 ≤ t < 40):** one boat every 4 s ± 1 s. `minigunPickup` at exactly t = 40 (no jitter), x = WIDTH/2.
2. **Boat pairs (40 ≤ t < 80):** a pair every 6 s ± 1 s — two boats at the same jittered t (second one at t + 0.4), x and x ± 80 (clamped). `missileCrate` at t = 55 ± 3 and t = 70 ± 3.
3. **Deltas join (80 ≤ t < 120):** one delta every 7 s ± 1.5 s AND one boat every 8 s ± 1 s. `rocketPickup` at exactly t = 90, x = WIDTH/2.
4. **Combined arms (120 ≤ t < 170):** a boat trio every 10 s ± 1 s (x−80, x, x+80, at t, t+0.3, t+0.6) AND a delta pair every 9 s ± 1.5 s (x and WIDTH − x, at t and t + 0.5). `missileCrate` at t = 140 ± 3.
5. **Breather (170 ≤ t ≤ 180):** nothing.

`tickWaves`: while `runner.next < script.length && script[runner.next].atY >= camY − CAM_MARGIN`: spawn (`boat` → `spawnBoat`, `delta` → `spawnDelta`, `missileCrate` → `spawnPickup(w,'crate',…)`, `minigunPickup` → `spawnPickup(w,'minigun',…)`, `rocketPickup` → `spawnPickup(w,'rockets',…)`) at `(x, atY)`, then `runner.next++`. Events never re-fire (the index only advances).

- [ ] **Step 1: Write the failing tests** — `src/game/waves.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../engine/rng';
import { createWorld } from './entities';
import {
  createWaveRunner, generateWaveScript, LEVEL_LENGTH, tickWaves,
} from './waves';

describe('generateWaveScript', () => {
  const script = generateWaveScript(mulberry32(0xc0ffee), LEVEL_LENGTH);

  it('is sorted by atY descending (earliest event first)', () => {
    for (let i = 1; i < script.length; i++) {
      expect(script[i].atY).toBeLessThanOrEqual(script[i - 1].atY);
    }
  });

  it('same seed → identical script; different seed differs', () => {
    expect(generateWaveScript(mulberry32(0xc0ffee), LEVEL_LENGTH)).toEqual(script);
    expect(generateWaveScript(mulberry32(0xbeef), LEVEL_LENGTH)).not.toEqual(script);
  });

  it('has a plausible event population', () => {
    expect(script.length).toBeGreaterThanOrEqual(45);
    expect(script.length).toBeLessThanOrEqual(90);
    const kinds = script.map((e) => e.kind);
    expect(kinds.filter((k) => k === 'minigunPickup')).toHaveLength(1);
    expect(kinds.filter((k) => k === 'rocketPickup')).toHaveLength(1);
    expect(kinds.filter((k) => k === 'missileCrate')).toHaveLength(3);
    expect(kinds.filter((k) => k === 'boat').length).toBeGreaterThan(20);
    expect(kinds.filter((k) => k === 'delta').length).toBeGreaterThan(8);
  });

  it('minigun pickup comes before the rocket pickup', () => {
    const mg = script.findIndex((e) => e.kind === 'minigunPickup');
    const rk = script.findIndex((e) => e.kind === 'rocketPickup');
    expect(mg).toBeGreaterThanOrEqual(0);
    expect(mg).toBeLessThan(rk);
  });

  it('all x positions are inside the lane', () => {
    for (const e of script) {
      expect(e.x).toBeGreaterThanOrEqual(24);
      expect(e.x).toBeLessThanOrEqual(616);
    }
  });

  it('all events fit inside the level strip', () => {
    for (const e of script) {
      expect(e.atY).toBeLessThanOrEqual(LEVEL_LENGTH);
      expect(e.atY).toBeGreaterThanOrEqual(-64);
    }
  });
});

describe('tickWaves', () => {
  it('spawns events as the camera passes and never re-fires them', () => {
    const rng = mulberry32(0xc0ffee);
    const w = createWorld(rng);
    const script = generateWaveScript(mulberry32(0xc0ffee), LEVEL_LENGTH);
    const runner = createWaveRunner(script);
    const first = script[0];
    tickWaves(w, runner, first.atY + 100); // camera well before the first event
    expect(w.enemies.countAlive() + w.pickups.countAlive()).toBe(0);
    tickWaves(w, runner, first.atY + 32);  // exactly at the trigger line
    expect(runner.next).toBeGreaterThan(0);
    const spawned = runner.next;
    tickWaves(w, runner, first.atY + 32);  // same camera → nothing new
    expect(runner.next).toBe(spawned);
  });

  it('a full camera sweep consumes the entire script', () => {
    const rng = mulberry32(0xc0ffee);
    const w = createWorld(rng);
    const script = generateWaveScript(mulberry32(0xc0ffee), LEVEL_LENGTH);
    const runner = createWaveRunner(script);
    // Sweep camY from start to 0; drain pools between ticks so they never fill.
    for (let camY = LEVEL_LENGTH - 480; camY >= 0; camY -= 60) {
      tickWaves(w, runner, camY);
      w.enemies.reset();
      w.pickups.reset();
    }
    tickWaves(w, runner, 0);
    expect(runner.next).toBe(script.length);
  });
});
```

- [ ] **Step 2: Verify failure.**
- [ ] **Step 3: Implement** per the generation model. Structure suggestion: a local `events: SpawnEvent[] = []` plus `const timeToY = (t: number) => levelLength - 480 - 60 * t - 32;` (use the HEIGHT import and the SCROLL_SPEED/CAM_MARGIN constants, not magic numbers), band loops pushing events, one final sort `events.sort((a, b) => b.atY - a.atY)`. Generation runs once at level start — allocation is fine here; `tickWaves` must not allocate.
- [ ] **Step 4: Add a golden pin.** After the implementation passes, print `script.length`, `script[0]` and `script[script.length - 1]` for seed 0xc0ffee (temporary `console.log` in the test, then remove) and add a test asserting those exact recorded values (real observed values, never invented):

```ts
it('golden: seed 0xc0ffee script shape is pinned', () => {
  expect(script.length).toBe(/* recorded */);
  expect(script[0]).toEqual(/* recorded first event object */);
  expect(script[script.length - 1]).toEqual(/* recorded last event object */);
});
```

- [ ] **Step 5: Swap main.ts.** Replace the temporary inline spawner: keep the sandbox running by generating a script with `LEVEL_LENGTH = HEIGHT + 60 * 60` (a 1-minute strip) — actually pass the real `LEVEL_LENGTH` but drive `tickWaves(world, runner, camYSim)` with a module-level `let camYSim = LEVEL_LENGTH - 480;` decremented by `SCROLL_SPEED * dt` each update, and offset every spawned entity into screen space is NOT needed — the sandbox has no camera yet, so instead: spawn positions are world-space and the sandbox draws screen-space. To keep the sandbox honest without building the scene early, translate at spawn: after `tickWaves`, run `w.enemies.forEachAlive(e => { if (e.age === 0) e.pos.y -= camYSim; })` — a 3-line sandbox shim with a `// temporary until Task 16` comment (same for pickups).
- [ ] **Step 6: Verify** — full `npm test`, typecheck; sandbox shows escalating waves.
- [ ] **Step 7: Commit** — `git add -A && git commit -m "feat: seeded Level 1 wave script + runner"`

---

### Task 8: Input weapon keys + game/run.ts

**Files:**
- Modify: `src/engine/input.ts`, `src/engine/input.test.ts` (create if absent — there is currently no input test file)
- Create: `src/game/run.ts`, `src/game/run.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces — input: `Input` gains `weapon1: boolean; weapon2: boolean; weapon3: boolean; weapon4: boolean;` bound to `Digit1`–`Digit4` AND `Numpad1`–`Numpad4`; `InputSource` gains `consumeAnyKey(): boolean` — returns true once per keydown seen since the last call (set by `attach`'s keydown handler for ANY key and by `onKey(code, true)`, cleared by the call). Produces — run:

```ts
export type WeaponSlot = 1 | 2 | 3 | 4;
export interface RunState {
  score: number; lives: number; hp: number;
  salvage: number;
  selected: WeaponSlot;
  hasMiniguns: boolean; hasRockets: boolean;
  missileAmmo: number;              // 0–9
  rocketCooldown: number;           // seconds; 0 = ready
  invulnTicks: number;
}
export function createRun(): RunState;   // {score:0, lives:3, hp:3, salvage:0, selected:1, hasMiniguns:false, hasRockets:false, missileAmmo:0, rocketCooldown:0, invulnTicks:0}
export type DamageResult = 'shrugged' | 'hit' | 'death' | 'gameover';
export function damagePlayer(r: RunState): DamageResult;
export function addScore(r: RunState, points: number): void;
export function collectSalvage(r: RunState): void;      // salvage++, score += 25
export function armMissiles(r: RunState): void;         // missileAmmo = min(missileAmmo + 3, 9)
export function grantWeapon(r: RunState, w: 'miniguns' | 'rockets'): void;  // set flag, selected = 2 or 3
export function ownsSlot(r: RunState, slot: WeaponSlot): boolean;  // 1 always; 2 hasMiniguns; 3 hasRockets; 4 missileAmmo > 0
export function selectWeapon(r: RunState, slot: WeaponSlot): boolean;  // false + no change if !ownsSlot
export function cycleWeapon(r: RunState): void;         // next owned slot, wrapping 1→2→3→4→1
export function tickRun(r: RunState, dt: number): void; // invulnTicks = max(0, −1); rocketCooldown = max(0, −dt)
```

`damagePlayer`: `invulnTicks > 0` → `'shrugged'` (no change). Else `hp−1`; if `hp > 0` → `'hit'`, `invulnTicks = 90`. Else if `lives > 1` → `'death'`: `lives−1`, `hp = 3`, `invulnTicks = 180`. Else → `'gameover'`: `lives = 0`, `hp = 0`.

- [ ] **Step 1: Write the failing tests.**

`src/engine/input.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createInput } from './input';

describe('weapon keys', () => {
  it('Digit and Numpad rows both map to weapon slots', () => {
    const input = createInput();
    input.onKey('Digit1', true);
    input.onKey('Numpad3', true);
    expect(input.state.weapon1).toBe(true);
    expect(input.state.weapon3).toBe(true);
    input.onKey('Digit1', false);
    expect(input.state.weapon1).toBe(false);
  });
});

describe('consumeAnyKey', () => {
  it('reports a keydown once, then resets', () => {
    const input = createInput();
    expect(input.consumeAnyKey()).toBe(false);
    input.onKey('KeyQ', true); // unbound key still counts
    expect(input.consumeAnyKey()).toBe(true);
    expect(input.consumeAnyKey()).toBe(false);
  });

  it('keyups do not count', () => {
    const input = createInput();
    input.onKey('KeyZ', false);
    expect(input.consumeAnyKey()).toBe(false);
  });
});
```

`src/game/run.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  armMissiles, collectSalvage, createRun, cycleWeapon, damagePlayer,
  grantWeapon, ownsSlot, selectWeapon, tickRun,
} from './run';

describe('createRun', () => {
  it('starts with 3 lives, 3 hp, chain gun selected, nothing owned', () => {
    const r = createRun();
    expect(r).toEqual({
      score: 0, lives: 3, hp: 3, salvage: 0, selected: 1,
      hasMiniguns: false, hasRockets: false, missileAmmo: 0,
      rocketCooldown: 0, invulnTicks: 0,
    });
  });
});

describe('damagePlayer', () => {
  it('full matrix: hit, hit, death, ... gameover', () => {
    const r = createRun();
    expect(damagePlayer(r)).toBe('hit');
    expect(r.hp).toBe(2);
    expect(r.invulnTicks).toBe(90);
    r.invulnTicks = 0;
    expect(damagePlayer(r)).toBe('hit');
    r.invulnTicks = 0;
    expect(damagePlayer(r)).toBe('death');
    expect(r.lives).toBe(2);
    expect(r.hp).toBe(3);
    expect(r.invulnTicks).toBe(180);
    // burn through remaining lives
    for (let life = 0; life < 2; life++) {
      for (let i = 0; i < 2; i++) { r.invulnTicks = 0; expect(damagePlayer(r)).toBe('hit'); }
      r.invulnTicks = 0;
      expect(damagePlayer(r)).toBe(life === 0 ? 'death' : 'gameover');
    }
    expect(r.lives).toBe(0);
    expect(r.hp).toBe(0);
  });

  it('invulnerability shrugs', () => {
    const r = createRun();
    r.invulnTicks = 5;
    expect(damagePlayer(r)).toBe('shrugged');
    expect(r.hp).toBe(3);
  });
});

describe('weapon ownership and selection', () => {
  it('only slot 1 owned at start; selecting unowned is a no-op', () => {
    const r = createRun();
    expect(ownsSlot(r, 1)).toBe(true);
    expect(ownsSlot(r, 2)).toBe(false);
    expect(selectWeapon(r, 2)).toBe(false);
    expect(r.selected).toBe(1);
  });

  it('grantWeapon unlocks and auto-selects', () => {
    const r = createRun();
    grantWeapon(r, 'miniguns');
    expect(r.hasMiniguns).toBe(true);
    expect(r.selected).toBe(2);
    grantWeapon(r, 'rockets');
    expect(r.selected).toBe(3);
  });

  it('slot 4 is owned only while ammo remains', () => {
    const r = createRun();
    expect(ownsSlot(r, 4)).toBe(false);
    armMissiles(r);
    expect(r.missileAmmo).toBe(3);
    expect(ownsSlot(r, 4)).toBe(true);
    armMissiles(r); armMissiles(r); armMissiles(r);
    expect(r.missileAmmo).toBe(9); // capped
  });

  it('cycle skips unowned slots and wraps', () => {
    const r = createRun();
    grantWeapon(r, 'rockets');   // selected 3, owns 1 and 3
    cycleWeapon(r);
    expect(r.selected).toBe(1);  // 4 unowned, 1 next owned after wrap
    cycleWeapon(r);
    expect(r.selected).toBe(3);
  });
});

describe('scoring and timers', () => {
  it('salvage pays 25 score', () => {
    const r = createRun();
    collectSalvage(r);
    expect(r.salvage).toBe(1);
    expect(r.score).toBe(25);
  });

  it('tickRun decays invuln (per tick) and rocket cooldown (per second)', () => {
    const r = createRun();
    r.invulnTicks = 2;
    r.rocketCooldown = 1;
    tickRun(r, 1 / 60);
    expect(r.invulnTicks).toBe(1);
    expect(r.rocketCooldown).toBeCloseTo(1 - 1 / 60);
    tickRun(r, 1 / 60);
    tickRun(r, 1 / 60);
    expect(r.invulnTicks).toBe(0); // floored
  });
});
```

- [ ] **Step 2: Verify failure.**
- [ ] **Step 3: Implement.** Input: extend the `Input` interface and `BINDINGS` (`Digit1: 'weapon1', Numpad1: 'weapon1', …`), add a private `anyKey` flag set in `onKey(code, true)` (any code, bound or not), `consumeAnyKey()` reads-and-clears it; keydown side of `attach` already routes through `onKey`. Blur-clear loop already iterates `Object.keys(state)` so the new fields clear automatically. Run: plain object + the mutators exactly as specified.
- [ ] **Step 4: Verify** — both new test files PASS, full suite, typecheck.
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: weapon-select input keys + run state with damage/lives/arsenal rules"`

---

### Task 9: Sprite & SFX groundwork — nose barrel, layer constants, ROCKET, select/deny blips

**Files:**
- Modify: `src/game/sprites/player.ts`, `src/game/sprites/player.test.ts`, `src/game/sprites/shots.ts`, `src/game/sprites/shots.test.ts`, `src/game/sfx.ts`, `src/game/sfx.test.ts`, `src/game/main.ts` (layer indices via constants)

**Interfaces:**
- Consumes: existing `MUZZLE_FLASH`, `MISSILE`, `CHOPPER_BODY`.
- Produces:
  - `CHOPPER_BODY.anchors.nose = [15, 10]` (chain-gun barrel, on the fuselage centerline).
  - `export const LAYER = { BODY: 0, POD_L: 1, POD_R: 2, ROTOR: 3, FLASH_L: 4, FLASH_R: 5, FLASH_NOSE: 6, MISSILE_L: 7, MISSILE_R: 8 } as const;` in `player.ts`.
  - `createChopper()` returns 9 layers: existing 6, then MUZZLE_FLASH on `nose` (visible false), MISSILE on `pylonL` (visible false), MISSILE on `pylonR` (visible false).
  - `shots.ts`: `export const ROCKET: SpriteDef` — one 2x5 frame `['ll','mm','mm','mm','55']` (white tip, gunmetal body, orange exhaust), anchors `{ center: [1, 2] }`.
  - `sfx.ts`: `SFX` record type gains `'select' | 'deny'`: `select: { type: 'square', startFreq: 660, endFreq: 990, duration: 0.05, volume: 0.12 }`, `deny: { type: 'square', startFreq: 110, endFreq: 80, duration: 0.08, volume: 0.12 }`.

- [ ] **Step 1: Update/write the failing tests.** In `player.test.ts`: change the layer-count expectation to 9 and extend the stacking test:

```ts
it('createChopper stacks body, pods, rotor, flashes, nose flash, missiles', () => {
  const chopper = createChopper();
  expect(chopper.layers).toHaveLength(9);
  expect(chopper.layers[LAYER.ROTOR].def).toBe(CHOPPER_ROTOR);
  expect(chopper.layers[LAYER.FLASH_NOSE].def).toBe(MUZZLE_FLASH);
  expect(chopper.layers[LAYER.FLASH_NOSE].attach).toEqual({ to: 'nose', by: 'mount' });
  expect(chopper.layers[LAYER.FLASH_NOSE].visible).toBe(false);
  expect(chopper.layers[LAYER.MISSILE_L].def).toBe(MISSILE);
  expect(chopper.layers[LAYER.MISSILE_L].attach).toEqual({ to: 'pylonL', by: 'mount' });
  expect(chopper.layers[LAYER.MISSILE_L].visible).toBe(false);
  expect(chopper.layers[LAYER.MISSILE_R].attach).toEqual({ to: 'pylonR', by: 'mount' });
});

it('nose anchor sits on the fuselage centerline', () => {
  expect(CHOPPER_BODY.anchors.nose).toEqual([15, 10]);
});
```

(Import `LAYER` and keep the existing offset-bounds test — it must still pass with 9 layers. NOTE: the MISSILE sprite hangs from `pylonL` at [2,16] by mount [1,0]; its 3x5 frame spans x 1..3, y 16..20 — inside 32x32, fine. `pylonR` [28,16] → x 27..29 — fine.)

In `shots.test.ts` add:

```ts
it('ROCKET is a 2x5 single frame with a center anchor', () => {
  expect(ROCKET.frames).toHaveLength(1);
  expect(ROCKET.frames[0].width).toBe(2);
  expect(ROCKET.frames[0].height).toBe(5);
  expect(ROCKET.anchors.center).toEqual([1, 2]);
});
```

In `sfx.test.ts` add:

```ts
it('select and deny presets exist with sane ranges', () => {
  for (const name of ['select', 'deny'] as const) {
    const p = SFX[name];
    expect(p.duration).toBeGreaterThan(0);
    expect(p.volume).toBeGreaterThan(0);
    expect(p.volume).toBeLessThanOrEqual(1);
  }
});
```

- [ ] **Step 2: Verify failure.**
- [ ] **Step 3: Implement** exactly per Produces. In `main.ts`, replace the hardcoded `chopperSprite.layers[3]` / `[4]` / `[5]` with `LAYER.ROTOR` / `LAYER.FLASH_L` / `LAYER.FLASH_R` (behavior unchanged).
- [ ] **Step 4: Verify** — full suite + typecheck.
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: nose barrel + missile layers + LAYER constants + rocket sprite + UI blips"`

---

### Task 10: game/weapons.ts — the four-slot arsenal

**Files:**
- Create: `src/game/weapons.ts`, `src/game/weapons.test.ts`
- Modify: `src/game/entities.ts` (export `spawnShell`; delete `FireControl`/`createFireControl`/`tickFire`/`FIRE_INTERVAL`/`FLASH_TICKS`), `src/game/entities.test.ts` (drop the moved tests), `src/game/main.ts` (fire through the new system)

**Interfaces:**
- Consumes: `World`, `Bullet`, `Muzzle`, `spawnShell`, `spawnSmoke` from entities; `RunState`, `ownsSlot` from run.
- Produces:

```ts
export const CHAIN_INTERVAL = 0.5;      // 120 rpm
export const MINIGUN_INTERVAL = 0.25;   // 240 rpm per barrel
export const MISSILE_INTERVAL = 0.5;
export const SALVO_SIZE = 10;
export const SALVO_TICK_GAP = 3;        // one rocket per 3 ticks
export const ROCKET_COOLDOWN = 20;      // seconds
export const ROCKET_LAUNCH_SPEED = 120; // px/s
export const ROCKET_ACCEL = 900;        // px/s²
export const ROCKET_SPREAD = (4 * Math.PI) / 180;
export const CHAIN_DMG = 0.75;
export const MINIGUN_DMG = 1;
export const ROCKET_DMG = 2;
export const MISSILE_DMG = 3;
export const MISSILE_SPEED = 300;
export const FLASH_TICKS = 2;           // moves here from entities

export interface Mounts { nose: Muzzle; podL: Muzzle; podR: Muzzle; pylonL: Muzzle; pylonR: Muzzle; }
export interface WeaponState {
  cooldown: number;      // between-shot timer for the selected weapon
  flashTicks: number; flashFrame: number; shotCount: number;
  salvoLeft: number;     // rockets remaining in the running salvo (0 = idle)
  salvoTick: number;     // tick counter inside the salvo
  pylonSide: -1 | 1;     // alternates rocket/missile launch pylon; also chain-gun shell side
}
export function createWeaponState(): WeaponState;
export type FiredKind = 'chain' | 'minigun' | 'rocket' | 'missile' | null;
export function tickWeapons(
  w: World, run: RunState, ws: WeaponState, mounts: Mounts, held: boolean, dt: number,
): FiredKind;
```

Behavior (in order, every tick):

1. `ws.cooldown = max(0, ws.cooldown − dt)`; `if (ws.flashTicks > 0) ws.flashTicks−−`.
2. **Running salvo** (independent of `held` and of `run.selected` — a salvo is committed): if `ws.salvoLeft > 0`: `ws.salvoTick++`; if `(ws.salvoTick − 1) % SALVO_TICK_GAP === 0`: launch one rocket from the pylon on `ws.pylonSide` (then flip the side), `ws.salvoLeft−−`; when it reaches 0, `run.rocketCooldown = ROCKET_COOLDOWN`. A launch this tick returns `'rocket'` (skip step 3).
3. **Held fire on the selected slot** (requires `held`, `ws.cooldown === 0`, `ownsSlot(run, run.selected)`):
   - slot 1: `ws.cooldown = CHAIN_INTERVAL`; one bullet at `mounts.nose` — `dmg CHAIN_DMG`, vel (0, −420), radius 2; `ws.flashTicks = FLASH_TICKS`, `ws.flashFrame ^= 1`, `ws.shotCount++`; `spawnShell(w, {x: mounts.nose.x, y: mounts.nose.y, dir: ws.pylonSide})`, flip `pylonSide`; every 3rd shot `spawnSmoke(w, mounts.nose.x, mounts.nose.y + 4, 0.8)`. Return `'chain'`.
   - slot 2: `ws.cooldown = MINIGUN_INTERVAL`; for each of `mounts.podL`, `mounts.podR`: bullet `dmg MINIGUN_DMG` vel (0, −420) radius 2 + `spawnShell` + (every 3rd shot) smoke — identical flavor to pass-2 `tickFire`; flash fields as above. Return `'minigun'`.
   - slot 3: only starts a salvo — requires `run.rocketCooldown === 0` and `ws.salvoLeft === 0`: `ws.salvoLeft = SALVO_SIZE`, `ws.salvoTick = 0`. (The first rocket flies NEXT tick via step 2.) Return null this tick.
   - slot 4: requires `run.missileAmmo > 0`; `ws.cooldown = MISSILE_INTERVAL`, `run.missileAmmo−−`; one bullet from the `ws.pylonSide` pylon (flip after): `dmg MISSILE_DMG`, vel (0, −MISSILE_SPEED), radius 4, `splash = true`, `homing = true`, `trail = true`. Return `'missile'`.

Rocket launch (step 2 helper): bullet from the given pylon mount — `angle = −π/2 + (w.rng() * 2 − 1) * ROCKET_SPREAD`; `vel = (cos(angle), sin(angle)) * ROCKET_LAUNCH_SPEED`; `dmg ROCKET_DMG`, radius 3, `accel = ROCKET_ACCEL`, `trail = true`.

- [ ] **Step 1: Write the failing tests** — `src/game/weapons.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../engine/rng';
import { createWorld } from './entities';
import { createRun, grantWeapon, armMissiles, selectWeapon } from './run';
import {
  CHAIN_DMG, createWeaponState, MINIGUN_DMG, MISSILE_DMG, ROCKET_COOLDOWN,
  ROCKET_DMG, SALVO_SIZE, tickWeapons, type Mounts,
} from './weapons';

const DT = 1 / 60;

function mounts(): Mounts {
  return {
    nose: { x: 320, y: 390, dir: 1 },
    podL: { x: 310, y: 395, dir: -1 },
    podR: { x: 330, y: 395, dir: 1 },
    pylonL: { x: 306, y: 396, dir: -1 },
    pylonR: { x: 334, y: 396, dir: 1 },
  };
}

function run60(w: ReturnType<typeof createWorld>, r: ReturnType<typeof createRun>, held: boolean, ticks: number) {
  const ws = createWeaponState();
  const m = mounts();
  const fired: string[] = [];
  for (let i = 0; i < ticks; i++) {
    const f = tickWeapons(w, r, ws, m, held, DT);
    if (f) fired.push(f);
  }
  return { ws, fired };
}

describe('chain gun (slot 1)', () => {
  it('fires 2 shots per second at dmg 0.75 from the nose', () => {
    const w = createWorld(mulberry32(1));
    const r = createRun();
    const { fired } = run60(w, r, true, 60);
    expect(fired.filter((f) => f === 'chain')).toHaveLength(2);
    const b = w.bullets.items.find((x) => x.alive)!;
    expect(b.dmg).toBe(CHAIN_DMG);
    expect(b.pos.x).toBe(320);
  });
});

describe('miniguns (slot 2)', () => {
  it('fires 4 shots/sec from both pods at dmg 1', () => {
    const w = createWorld(mulberry32(1));
    const r = createRun();
    grantWeapon(r, 'miniguns');
    const { fired } = run60(w, r, true, 60);
    expect(fired.filter((f) => f === 'minigun')).toHaveLength(4);
    // 4 volleys x 2 pods = 8 bullets spawned
    const spawned = w.bullets.items.filter((b) => b.alive || b.age > 0);
    expect(spawned.length).toBeGreaterThanOrEqual(8);
    expect(spawned[0].dmg).toBe(MINIGUN_DMG);
  });

  it('does not fire when unowned even if selected state is forced', () => {
    const w = createWorld(mulberry32(1));
    const r = createRun();
    r.selected = 2; // bypassing selectWeapon on purpose
    const { fired } = run60(w, r, true, 60);
    expect(fired).toHaveLength(0);
  });
});

describe('rockets (slot 3)', () => {
  it('one press launches exactly 10 rockets, one per 3 ticks, then sets the cooldown', () => {
    const w = createWorld(mulberry32(1));
    const r = createRun();
    grantWeapon(r, 'rockets');
    const { fired } = run60(w, r, true, 60);
    expect(fired.filter((f) => f === 'rocket')).toHaveLength(SALVO_SIZE);
    expect(r.rocketCooldown).toBe(ROCKET_COOLDOWN);
    const rockets = w.bullets.items.filter((b) => b.dmg === ROCKET_DMG);
    expect(rockets).toHaveLength(SALVO_SIZE);
    for (const rk of rockets) {
      expect(rk.accel).toBe(900);
      expect(rk.trail).toBe(true);
      // spread: mostly upward, slight x component allowed
      expect(rk.vel.y).toBeLessThan(-110);
      expect(Math.abs(rk.vel.x)).toBeLessThan(15);
    }
  });

  it('no second salvo while cooling down; salvo finishes after release', () => {
    const w = createWorld(mulberry32(1));
    const r = createRun();
    grantWeapon(r, 'rockets');
    const ws = createWeaponState();
    const m = mounts();
    tickWeapons(w, r, ws, m, true, DT);   // start salvo
    let rocketTicks = 0;
    for (let i = 0; i < 59; i++) {
      if (tickWeapons(w, r, ws, m, false, DT) === 'rocket') rocketTicks++;
    }
    expect(rocketTicks + 1 >= SALVO_SIZE || rocketTicks >= SALVO_SIZE).toBe(true); // salvo completed unheld
    expect(r.rocketCooldown).toBeGreaterThan(18);
    const before = w.bullets.items.filter((b) => b.dmg === ROCKET_DMG).length;
    for (let i = 0; i < 30; i++) tickWeapons(w, r, ws, m, true, DT);
    expect(w.bullets.items.filter((b) => b.dmg === ROCKET_DMG).length).toBe(before);
  });
});

describe('missiles (slot 4)', () => {
  it('consumes ammo, fires homing splash bullets, stops at zero', () => {
    const w = createWorld(mulberry32(1));
    const r = createRun();
    armMissiles(r);           // 3 ammo
    expect(selectWeapon(r, 4)).toBe(true);
    const { fired } = run60(w, r, true, 120); // 2 seconds at 0.5s interval → 3 shots then dry
    expect(fired.filter((f) => f === 'missile')).toHaveLength(3);
    expect(r.missileAmmo).toBe(0);
    const missiles = w.bullets.items.filter((b) => b.dmg === MISSILE_DMG);
    expect(missiles).toHaveLength(3);
    for (const ms of missiles) {
      expect(ms.homing).toBe(true);
      expect(ms.splash).toBe(true);
      expect(ms.trail).toBe(true);
    }
  });
});

describe('alternating pylons', () => {
  it('rockets alternate launch x positions', () => {
    const w = createWorld(mulberry32(1));
    const r = createRun();
    grantWeapon(r, 'rockets');
    run60(w, r, true, 60);
    const xs = w.bullets.items.filter((b) => b.dmg === ROCKET_DMG).map((b) => b.pos.x);
    const left = xs.filter((x) => x < 320).length;
    const right = xs.filter((x) => x > 320).length;
    expect(left).toBe(5);
    expect(right).toBe(5);
  });
});
```

- [ ] **Step 2: Verify failure.**
- [ ] **Step 3: Implement** `weapons.ts` per the behavior spec. In `entities.ts`: export `spawnShell`, delete the `FireControl` block (`FireControl`, `createFireControl`, `tickFire`, `FIRE_INTERVAL`, `FLASH_TICKS`) and remove its tests from `entities.test.ts` (including the projectile-flag-reset test from Task 4 — port it to `weapons.test.ts` semantics: the chain-gun bullet must reset all flags; add that assertion to the chain-gun describe). Keep `Muzzle` in entities (weapons imports it).
- [ ] **Step 4: Rewire main.ts.** Replace `createFireControl`/`tickFire` usage: module-level `const run = createRun(); grantWeapon(run, 'miniguns');` (sandbox starts with miniguns so it feels like pass 2), `const ws = createWeaponState();`, a reused module-level `MOUNTS: Mounts` object updated from the chopper position each tick using the anchors (`nose`, `podL`, `podR`, `pylonL`, `pylonR` — same `−16 + anchor * scale` pattern as the existing `muzzles()`), fire via `const f = tickWeapons(world, run, ws, MOUNTS, input.state.fire, dt); if (f) audio.blip(SFX.shoot);`. Flash layers: `layers[LAYER.FLASH_L].visible = layers[LAYER.FLASH_R].visible = ws.flashTicks > 0 && run.selected === 2; layers[LAYER.FLASH_NOSE].visible = ws.flashTicks > 0 && run.selected === 1;` frames from `ws.flashFrame`. Missile layers stay hidden in the sandbox.
- [ ] **Step 5: Verify** — full `npm test`, typecheck, sandbox fires miniguns.
- [ ] **Step 6: Commit** — `git add -A && git commit -m "feat: four-slot weapon system — chain gun, miniguns, rocket salvos, homing missiles"`

---

### Task 11: Pickup sprites (game/sprites/pickups.ts)

**Files:**
- Create: `src/game/sprites/pickups.ts`, `src/game/sprites/pickups.test.ts`

**Interfaces:**
- Consumes: `parseGrid`, `PixelGrid`, `SpriteDef` from engine sprite; `PALETTE`.
- Produces:

```ts
export function rotateGrid(rows: string[]): string[];   // 90° clockwise, pure
export const MINIGUN_PICKUP: SpriteDef;  // 4 frames, 32x32, anchors { center: [16, 16] }
export const ROCKET_PICKUP: SpriteDef;   // 4 frames, 32x32, anchors { center: [16, 16] }
export const CRATE: SpriteDef;           // 1 frame, 12x10, anchors { center: [6, 5] }
export const SALVAGE: SpriteDef;         // 2 frames, 8x8, anchors { center: [4, 4] }
export const PICKUP_FRAME_TICKS = 8;     // weapon pickups advance a frame every 8 ticks
export const SALVAGE_FRAME_TICKS = 15;
```

Weapon-pickup construction: a 12x12 glyph is rotated 90° per frame (`rotateGrid` applied 0–3 times) and composited into a 32x32 grid at offset (10, 10), surrounded by a circular glow ring of radius 14 centered at (16, 16) — ring pixels are cells where `Math.round(Math.hypot(x − 16, y − 16)) === 14`. Ring char alternates by frame: frames 0, 2 → `8` (yellow), frames 1, 3 → `l` (white) — the pulsing glow. Build all of it in code (no hand-counted 32-char strings).

- [ ] **Step 1: Write the failing test** — `src/game/sprites/pickups.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  CRATE, MINIGUN_PICKUP, ROCKET_PICKUP, rotateGrid, SALVAGE,
} from './pickups';

describe('rotateGrid', () => {
  it('rotates 90° clockwise', () => {
    expect(rotateGrid(['ab', 'cd'])).toEqual(['ca', 'db']);
    expect(rotateGrid(['abc', 'def'])).toEqual(['da', 'eb', 'fc']);
  });

  it('four rotations return the original', () => {
    const g = ['ab.', '.cd', 'e..'];
    let r = g;
    for (let i = 0; i < 4; i++) r = rotateGrid(r);
    expect(r).toEqual(g);
  });
});

describe('weapon pickups', () => {
  for (const [name, def] of [['minigun', MINIGUN_PICKUP], ['rocket', ROCKET_PICKUP]] as const) {
    it(`${name} pickup has 4 rotating 32x32 frames with a centered anchor`, () => {
      expect(def.frames).toHaveLength(4);
      for (const f of def.frames) {
        expect(f.width).toBe(32);
        expect(f.height).toBe(32);
      }
      expect(def.anchors.center).toEqual([16, 16]);
    });

    it(`${name} frames differ (rotation + glow pulse are visible)`, () => {
      const [a, b] = def.frames;
      expect(Buffer.from(a.rgba).equals(Buffer.from(b.rgba))).toBe(false);
    });
  }
});

describe('crate and salvage', () => {
  it('crate is 12x10 with center anchor', () => {
    expect(CRATE.frames).toHaveLength(1);
    expect(CRATE.frames[0].width).toBe(12);
    expect(CRATE.frames[0].height).toBe(10);
    expect(CRATE.anchors.center).toEqual([6, 5]);
  });

  it('salvage spins two 8x8 frames', () => {
    expect(SALVAGE.frames).toHaveLength(2);
    for (const f of SALVAGE.frames) {
      expect(f.width).toBe(8);
      expect(f.height).toBe(8);
    }
  });
});
```

- [ ] **Step 2: Verify failure.**
- [ ] **Step 3: Implement** — `src/game/sprites/pickups.ts`:

```ts
// Pickups. Weapon pickups are chopper-sized (32x32) rotating badges with a
// pulsing glow ring — built programmatically from a 12x12 glyph rotated 90°
// per frame inside a circular ring that alternates yellow/white.
import { parseGrid, type PixelGrid, type SpriteDef } from '../../engine/sprite';
import { PALETTE } from '../palette';

export const PICKUP_FRAME_TICKS = 8;
export const SALVAGE_FRAME_TICKS = 15;

export function rotateGrid(rows: string[]): string[] {
  const h = rows.length;
  const w = rows[0]?.length ?? 0;
  const out: string[] = [];
  for (let x = 0; x < w; x++) {
    let row = '';
    for (let y = h - 1; y >= 0; y--) row += rows[y][x];
    out.push(row);
  }
  return out;
}

// Crossed gatling barrels, diagonal so rotation reads.
const MINIGUN_GLYPH = [
  'mm..........',
  'mmm.......1.',
  '.mmm.....11.',
  '..mmm...11..',
  '...mmm.11...',
  '....mm11....',
  '....11mm....',
  '...11.mmm...',
  '..11...mmm..',
  '.11.....mmm.',
  '.1.......mm.',
  '..........mm',
];

// Rocket pair angled up-right: white tips, gray bodies, orange flames.
const ROCKET_GLYPH = [
  '.......ll...',
  '......lml...',
  '.....mmm....',
  '....mmm.ll..',
  '...mmm.lml..',
  '..5mm.mmm...',
  '.55..mmm....',
  '.5..mmm.....',
  '...5mm......',
  '..55........',
  '..5.........',
  '............',
];

function weaponFrames(glyph: string[]): PixelGrid[] {
  const frames: PixelGrid[] = [];
  let g = glyph;
  for (let f = 0; f < 4; f++) {
    const ring = f % 2 === 0 ? '8' : 'l';
    const rows = Array.from({ length: 32 }, () => new Array<string>(32).fill('.'));
    for (let y = 0; y < 32; y++) {
      for (let x = 0; x < 32; x++) {
        if (Math.round(Math.hypot(x - 16, y - 16)) === 14) rows[y][x] = ring;
      }
    }
    g.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        if (row[x] !== '.') rows[y + 10][x + 10] = row[x];
      }
    });
    frames.push(parseGrid(rows.map((r) => r.join('')), PALETTE));
    g = rotateGrid(g);
  }
  return frames;
}

export const MINIGUN_PICKUP: SpriteDef = {
  frames: weaponFrames(MINIGUN_GLYPH),
  anchors: { center: [16, 16] },
};

export const ROCKET_PICKUP: SpriteDef = {
  frames: weaponFrames(ROCKET_GLYPH),
  anchors: { center: [16, 16] },
};

// Brass supply crate with dark straps and a cyan missile glyph.
export const CRATE: SpriteDef = {
  frames: [parseGrid([
    '666666666666',
    '611666666116',
    '616666666616',
    '666663366666',
    '66666j366666',
    '66666j366666',
    '666663366666',
    '616666666616',
    '611666666116',
    '666666666666',
  ], PALETTE)],
  anchors: { center: [6, 5] },
};

// Spinning salvage canister: gray drum with a brass band, two frames.
export const SALVAGE: SpriteDef = {
  frames: [
    parseGrid([
      '..mmmm..',
      '.m6666m.',
      'm666666m',
      'm611116m',
      'm611116m',
      'm666666m',
      '.m6666m.',
      '..mmmm..',
    ], PALETTE),
    parseGrid([
      '..pppp..',
      '.p6116p.',
      'p661166p',
      'p661166p',
      'p661166p',
      'p661166p',
      '.p6116p.',
      '..pppp..',
    ], PALETTE),
  ],
  anchors: { center: [4, 4] },
};
```

Every hand-written row must match its declared width (12 for glyphs/crate, 8 for salvage) — `parseGrid` throws at import if not; fix padding before moving on. `3` in the crate is dark-brown strap shadow — acceptable; keep chars within the palette.

- [ ] **Step 4: Verify** — test PASS, full suite, typecheck.
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: rotating glow weapon pickups, crate and salvage sprites"`

---

### Task 12: game/hud.ts

**Files:**
- Create: `src/game/hud.ts`, `src/game/hud.test.ts`

**Interfaces:**
- Consumes: `RunState`, `ownsSlot`, `WeaponSlot` from run; `PALETTE`; `parseGrid`, `rasterize` from engine sprite; `WIDTH` from renderer; `ROCKET_COOLDOWN` from weapons.
- Produces:

```ts
export function formatScore(n: number): string;      // 6-digit zero-padded, clamps at 999999
export interface SlotView { owned: boolean; selected: boolean; label: string; } // label: '1'..'4'
export function slotView(r: RunState, slot: WeaponSlot): SlotView;
export const LIVES_ICON: SpriteDef;                  // 8x8 mini chopper glyph, 1 frame
export interface Hud { draw(ctx: CanvasRenderingContext2D, run: RunState): void; }
export function createHud(): Hud;                    // rasterizes LIVES_ICON once (browser only)
```

Layout (all inside `draw`, plain constants): score text at (4, 12); HP pips: three 6x6 squares at y 18, x 4/12/20 — filled `PALETTE[9]` per remaining hp, outline `PALETTE[25]` when empty (draw a filled dark square then the green one if hp covers it). Lives icons centered: icon i at `x = WIDTH/2 − 18 + i*14`, y 4. Salvage text right-aligned: `SALVAGE x${n}` with `ctx.textAlign = 'right'` at (WIDTH − 4, 12) — restore `textAlign = 'left'` after. Weapon panel: four 22x22 boxes at y = 480 − 28, x = 4 + slot*26 (slot 0-indexed): dark fill `PALETTE[1]`, border `PALETTE[8]` if selected else `PALETTE[23]` if owned else `PALETTE[25]`; label char centered; unowned boxes get label drawn in `PALETTE[25]`. Slot 3 extra: cooldown bar 22x3 under the box — width `22 * (1 − run.rocketCooldown / ROCKET_COOLDOWN)` in `PALETTE[5]`. Slot 4 extra: ammo count `x${missileAmmo}` in 8px text right of the box. FPS rendering stays in the scene, not here.

`LIVES_ICON` (8x8, `c` olive body, `o` rotor line):

```ts
export const LIVES_ICON: SpriteDef = {
  frames: [parseGrid([
    'oooooooo',
    '...cc...',
    '..cccc..',
    '..cccc..',
    '...cc...',
    '...cc...',
    '..1cc1..',
    '...cc...',
  ], PALETTE)],
  anchors: { center: [4, 4] },
};
```

- [ ] **Step 1: Write the failing test** — `src/game/hud.test.ts` (pure parts only — `draw` is verified in the dev server):

```ts
import { describe, expect, it } from 'vitest';
import { createRun, grantWeapon, armMissiles } from './run';
import { formatScore, LIVES_ICON, slotView } from './hud';

describe('formatScore', () => {
  it('zero-pads to six digits and clamps', () => {
    expect(formatScore(0)).toBe('000000');
    expect(formatScore(1250)).toBe('001250');
    expect(formatScore(2_000_000)).toBe('999999');
  });
});

describe('slotView', () => {
  it('reflects ownership and selection', () => {
    const r = createRun();
    expect(slotView(r, 1)).toEqual({ owned: true, selected: true, label: '1' });
    expect(slotView(r, 2).owned).toBe(false);
    grantWeapon(r, 'miniguns');
    expect(slotView(r, 2)).toEqual({ owned: true, selected: true, label: '2' });
    expect(slotView(r, 1).selected).toBe(false);
    armMissiles(r);
    expect(slotView(r, 4).owned).toBe(true);
  });
});

describe('LIVES_ICON', () => {
  it('is a single 8x8 frame', () => {
    expect(LIVES_ICON.frames).toHaveLength(1);
    expect(LIVES_ICON.frames[0].width).toBe(8);
    expect(LIVES_ICON.frames[0].height).toBe(8);
  });
});
```

- [ ] **Step 2: Verify failure.**
- [ ] **Step 3: Implement** per the layout spec. `draw` allocates nothing per frame (strings from `formatScore` and labels are unavoidable JS string churn — acceptable; no objects/arrays).
- [ ] **Step 4: Verify** — test PASS, suite, typecheck.
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: HUD — score, hp pips, lives, salvage, weapon panel"`

---

### Task 13: Audio — noise(), context(), and the sequencer

**Files:**
- Modify: `src/engine/audio.ts`, `src/engine/audio.test.ts`
- Create: `src/engine/sequencer.ts`, `src/engine/sequencer.test.ts`

**Interfaces:**
- Consumes: existing `AudioSystem`.
- Produces — audio.ts additions:

```ts
export interface AudioSystem {
  unlock(): void;
  blip(p: BlipParams): void;
  noise(durationSec: number, volume: number, bandFreq?: number, whenSec?: number): void; // white-noise burst through a bandpass (default 800 Hz) at AudioContext time whenSec (default: now); no-op until unlocked
  context(): AudioContext | null;   // null until unlocked; the sequencer schedules against this
}
```

`noise`: lazily build one shared 1-second white-noise `AudioBuffer` (values from `Math.random()` — audio output is exempt from determinism) on first use after unlock; each call creates a `AudioBufferSourceNode` → `BiquadFilterNode` (type 'bandpass', frequency `bandFreq`, Q 1) → gain with the same attack/decay envelope as `blip` → destination; stop at `durationSec + 0.02`, disconnect onended.

Produces — sequencer.ts:

```ts
export type Note = [freq: number, beats: number];   // freq 0 = rest
export interface Song {
  bpm: number;
  channels: [Note[], Note[], Note[], Note[]];  // square lead 1, square lead 2, triangle bass, noise drums (freq = bandpass Hz)
  loop: boolean;
}
export interface ScheduledNote { channel: number; freq: number; atSec: number; durSec: number; }
export function songBeats(song: Song): number;       // max total beats across channels
export function scheduleWindow(song: Song, fromSec: number, toSec: number): ScheduledNote[];
export interface Sequencer { play(song: Song): void; stop(): void; playing(): boolean; }
export function createSequencer(audio: AudioSystem): Sequencer;
```

`scheduleWindow` (pure, the tested core): note start times per channel are cumulative beat sums × `60/bpm`. Returns every note (freq > 0) whose start time falls in `[fromSec, toSec)`. Looping songs repeat every `songBeats(song) * 60/bpm` seconds — include starts from every loop iteration k ≥ 0 that lands in the window (`atSec` is absolute, i.e. includes `k * loopSec`). Non-looping songs only emit iteration 0. `fromSec` may be mid-song; results sorted by `atSec`.

`createSequencer`: `play(song)` — if no context yet (still locked), remember the song and start when `playing()` is next polled after unlock — simpler contract: `play` captures `audio.context()`; if null, it stores the song and a 25 ms `setInterval` keeps checking; once a context exists, `songStart = ctx.currentTime + 0.05`, `scheduledUntil = songStart`, and each interval tick schedules `scheduleWindow(song, scheduledUntil − songStart, ctx.currentTime + 0.12 − songStart)` then advances `scheduledUntil = ctx.currentTime + 0.12`. Voices: channels 0/1 oscillator 'square', 2 'triangle' — frequency set at `atSec`, gain envelope attack 5 ms to channel volume, hold to 80% of `durSec`, exponential decay to 0.001 at `durSec`, stop + disconnect; channel 3 → `audio.noise(min(durSec, 0.12), volume, freq)` — but `noise` plays "now", not at `atSec`: give `noise` an optional `whenSec?: number` (AudioContext absolute time) parameter to start the buffer at the scheduled moment. Channel volumes: `[0.12, 0.1, 0.14, 0.1]`. `stop()` clears the interval (already-scheduled notes ring out — acceptable). The sequencer never imports from `game/`.

- [ ] **Step 1: Write the failing tests** — `src/engine/sequencer.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { scheduleWindow, songBeats, type Song } from './sequencer';

// 120 bpm → 0.5 s per beat. One bar of lead, rest-heavy drums.
const song: Song = {
  bpm: 120,
  channels: [
    [[440, 1], [0, 1], [660, 2]],   // starts at 0s, (rest), 1.0s; total 4 beats
    [], [],
    [[150, 0.5], [0, 3.5]],          // drum hit at 0s only
  ],
  loop: true,
};

describe('songBeats', () => {
  it('is the max channel length in beats', () => {
    expect(songBeats(song)).toBe(4);
  });
});

describe('scheduleWindow', () => {
  it('returns notes starting inside the window, skipping rests', () => {
    const notes = scheduleWindow(song, 0, 0.6);
    expect(notes).toHaveLength(2); // 440 at 0s, drum at 0s — rest excluded
    const lead = notes.find((n) => n.channel === 0)!;
    expect(lead.freq).toBe(440);
    expect(lead.atSec).toBe(0);
    expect(lead.durSec).toBeCloseTo(0.5);
  });

  it('half-open window: a note exactly at toSec is excluded', () => {
    expect(scheduleWindow(song, 0.5, 1.0)).toHaveLength(0);   // 660 starts at exactly 1.0
    expect(scheduleWindow(song, 1.0, 1.1)).toHaveLength(1);
  });

  it('looping songs wrap: the second iteration lands 2s later', () => {
    const notes = scheduleWindow(song, 1.9, 2.2);
    expect(notes).toHaveLength(2); // 440 and drum at 2.0
    expect(notes[0].atSec).toBeCloseTo(2.0);
  });

  it('non-looping songs end', () => {
    const once: Song = { ...song, loop: false };
    expect(scheduleWindow(once, 1.9, 2.2)).toHaveLength(0);
  });

  it('results are sorted by start time', () => {
    const notes = scheduleWindow(song, 0, 4);
    for (let i = 1; i < notes.length; i++) {
      expect(notes[i].atSec).toBeGreaterThanOrEqual(notes[i - 1].atSec);
    }
  });
});
```

Extend `src/engine/audio.test.ts` (envelope math only — Web Audio is browser-verified): no new pure surface beyond what exists; just assert the interface shape compiles by importing `AudioSystem` where needed. Skip DOM-dependent tests.

- [ ] **Step 2: Verify failure.**
- [ ] **Step 3: Implement** `sequencer.ts` (pure part first, then the thin scheduling layer) and the `audio.ts` additions (`context()` returns the internal ctx; `noise(durationSec, volume, bandFreq = 800, whenSec?)`).
- [ ] **Step 4: Verify** — tests PASS, suite, typecheck.
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: noise voice + lookahead sequencer with pure scheduling core"`

---

### Task 14: Songs (game/songs/title.ts, game/songs/level1.ts)

**Files:**
- Create: `src/game/songs/title.ts`, `src/game/songs/level1.ts`, `src/game/songs/songs.test.ts`

**Interfaces:**
- Consumes: `Song`, `Note`, `songBeats` from `src/engine/sequencer.ts`.
- Produces: `export const TITLE_SONG: Song` (96 bpm, loop, 32 beats — 8 bars of 4), `export const LEVEL1_SONG: Song` (128 bpm, loop, 64 beats — 16 bars of 4).

Composition is ART — the arrays below are the starting point; the melody may be tuned by ear later without breaking tests. What the tests pin: bpm, loop flags, 4 channels each, and **every channel of a song having equal total beats** (so the loop never drifts out of phase).

- [ ] **Step 1: Write the failing test** — `src/game/songs/songs.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { songBeats } from '../../engine/sequencer';
import { LEVEL1_SONG } from './level1';
import { TITLE_SONG } from './title';

function channelBeats(notes: Array<[number, number]>): number {
  return notes.reduce((sum, [, beats]) => sum + beats, 0);
}

describe.each([
  ['TITLE_SONG', TITLE_SONG, 96, 32],
  ['LEVEL1_SONG', LEVEL1_SONG, 128, 64],
] as const)('%s', (_name, song, bpm, beats) => {
  it('has the right tempo and loops', () => {
    expect(song.bpm).toBe(bpm);
    expect(song.loop).toBe(true);
  });

  it('all four channels stay in phase across the loop', () => {
    expect(song.channels).toHaveLength(4);
    for (const ch of song.channels) {
      expect(channelBeats(ch)).toBe(beats);
    }
    expect(songBeats(song)).toBe(beats);
  });

  it('every frequency is 0 (rest) or in the audible band', () => {
    for (const ch of song.channels) {
      for (const [freq] of ch) {
        expect(freq === 0 || (freq >= 40 && freq <= 8000)).toBe(true);
      }
    }
  });
});
```

- [ ] **Step 2: Verify failure.**
- [ ] **Step 3: Implement.** `src/game/songs/title.ts` — minor-key late-80s action sting, A minor:

```ts
// Title theme: confident minor-key action sting. 8 bars at 96 bpm.
// Tuning by ear is expected — keep every channel summing to 32 beats.
import type { Note, Song } from '../../engine/sequencer';

const A2 = 110, E2 = 82.41, F2 = 87.31, G2 = 98;
const A3 = 220, E3 = 164.81, F3 = 174.61, G3 = 196;
const A4 = 440, B4 = 493.88, C5 = 523.25, D4 = 293.66, E4 = 329.63,
  F4 = 349.23, G4 = 392, C4 = 261.63;
const KICK = 150, SNARE = 800, HAT = 6000;

const lead1: Note[] = [
  [A4, 1], [C5, 0.5], [B4, 0.5], [A4, 1], [E4, 1],
  [G4, 1], [A4, 1], [E4, 2],
  [F4, 1], [A4, 0.5], [G4, 0.5], [F4, 1], [D4, 1],
  [E4, 1.5], [C4, 0.5], [E4, 2],
  [A4, 1], [C5, 0.5], [B4, 0.5], [A4, 1], [E4, 1],
  [G4, 1], [A4, 1], [E4, 2],
  [F4, 1], [G4, 1], [A4, 1], [B4, 1],
  [C5, 2], [0, 2],
];

const stab = (f: number): Note[] =>
  [[0, 0.5], [f, 0.5], [0, 0.5], [f, 0.5], [0, 0.5], [f, 0.5], [0, 1]];
const lead2: Note[] = [
  ...stab(A3), ...stab(A3), ...stab(F3), ...stab(E3),
  ...stab(A3), ...stab(A3), ...stab(F3), ...stab(E3),
];

const root = (f: number): Note[] => [[f, 1], [0, 0.5], [f, 0.5], [f, 1], [0, 1]];
const bass: Note[] = [
  ...root(A2), ...root(A2), ...root(F2), ...root(E2),
  ...root(A2), ...root(A2), ...root(F2), ...root(G2),
];

const beat: Note[] = [
  [KICK, 0.5], [HAT, 0.5], [SNARE, 0.5], [HAT, 0.5],
  [KICK, 0.5], [HAT, 0.5], [SNARE, 0.5], [HAT, 0.5],
];
const drums: Note[] = Array.from({ length: 8 }, () => beat).flat();

export const TITLE_SONG: Song = {
  bpm: 96,
  channels: [lead1, lead2, bass, drums],
  loop: true,
};
```

`src/game/songs/level1.ts` — sunny calypso-flavored groove, C major:

```ts
// Level 1: sunny Caribbean groove — offbeat stabs stand in for steel
// drums. 16 bars at 128 bpm. Keep every channel summing to 64 beats.
import type { Note, Song } from '../../engine/sequencer';

const C3 = 130.81, F3 = 174.61, G3 = 196, A2 = 110;
const C4 = 261.63, E4 = 329.63, G4 = 392, F4 = 349.23, A4 = 440;
const C5 = 523.25, D5 = 587.33, E5 = 659.25, G5 = 783.99, A5 = 880, F5 = 698.46;
const KICK = 150, SNARE = 800, HAT = 6000;

const phraseA: Note[] = [
  [E5, 0.5], [0, 0.25], [E5, 0.25], [D5, 0.5], [C5, 0.5], [D5, 1], [0, 1],
  [C5, 0.5], [0, 0.25], [C5, 0.25], [D5, 0.5], [E5, 0.5], [G5, 1], [0, 1],
  [A5, 0.5], [G5, 0.5], [E5, 0.5], [D5, 0.5], [E5, 1], [C5, 1],
  [D5, 0.5], [C5, 0.5], [A4, 0.5], [G4, 0.5], [C5, 2],
];
const phraseB: Note[] = [
  [G5, 0.5], [0, 0.25], [G5, 0.25], [F5, 0.5], [E5, 0.5], [F5, 1], [0, 1],
  [E5, 0.5], [0, 0.25], [E5, 0.25], [F5, 0.5], [G5, 0.5], [A5, 1], [0, 1],
  [G5, 0.5], [F5, 0.5], [E5, 0.5], [D5, 0.5], [C5, 1], [E5, 1],
  [D5, 0.5], [E5, 0.5], [D5, 0.5], [G4, 0.5], [C5, 2],
];
const lead1: Note[] = [...phraseA, ...phraseB, ...phraseA, ...phraseB];

const stab = (f: number): Note[] => [
  [0, 0.5], [f, 0.25], [0, 0.25], [0, 0.5], [f, 0.25], [0, 0.25],
  [0, 0.5], [f, 0.25], [0, 0.25], [0, 0.5], [f, 0.25], [0, 0.25],
];
const stabBars = (roots: number[]): Note[] => roots.map(stab).flat();
const lead2: Note[] = stabBars([
  C4, C4, F4, G4, C4, C4, F4, G4,
  A4, A4, F4, G4, C4, E4, G4, C4,
]);

const calypso = (f: number): Note[] => [
  [f, 0.75], [0, 0.25], [f * 1.5, 0.75], [0, 0.25],
  [f, 0.5], [f * 1.5, 0.5], [f, 1],
];
const bass: Note[] = [
  C3, C3, F3, G3, C3, C3, F3, G3,
  A2, A2, F3, G3, C3, C3, G3, C3,
].map(calypso).flat();

const groove: Note[] = [
  [KICK, 0.5], [HAT, 0.25], [HAT, 0.25], [SNARE, 0.5], [HAT, 0.5],
  [KICK, 0.25], [KICK, 0.25], [SNARE, 0.5], [HAT, 1],
];
const drums: Note[] = Array.from({ length: 16 }, () => groove).flat();

export const LEVEL1_SONG: Song = {
  bpm: 128,
  channels: [lead1, lead2, bass, drums],
  loop: true,
};
```

**Beat-math check is on you:** run the test — if a channel is off (the per-bar sums above are designed to hit 4 beats/bar: phrase bars sum 4; stab 4; calypso 4; groove 4), fix the durations, not the test.

- [ ] **Step 4: Verify** — test PASS, suite, typecheck.
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: title and level 1 songs"`

---

### Task 15: Title scene (game/scenes/title.ts)

**Files:**
- Create: `src/game/scenes/title.ts`, `src/game/scenes/title.test.ts`

**Interfaces:**
- Consumes: `Scene` from engine scene; `Tilemap`, `drawTilemap` from engine tilemap; `InputSource` from engine input; `AudioSystem` from engine audio; `Sequencer` from engine sequencer; `TITLE_SONG`; `WIDTH`, `HEIGHT`; `WATER_FRAME_TICKS`.
- Produces:

```ts
export interface TitleDeps {
  input: InputSource;
  audio: AudioSystem;
  sequencer: Sequencer;
  water: Tilemap;
  seed: number;
  onStart(): void;
}
export function createTitleScene(deps: TitleDeps): Scene;
```

Behavior: `enter()` resets internal state (`ticks = 0`, `started = false`) and does NOT touch audio (the context may not exist yet). `update(dt)`: `ticks++`; scroll `bgY += 20 * dt`; on `input.consumeAnyKey()`: the first press starts the music (`sequencer.play(TITLE_SONG)`, `started = true` — `audio.unlock()` itself is wired globally in Task 16's boot, so by the time the poll sees the key the context exists); any press after `started` calls `sequencer.stop()` then `deps.onStart()`. `draw(ctx)`: `drawTilemap(ctx, water, 0, bgY % 16, WIDTH, HEIGHT, Math.floor(ticks / WATER_FRAME_TICKS))`, then a translucent darkening pass (`ctx.globalAlpha = 0.55; fillRect black; globalAlpha = 1`), then centered text (`ctx.textAlign = 'center'`, restore to 'left' at the end): "STEEL TALON" 48px monospace `PALETTE[8]` at y 160, "OPERATION GREENFIRE" 16px `PALETTE[5]` at y 190, blinking (visible when `Math.floor(ticks / 60) % 2 === 0`) "INSERT COIN — PRESS ANY KEY" 14px `PALETTE[21]` at y 300, and `SEED ${seed.toString(16).toUpperCase()}` 10px `PALETTE[22]` at y 460.

- [ ] **Step 1: Write the failing test** — `src/game/scenes/title.test.ts` (logic only; draw is dev-server-verified):

```ts
import { describe, expect, it } from 'vitest';
import { createInput } from '../../engine/input';
import type { Sequencer, Song } from '../../engine/sequencer';
import { createTitleScene } from './title';

function stubSequencer(): Sequencer & { played: Song[]; stopped: number } {
  const s = {
    played: [] as Song[],
    stopped: 0,
    play(song: Song) { s.played.push(song); },
    stop() { s.stopped++; },
    playing: () => s.played.length > s.stopped,
  };
  return s;
}

function makeScene() {
  const input = createInput();
  const seq = stubSequencer();
  let starts = 0;
  const scene = createTitleScene({
    input,
    audio: { unlock() {}, blip() {}, noise() {}, context: () => null },
    sequencer: seq,
    water: { tileSize: 16, tiles: [], pickTile: () => 0 },
    seed: 0xc0ffee,
    onStart: () => starts++,
  });
  return { input, seq, scene, starts: () => starts };
}

describe('title scene flow', () => {
  it('first key starts the music, second key starts the game', () => {
    const { input, seq, scene, starts } = makeScene();
    scene.enter();
    scene.update(1 / 60);
    expect(seq.played).toHaveLength(0);
    input.onKey('Space', true);
    scene.update(1 / 60);
    expect(seq.played).toHaveLength(1);
    expect(starts()).toBe(0);
    input.onKey('Space', true);
    scene.update(1 / 60);
    expect(seq.stopped).toBe(1);
    expect(starts()).toBe(1);
  });

  it('enter() resets so re-entering replays the flow', () => {
    const { input, seq, scene, starts } = makeScene();
    scene.enter();
    input.onKey('KeyA', true);
    scene.update(1 / 60);
    input.onKey('KeyA', true);
    scene.update(1 / 60);
    expect(starts()).toBe(1);
    scene.enter(); // back from a run
    input.onKey('KeyA', true);
    scene.update(1 / 60);
    expect(seq.played).toHaveLength(2); // music starts again, no game start
    expect(starts()).toBe(1);
  });
});
```

(If the `audio` stub's shape drifts from `AudioSystem`, fix the stub, not the interface.)

- [ ] **Step 2: Verify failure.**
- [ ] **Step 3: Implement** per Behavior. Keep all state inside the factory closure.
- [ ] **Step 4: Verify** — test PASS, suite, typecheck.
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: title scene — INSERT COIN flow, attract water, title theme"`

---

### Task 16: TOP scene — the vertical slice (game/scenes/top.ts)

**Files:**
- Create: `src/game/scenes/top.ts`, `src/game/scenes/top.test.ts`

**Interfaces:**
- Consumes: everything — entities, waves, weapons, run, hud, sprites, tilemap, sequencer, `LEVEL1_SONG`, `SFX`, `LAYER`, `Camera`.
- Produces:

```ts
export interface TopDeps {
  input: InputSource;
  audio: AudioSystem;
  sequencer: Sequencer;
  camera: Camera;                       // renderer.camera, owned by this scene while active
  water: Tilemap;
  makeRng(): () => number;              // fresh seeded stream per run
  onExit(score: number, salvage: number): void;   // fires for both COMPLETE and GAME OVER
}
export function createTopScene(deps: TopDeps): Scene;
export type Overlay = 'playing' | 'complete' | 'gameover';
```

Full behavior:

**enter():** `rng = deps.makeRng()`; `world = createWorld(rng)` (allocation at scene entry is fine — it happens once per run); `run = createRun()`; `ws = createWeaponState()`; `script = generateWaveScript(rng, LEVEL_LENGTH)`; `runner = createWaveRunner(script)`; `camera.x = 0; camera.y = LEVEL_LENGTH − HEIGHT`; player world pos `(WIDTH/2, camera.y + HEIGHT − 80)`; `overlay = 'playing'`, `overlayTicks = 0`, `ticks = 0`, `tallyShown = 0`; `sequencer.play(LEVEL1_SONG)`. Prepared sprites (`prepareLayered(createChopper())`, boat, delta, rasterized TRACER/ROCKET/pickup canvases) are built ONCE at factory creation, not in `enter()` — `enter()` only resets layer `visible`/`frame` state it owns.

**update(dt) while `overlay === 'playing'`:**
1. `ticks++`; `tickRun(run, dt)`.
2. Scroll: `camera.y = Math.max(0, camera.y − SCROLL_SPEED * dt)`.
3. Move player from input (SPEED 180, diagonal × SQRT1_2), clamp x to `[w/2, WIDTH − w/2]`, y to `[camera.y + h/2, camera.y + HEIGHT − h/2]`.
4. Weapon selection: on `input.state.weapon1..4` rising edge (track prev booleans in the closure) call `selectWeapon(run, n)` — blip `SFX.select` on success, `SFX.deny` on false. On `input.state.special` rising edge, `cycleWeapon(run)` + `SFX.select`.
5. Update the module-reused `MOUNTS` from the player position and the chopper anchors (same arithmetic as the sandbox: `pos − 16 + anchor`, CHOPPER_SCALE 1).
6. `const firedKind = tickWeapons(world, run, ws, MOUNTS, input.state.fire, dt);` blip per kind: chain/minigun → `SFX.shoot`; rocket → `SFX.shoot` (louder feel comes later); missile → `SFX.pickup`? NO — missiles get `SFX.shoot` too; keep audio simple this pass.
7. `tickWaves(world, runner, camera.y)`.
8. `tickBullets(world, dt, camera.y)`; `tickEnemyBullets(world, dt, camera.y)`; `tickEnemies(world, dt, camera.y, playerPos)`; `tickPickups(world, dt, camera.y, playerPos)`; `tickParticles(world, dt)`.
9. `const r = collideBulletsEnemies(world);` `addScore(run, r.score)`; kills → `SFX.explode`, else hits → `SFX.hit`.
10. Player hits: `const hit = collideEnemyBulletsPlayer(world, playerPos, 10, run.invulnTicks > 0) || collideEnemiesPlayer(world, playerPos, 10, run.invulnTicks > 0);` if hit → `switch (damagePlayer(run))`: `'hit'` → `SFX.hit`; `'death'` → 12-particle burst is already owned by entities' kill path — here call `spawnSmoke` ×4 + `SFX.explode`; `'gameover'` → `SFX.explode`, `overlay = 'gameover'`, `overlayTicks = 0`, `sequencer.stop()`; `'shrugged'` → nothing.
11. Pickups: `collidePickupsPlayer(world, playerPos, 12, (kind) => { ... })` — `'salvage'` → `collectSalvage(run)` + `SFX.pickup`; `'crate'` → `armMissiles(run)` + `SFX.pickup`; `'minigun'` → `grantWeapon(run, 'miniguns')` + `SFX.pickup`; `'rockets'` → `grantWeapon(run, 'rockets')` + `SFX.pickup`.
12. Chopper layers: `FLASH_L/R.visible = ws.flashTicks > 0 && run.selected === 2`; `FLASH_NOSE.visible = ws.flashTicks > 0 && run.selected === 1`; flash frames = `ws.flashFrame`; `MISSILE_L/R.visible = run.missileAmmo > 0`; rotor frame `Math.floor(ticks / 4) % 2`; invuln blink handled at draw time (skip drawing the chopper when `run.invulnTicks > 0 && Math.floor(ticks / 4) % 2 === 1`).
13. Outro check: `if (camera.y === 0 && world.enemies.countAlive() === 0 && runner.next >= script.length)` → `overlay = 'complete'`, `overlayTicks = 0`, `sequencer.stop()`.

**update while overlay is 'complete' or 'gameover':** `overlayTicks++`; tally: `tallyShown = Math.min(run.score + run.salvage * 25, Math.floor(overlayTicks * (run.score + run.salvage * 25) / 120))` (rolls up over 2 s); at `overlayTicks === 300` (5 s) call `deps.onExit(run.score, run.salvage)`. Particles keep ticking (`tickParticles`) so the last explosion plays out; nothing else updates.

**draw(ctx):** clear black; `drawTilemap(ctx, water, camera.x, camera.y, WIDTH, HEIGHT, Math.floor(ticks / WATER_FRAME_TICKS))`; pickups (weapon pickups via their 4-frame canvases at `Math.floor(ticks / PICKUP_FRAME_TICKS) % 4`, salvage at `Math.floor(ticks / SALVAGE_FRAME_TICKS) % 2`, crate frame 0 — all drawn at `pos − camera` center-anchored); enemies (boat vs delta prepared layered, delta jet frame `Math.floor(ticks / 6) % 2`); enemy bullets (2x2 `PALETTE[5]` fillRect); player bullets (TRACER canvas; rockets/missiles — `dmg >= 2` — use the ROCKET canvas); chopper (`drawLayered` at `playerPos − camera`, skipped on blink ticks); particles (existing fillRect pass, at `pos − camera`); HUD `hud.draw(ctx, run)`; overlays: 'complete' → centered `PALETTE[8]` 24px "SEGMENT COMPLETE", 14px `PALETTE[21]` `SCORE ${formatScore(tallyShown)}`, 12px `PALETTE[5]` "GOOD SHOOTING, TEX."; 'gameover' → `PALETTE[27]` 24px "GAME OVER" + the same tally line. (Draw order: world → actors → particles → HUD → overlay.)

- [ ] **Step 1: Write the failing tests** — `src/game/scenes/top.test.ts`. Full-scene integration at the logic level (no canvas): drive `update` with a stub input and assert flow:

```ts
import { describe, expect, it } from 'vitest';
import { createInput } from '../../engine/input';
import { mulberry32 } from '../../engine/rng';
import type { Sequencer, Song } from '../../engine/sequencer';
import { LEVEL_LENGTH } from '../waves';
import { createTopScene } from './top';

const DT = 1 / 60;

function makeScene() {
  const input = createInput();
  const camera = { x: 0, y: 0 };
  const exits: Array<[number, number]> = [];
  const seq: Sequencer = { play(_s: Song) {}, stop() {}, playing: () => false };
  const scene = createTopScene({
    input,
    audio: { unlock() {}, blip() {}, noise() {}, context: () => null },
    sequencer: seq,
    camera,
    water: { tileSize: 16, tiles: [], pickTile: () => 0 },
    makeRng: () => mulberry32(0xc0ffee),
    onExit: (s, sal) => exits.push([s, sal]),
  });
  return { input, camera, scene, exits };
}

describe('top scene', () => {
  it('enter() resets the camera to the bottom of the strip', () => {
    const { camera, scene } = makeScene();
    scene.enter();
    expect(camera.y).toBe(LEVEL_LENGTH - 480);
    expect(camera.x).toBe(0);
  });

  it('the camera scrolls up and clamps at 0', () => {
    const { camera, scene } = makeScene();
    scene.enter();
    const y0 = camera.y;
    for (let i = 0; i < 60; i++) scene.update(DT);
    expect(camera.y).toBeCloseTo(y0 - 60, 0);
  });

  it('a full 3-minute run reaches the outro and exits ~5s later', () => {
    const { scene, exits } = makeScene();
    scene.enter();
    // 180s of scroll + 6s of outro margin; nothing shoots the player in
    // this stub run (no input), so survival depends on dodging — the
    // seeded script may kill the player instead. Either exit is valid;
    // the scene must ALWAYS exit within the bound.
    for (let i = 0; i < (186 + 60) * 60 && exits.length === 0; i++) scene.update(DT);
    expect(exits).toHaveLength(1);
  }, 30_000);

  it('re-entering starts a fresh run with the same seed → same script', () => {
    const { camera, scene } = makeScene();
    scene.enter();
    for (let i = 0; i < 600; i++) scene.update(DT);
    const midY = camera.y;
    scene.enter();
    expect(camera.y).toBe(LEVEL_LENGTH - 480);
    for (let i = 0; i < 600; i++) scene.update(DT);
    expect(camera.y).toBe(midY); // deterministic replay
  });
});
```

NOTE for the implementer: `makeRng: () => mulberry32(0xc0ffee)` returns a FRESH generator each call — `enter()` must call it (not reuse a stale stream) for the determinism test to pass. The prepared-sprite factory work happens at `createTopScene` time; in the headless test there is no DOM, so `prepareLayered`/`rasterize` would throw — guard it: build prepared sprites lazily on first `draw()` call (a `let prepared: ... | null = null; if (!prepared) prepared = ...` in `draw`), keeping `update` DOM-free. This is the pattern the test relies on: tests only call `enter`/`update`.

- [ ] **Step 2: Verify failure.**
- [ ] **Step 3: Implement** the scene per the behavior spec above. Keep `update` allocation-free in steady state: `playerPos`, `MOUNTS`, and the prev-input-edge booleans are closure-level reused objects; the pickup-collect callback is created once in the factory (closure over `run` — careful: `run` is reassigned in `enter()`, so the callback must read a `let` binding, e.g. keep callbacks reading `state.run` off a single mutable `state` object created in the factory).
- [ ] **Step 4: Verify** — test PASS (the 3-minute run test is slow — confirm it under 30 s), full suite, typecheck.
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: TOP scene — full Level 1 lane, overlays, tally, deterministic replay"`

---

### Task 17: Shell seam — main.ts start()/onGameOver(), boot.ts, index.html

**Files:**
- Rewrite: `src/game/main.ts`
- Create: `src/game/boot.ts`
- Modify: `index.html` (script src → `/src/game/boot.ts`)

**Interfaces:**
- Consumes: everything above.
- Produces (the ONLY exports the future arcade shell touches):

```ts
export function start(seed: number): void;
export function onGameOver(cb: (score: number, salvage: number) => void): void;
```

`main.ts` (full rewrite — the sandbox dies here):

```ts
// Shell seam (engine spec §9): the game exposes start(seed) and emits
// gameover(score, salvage). Everything else stays inside.
import { createAudio } from '../engine/audio';
import { createInput } from '../engine/input';
import { createLoop } from '../engine/loop';
import { createRenderer } from '../engine/renderer';
import { mulberry32 } from '../engine/rng';
import { createSceneManager } from '../engine/scene';
import { createSequencer } from '../engine/sequencer';
import { createTitleScene } from './scenes/title';
import { createTopScene } from './scenes/top';
import { createWaterTilemap } from './sprites/tiles';

type GameOverCb = (score: number, salvage: number) => void;
let gameOverCb: GameOverCb = () => {};

export function onGameOver(cb: GameOverCb): void {
  gameOverCb = cb;
}

export function start(seed: number): void {
  const screen = document.getElementById('screen') as HTMLCanvasElement;
  const renderer = createRenderer(screen);
  renderer.resize();
  window.addEventListener('resize', () => renderer.resize());

  const input = createInput();
  input.attach(window);

  const audio = createAudio();
  // Unlock retries on every keydown (autoplay policy quirks) — must run in
  // the gesture handler, not the polled update.
  window.addEventListener('keydown', () => audio.unlock());

  const sequencer = createSequencer(audio);
  const water = createWaterTilemap();
  const scenes = createSceneManager();

  // Each run draws a fresh stream so a full replay of the level is
  // deterministic from the boot seed.
  let runIndex = 0;
  const makeRng = (): (() => number) => mulberry32((seed ^ (runIndex++ * 0x9e3779b9)) >>> 0);

  const title = createTitleScene({
    input, audio, sequencer, water, seed,
    onStart: () => scenes.switchTo(top),
  });
  const top = createTopScene({
    input, audio, sequencer, camera: renderer.camera, water, makeRng,
    onExit: (score, salvage) => {
      gameOverCb(score, salvage);
      scenes.switchTo(title);
    },
  });
  scenes.switchTo(title);

  const loop = createLoop(
    (dt) => scenes.update(dt),
    () => {
      scenes.draw(renderer.ctx);
      renderer.present();
    },
  );
  const frame = (now: number): void => {
    loop.frame(now);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
```

(If `createTopScene` is referenced before its `const` declaration via `onStart`, TypeScript flags it — declare `top` before `title`, with `title`'s `onStart` closing over a `let`-free forward reference the same way shown: reorder so `top` is created first and `title` second, with `onStart: () => scenes.switchTo(top)` still valid. Adjust as needed; the wiring, not the ordering, is the contract. NOTE: `top`'s `onExit` needs `title` — break the cycle by declaring `const scenes` first and using `let titleScene: Scene` assigned after creation, or create title first and reference it in top's `onExit` — one of the two references must be a function closure over a variable assigned later; both callbacks already are closures, so simply declaring both consts before either callback RUNS is sufficient — callbacks fire long after both exist.)

`boot.ts`:

```ts
// Dev entry: what the arcade shell will do for real later.
import { onGameOver, start } from './main';

onGameOver((score, salvage) => {
  console.log(`gameover score=${score} salvage=${salvage}`);
});
start(0xc0ffee);
```

`index.html`: change the script tag to `<script type="module" src="/src/game/boot.ts"></script>`.

- [ ] **Step 1:** No new unit tests (this file is wiring; scenes carry the logic) — the gate is: `npm test` stays green, `npm run typecheck` clean, and `npm run build` succeeds.
- [ ] **Step 2: Implement** the rewrite.
- [ ] **Step 3: Verify** — suite + typecheck + `npm run build`; report the bundle size (target: well under 200KB).
- [ ] **Step 4: Commit** — `git add -A && git commit -m "feat: shell seam — start(seed)/onGameOver, boot entry, scene wiring"`

---

### Task 18: Documentation pass

**Files:**
- Modify: `docs/architecture.md` (full current-state update), `README.md` (structure/commands if changed), `docs/steel-talon-engine-spec.md` (checkmark milestones 7–10 in the build-order table)

Requirements:

- `docs/architecture.md` describes the application AS IT NOW IS: the scene flow (boot → title → top → title), the camera/world-space model, all engine modules (now including tilemap, scene, sequencer, noise), the game modules (waves, weapons, run, hud, songs, scenes, pickups/delta/tiles sprites), the four-slot weapon system with its exact numbers, the wave-script structure, and the shell seam (`start`/`onGameOver` in `main.ts`, `boot.ts` as dev entry). No history, no plans — present tense, real file paths, short sentences.
- `README.md`: update the repo-structure listing and any commands that changed (none expected — verify).
- Engine spec build-order table: `7 ✅`, `8 ✅`, `9 ✅`, `10 ✅`.
- Cross-check every claim against the code (file names, counts, constants). A doc line that names a number must match the constant in the source.

- [ ] **Step 1:** Read the current `docs/architecture.md`, then rewrite the stale sections.
- [ ] **Step 2:** Update README + spec checkmarks.
- [ ] **Step 3:** Verify — `npm test` + typecheck still green (no code changes expected).
- [ ] **Step 4: Commit** — `git add -A && git commit -m "docs: architecture/README/spec current-state pass for milestones 7-10"`
