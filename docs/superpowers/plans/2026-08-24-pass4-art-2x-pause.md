# Pass 4 Implementation Plan: 2x World Scale + Pause Menu

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Double all game art with genuinely added detail, scale every gameplay length by 2x so the game plays identically, and add an Escape pause menu (CONTINUE / ABANDON RUN, abandoning forfeits the credit).

**Architecture:** Constants first (world scales while art is temporarily small — harmless, every task stays green), then one redraw task per sprite family, then the pause feature (input binding → pure menu module → top-scene integration → title forfeit + main wiring), then docs. Spec: `docs/superpowers/specs/2026-08-24-pass4-art-2x-pause-design.md`.

**Tech Stack:** TypeScript strict, Vite, Vitest. Canvas 2D + Web Audio via existing engine. Zero runtime dependencies.

## Global Constraints

- `src/engine/` never imports from `src/game/`.
- All gameplay randomness through the seeded RNG already threaded in; never `Math.random()`, `Date.now()`, `performance.now()` in update logic.
- Assets are code: pixel-string grids, base-32 chars (`0-9`,`a-v`) indexing `PALETTE` (DawnBringer 32), `'.'` = transparent. No image/sound files.
- No allocation in steady-state hot loops (per-tick update and draw paths).
- TypeScript strict; no `any`. `npm run typecheck` must pass at every commit.
- The 640x480 buffer, presentation code, and renderer are untouched this pass.
- Sprite redraws are hand-authored at the new size with added detail. Nearest-neighbor 2x upscaling of the old grid (each pixel becoming a 2x2 block) is a defect, not a deliverable.
- Anchor **names** never change; coordinates are re-placed on the new art.
- Player-facing copy verbatim: `P A U S E D`, `CONTINUE`, `ABANDON RUN`, `ABANDONING FORFEITS YOUR CREDIT`, `CREDIT FORFEITED — GOOD PILOTS FINISH THE MISSION.`
- Full suite green at every commit: `npm test` (currently 179 tests / 26 files) and `npm run typecheck`.

### The doubling rule (Tasks 1–2)

Every gameplay **length** doubles: speeds (px/s), accelerations (px/s²), radii, margins, amplitudes, distances. **Not** doubled: times, tick counts, damage, HP, scores, angles (`ROCKET_SPREAD`), angular rates (`HOMING_TURN_RATE`), probabilities, fire intervals, frame-tick counts. When a test expectation is derived from a doubled constant (e.g. "bullet at y=-7 after one tick at speed 420"), the expectation doubles with it; when it counts ticks, entities, or damage, it does not.

---

### Task 1: World-scale constants — entities.ts + weapons.ts

**Files:**
- Modify: `src/game/entities.ts`
- Modify: `src/game/weapons.ts`
- Test: `src/game/entities.test.ts`, `src/game/weapons.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: same exported names, doubled values. Later tasks (top scene tests, waves golden) rely on `CAM_MARGIN = 64` and `SPLASH_RADIUS = 48`.

- [ ] **Step 1: Update constants in `src/game/entities.ts`** — exact new values:

```ts
export const CAM_MARGIN = 64;
const MAGNET_RADIUS = 112;
const MAGNET_SPEED = 440;
const BOAT_SHOT_SPEED = 280;
const DELTA_SHOT_RANGE = 440;
export const SPLASH_RADIUS = 48;
const PICKUP_RADIUS: Record<PickupKind, number> = {
  minigun: 28, rockets: 28, crate: 16, salvage: 12,
};
const PICKUP_VY: Record<PickupKind, number> = {
  minigun: 80, rockets: 80, crate: 90, salvage: 60,
};
```

Inside `tickEnemies`: delta weave amplitude `Math.sin(e.age * 2.2) * 28` → `* 56`; delta shot velocity `(0, 200)` → `(0, 400)`. Both boat and delta enemy-bullet spawn blocks: `b.radius = 2` → `b.radius = 4`. In `spawnBoat`: `e.radius = 10` → `20`, `vel.y = 40` → `80`. In `spawnDelta`: `e.radius = 8` → `16`, `vel.y = 120` → `240`. Unchanged: `BULLET_MAX_AGE`, `TRAIL_TICKS`, `HOMING_TURN_RATE`, hp, scores, salvage chances, fire-timer ranges.

- [ ] **Step 2: Update constants in `src/game/weapons.ts`:**

```ts
export const MISSILE_SPEED = 600;
export const ROCKET_LAUNCH_SPEED = 240; // px/s
export const ROCKET_ACCEL = 1800;       // px/s²
const BULLET_SPEED = 840;
```

Unchanged: all intervals, `SALVO_SIZE`, `SALVO_TICK_GAP`, `ROCKET_COOLDOWN`, `ROCKET_SPREAD`, all `*_DMG`, `FLASH_TICKS`.

- [ ] **Step 3: Run the two test files, update derived expectations**

Run: `npx vitest run src/game/entities.test.ts src/game/weapons.test.ts`
Expected: failures only where expectations derive from doubled constants (positions after ticks, radii, magnet distances, splash reach). Apply the doubling rule from Global Constraints to each failing expectation — double lengths, leave counts/damage/times alone. Tests that hand-place bullets near enemies may need their placement distances doubled to stay inside the new radii semantics (e.g. a test positioned "just outside radius" must stay just outside the *new* radius).

- [ ] **Step 4: Full suite + typecheck**

Run: `npm test && npm run typecheck`
Expected: PASS. If `waves.test.ts` or `top.test.ts` fail because of `CAM_MARGIN` (used in `timeToY` and despawn), STOP and report — those files belong to Task 2; flag it in your report rather than fixing ahead. (They likely pass: golden pin depends on `LEVEL_LENGTH`/`SCROLL_SPEED`/`CAM_MARGIN` together, and `CAM_MARGIN` alone shifts golden `atY` values — if the golden fails here, coordinate with Task 2 by reporting BLOCKED-adjacent concern, do not regenerate the golden in this task.)

If waves golden DOES fail from `CAM_MARGIN`: acceptable resolution inside this task is none — report `DONE_WITH_CONCERNS` listing the failing tests; the controller will sequence Task 2 immediately.

- [ ] **Step 5: Commit**

```bash
git add src/game/entities.ts src/game/weapons.ts src/game/entities.test.ts src/game/weapons.test.ts
git commit -m "feat: double world-scale lengths in entities and weapons"
```

---

### Task 2: World-scale constants — waves.ts, top.ts, golden re-pin

**Files:**
- Modify: `src/game/waves.ts`
- Modify: `src/game/scenes/top.ts` (constants only: `SPEED`, `PLAYER_RADIUS`)
- Test: `src/game/waves.test.ts`, `src/game/scenes/top.test.ts`

**Interfaces:**
- Consumes: `CAM_MARGIN = 64` from Task 1.
- Produces: `SCROLL_SPEED = 120`, `LEVEL_LENGTH = 22_080` — Task 11's tests and the top scene rely on these via imports (no signature changes).

- [ ] **Step 1: Update `src/game/waves.ts`:**

```ts
export const SCROLL_SPEED = 120; // px/s, camera scroll rate
export const LEVEL_LENGTH = 22_080; // px: HEIGHT + 180 s * 120 px/s
const LANE_MIN = 48;
const LANE_MAX = WIDTH - 48;
```

Note 22_080, **not** 22_560: HEIGHT (480) does not double; only the 3-minute scroll distance does (180 × 120 = 21_600). Band structure, event logic, and time anchors (minigun t=40, rockets t=90, 3 crates) are untouched.

- [ ] **Step 2: Update `src/game/scenes/top.ts` constants:**

```ts
const SPEED = 360;
const PLAYER_RADIUS = 20;
```

Leave `CHOPPER_HALF = 16` — it describes the current 32x32 art and moves to 32 in Task 3 with the redraw.

- [ ] **Step 3: Regenerate the wave golden**

Run `npx vitest run src/game/waves.test.ts` — the golden-pinned script at seed `0xc0ffee` fails. Regenerate: temporarily log `JSON.stringify(generateWaveScript(mulberry32(0xc0ffee), LEVEL_LENGTH))` from a scratch test (or the failing test's diff output), sanity-check before pinning:
  - 5 bands, event count in the same ballpark as the old 66;
  - `atY` values descend from near `LEVEL_LENGTH - HEIGHT` toward 0 and every `atY` ≥ `-CAM_MARGIN`;
  - lane `x` values within [48, 592];
  - exactly one `minigun` pickup, one `rockets` pickup, three `crate` events, with the minigun near `atY = timeToY(40)` and rockets near `timeToY(90)`.
Pin the regenerated script (same pinning style the file already uses — spot-pins plus aggregate counts, not necessarily the full array; keep whatever shape the existing test uses). Remove the scratch logging.

- [ ] **Step 4: Fix remaining derived expectations**

Run: `npx vitest run src/game/waves.test.ts src/game/scenes/top.test.ts`
Update expectations derived from `SCROLL_SPEED`/`LEVEL_LENGTH`/`SPEED` (camera positions after N ticks, player movement distances, level duration math). Counts and tick numbers stay.

- [ ] **Step 5: Full suite + typecheck, commit**

Run: `npm test && npm run typecheck` — PASS.

```bash
git add src/game/waves.ts src/game/scenes/top.ts src/game/waves.test.ts src/game/scenes/top.test.ts
git commit -m "feat: double scroll speed, level length, lanes, player speed; re-pin wave golden"
```

---

## Art tasks (3–8) — shared rules

Read `src/game/palette.ts` first: grids are rows of equal-length strings, chars `0-9a-v` index `PALETTE`, `'.'` transparent, parsed by `parseGrid(rows, PALETTE)` from `src/engine/sprite.ts`. Match the existing files' comment style (short palette legend comment above each grid, e.g. `// Palette: p/m = deck grays, 1 = dark waterline, j = cyan wake`).

**Craft bar:** the new art must read as a higher-detail redraw, not an upscale. Concretely: interior detail lines that did not exist at the old size, at least 3 distinct shading values on large surfaces, and no large runs of 2x2-blocky duplication of the old grid. Draw odd-width details where the old art was symmetric-even if it helps the silhouette.

**Anchors:** keep every existing anchor name; re-place coordinates on the new art (roughly 2x old, adjusted to the redrawn pixels). Update exact-value test pins to your placed coordinates; keep all relationship/bounds assertions as logic.

**Verification:** each art task ends with its own test file green plus the full suite. Visual quality is judged later by the controller in a live Chrome pass; your job is craft + green tests.

---

### Task 3: Chopper at 64x64

**Files:**
- Modify: `src/game/sprites/player.ts`
- Modify: `src/game/scenes/top.ts` (only `CHOPPER_HALF`)
- Test: `src/game/sprites/player.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `CHOPPER_BODY` 64x64; anchors `nose`, `mast`, `muzzleL`, `muzzleR`, `podL`, `podR`, `pylonL`, `pylonR` re-placed; `LAYER` map and `createChopper()` 9-layer structure unchanged. `CHOPPER_HALF = 32`.

- [ ] **Step 1: Redraw all player sprites**

- `CHOPPER_BODY`: one 64x64 frame. Attack-helicopter seen top-down, nose up-screen. Added detail: tail boom with visible tail rotor, canopy with frame lines, engine housing + exhaust darkening behind the mast, 2–3 green shading bands (existing art uses the green ramp `9/a/b/c` and grays — reuse that family), stub wings carrying the pod/pylon hardpoints, panel lines in a darker green. Nose on the fuselage centerline (x = 31 or 32).
- `CHOPPER_ROTOR`: two frames, ~60px span, same dimensions both frames, `hub` anchor centered; make the two blur frames visibly distinct (blade angle change, not palette swap).
- `ROCKET_POD`: ~2x old size; show individual tube openings (dark circles in a lighter face).
- `MISSILE`: ~2x; add fins and a bright nose tip; keep `mount` anchor.
- Re-place all anchors; `mast` where the rotor hub sits, muzzles at the wing gun positions (symmetric about the centerline: `muzzleL.x + muzzleR.x === 63` if nose x = 31, or `=== 64` — pick one symmetry and pin it), pods/pylons on the stub wings, symmetric the same way.

- [ ] **Step 2: Update `src/game/scenes/top.ts`:**

```ts
const CHOPPER_HALF = 32; // CHOPPER_BODY is 64x64, scale 1
```

- [ ] **Step 3: Update `src/game/sprites/player.test.ts`**

Keep every existing test's logic; change the numbers:

```ts
it('body is a single 64x64 frame', () => {
  expect(CHOPPER_BODY.frames).toHaveLength(1);
  expect(CHOPPER_BODY.frames[0].width).toBe(64);
  expect(CHOPPER_BODY.frames[0].height).toBe(64);
});
```

- footprint test: `offsets[i].x + width` ≤ **64** (both axes);
- exact anchor pins (`nose`, `muzzleL`, `muzzleR`) updated to your placed coordinates;
- add one new symmetry assertion:

```ts
it('muzzles are symmetric about the fuselage centerline', () => {
  const [lx] = CHOPPER_BODY.anchors.muzzleL;
  const [rx] = CHOPPER_BODY.anchors.muzzleR;
  const [nx] = CHOPPER_BODY.anchors.nose;
  expect(lx + rx).toBe(2 * nx);
});
```

- keep anchors-in-bounds, hub-on-mast, layer-stack, hidden-flash tests as-is (logic unchanged).

- [ ] **Step 4: Run and commit**

Run: `npx vitest run src/game/sprites/player.test.ts && npm test && npm run typecheck` — PASS.

```bash
git add src/game/sprites/player.ts src/game/sprites/player.test.ts src/game/scenes/top.ts
git commit -m "feat: redraw chopper at 64x64 with added detail"
```

---

### Task 4: Boat at 48x32

**Files:**
- Modify: `src/game/sprites/boat.ts`
- Test: `src/game/sprites/boat.test.ts`

**Interfaces:**
- Produces: `BOAT_HULL` 48x32 (anchor `turret`), `BOAT_TURRET` ~12x12 (anchor `mount`), `createBoat()` unchanged shape.

- [ ] **Step 1: Redraw hull and turret**

Hull 48x32, bow at the bottom (drives toward the player), wake sparkle rows at the stern (top) using `j` cyan — give the wake 2 rows of foam texture instead of the old single-row `jj..jj`. Added detail: deck superstructure block (a raised cabin in lighter gray `n`/`m` over deck `p`), hull shading — waterline `1`, hull side `p`, deck `m`, cabin highlights `n` — and a visible gun-mount ring where the turret sits. Turret ~12x12: gunmetal box with barrel pointing down-screen toward the bow, `mount` at its rotation center. Keep the palette-legend comment style.

- [ ] **Step 2: Update `src/game/sprites/boat.test.ts`**

Dimensions → 48x32; turret dims and anchor pins → your values; keep anchors-in-bounds and layer-structure logic. Add:

```ts
it('turret anchor sits on the hull centerline', () => {
  expect(BOAT_HULL.anchors.turret[0]).toBeGreaterThanOrEqual(22);
  expect(BOAT_HULL.anchors.turret[0]).toBeLessThanOrEqual(25);
});
```

- [ ] **Step 3: Run and commit**

Run: `npx vitest run src/game/sprites/boat.test.ts && npm test && npm run typecheck` — PASS.

```bash
git add src/game/sprites/boat.ts src/game/sprites/boat.test.ts
git commit -m "feat: redraw boat at 48x32 with deck detail and wake"
```

---

### Task 5: Delta at 48x32

**Files:**
- Modify: `src/game/sprites/delta.ts`
- Test: `src/game/sprites/delta.test.ts`

**Interfaces:**
- Produces: `DELTA_BODY` 48x32 with its existing tail anchor name (check the file — the anchor the jet attaches by), `DELTA_JET` 2 frames, `createDelta()` unchanged shape.

- [ ] **Step 1: Redraw**

Delta-wing drone pointing down-screen at the player, 48x32. Added detail: cockpit canopy (dark `1`/`f` glass with a `k` glint pixel), wing markings (a contrasting chevron per wing), leading-edge highlight, 3-value shading on the wing surface (existing delta uses reds/grays — reuse its family; read the old file's legend first). `DELTA_JET` two flicker frames (~2x old size) with visibly different flame lengths, orange/yellow `5`/`8`. Re-place the tail anchor at the jet mount on the new art (tail is at the TOP of the grid since the craft points down-screen — the old anchor was `[11, 0]`).

- [ ] **Step 2: Update `src/game/sprites/delta.test.ts`**

Dimensions → 48x32, jet frame dims, anchor pins → your values; keep bounds/structure logic.

- [ ] **Step 3: Run and commit**

Run: `npx vitest run src/game/sprites/delta.test.ts && npm test && npm run typecheck` — PASS.

```bash
git add src/game/sprites/delta.ts src/game/sprites/delta.test.ts
git commit -m "feat: redraw delta drone at 48x32 with cockpit and jet detail"
```

---

### Task 6: Pickups at 2x

**Files:**
- Modify: `src/game/sprites/pickups.ts`
- Test: `src/game/sprites/pickups.test.ts`

**Interfaces:**
- Produces: `MINIGUN_PICKUP`/`ROCKET_PICKUP` 4 frames 64x64; `CRATE` 24x20; `SALVAGE` 2 frames 16x16; `PICKUP_FRAME_TICKS`, `SALVAGE_FRAME_TICKS`, `rotateGrid` unchanged.

- [ ] **Step 1: Redraw**

- Weapon pickups: base weapon silhouette drawn once at 64x64 (chunkier: minigun with visible barrel cluster, rocket pod with tube grid), then the existing pattern — `rotateGrid` 90° CW for 4 rotation frames, pulsing glow ring at **radius 28** alternating chars `'8'`⇄`'l'` between frames (same mechanism the file already uses at radius 14; read the file and keep its frame-composition helper approach).
- `CRATE` 24x20: military crate with strapping bands (dark `2`/`3` over wood `6`/`7`) and a stencil mark.
- `SALVAGE` 16x16, 2 frames: scrap with a moving `k`/`8` glint between frames.

- [ ] **Step 2: Update `src/game/sprites/pickups.test.ts`**

Frame dims 64/24x20/16; ring-pulse assertions (the existing test checks ring chars differ between frames — keep logic, update coordinates to radius 28 sample points); rotation-frame equality checks unchanged in logic.

- [ ] **Step 3: Run and commit**

Run: `npx vitest run src/game/sprites/pickups.test.ts && npm test && npm run typecheck` — PASS.

```bash
git add src/game/sprites/pickups.ts src/game/sprites/pickups.test.ts
git commit -m "feat: redraw pickups at 2x — 64px weapon pickups, detailed crate and salvage"
```

---

### Task 7: Water tiles at 32px

**Files:**
- Modify: `src/game/sprites/tiles.ts`
- Modify: `src/game/scenes/title.ts` (backdrop modulo)
- Test: `src/game/sprites/tiles.test.ts`

**Interfaces:**
- Produces: `WATER_TILES` six 32x32 grids; `createWaterTilemap()` with `tileSize: 32`; `pickWaterTile` and `WATER_FRAME_TICKS` unchanged.

- [ ] **Step 1: Redraw tiles**

The file generates 6 grids from fleck coordinate lists on a base water color — keep that mechanism, at 32x32: more flecks per tile (roughly 4x the count to keep density), at least two fleck colors (existing family — read the file's legend), and make the two animation-paired variants differ in fleck placement, not just color. `tileSize: 16` → `32`.

- [ ] **Step 2: Fix the title backdrop modulo**

In `src/game/scenes/title.ts` `draw()`: `drawTilemap(ctx, deps.water, 0, bgY % 16, ...)` → `bgY % deps.water.tileSize` (kills the hard-coded 16 for good).

- [ ] **Step 3: Update `src/game/sprites/tiles.test.ts`**

Tile dims → 32; density/variant assertions updated; `pickWaterTile` distribution tests (80/15/5 hash) unchanged.

- [ ] **Step 4: Run and commit**

Run: `npx vitest run src/game/sprites/tiles.test.ts && npm test && npm run typecheck` — PASS.

```bash
git add src/game/sprites/tiles.ts src/game/sprites/tiles.test.ts src/game/scenes/title.ts
git commit -m "feat: redraw water tiles at 32px with denser flecks"
```

---

### Task 8: Shots + HUD glyphs at 2x

**Files:**
- Modify: `src/game/sprites/shots.ts`
- Modify: `src/game/hud.ts`
- Test: `src/game/sprites/shots.test.ts`, `src/game/hud.test.ts`

**Interfaces:**
- Produces: `TRACER` 4x8, `ROCKET` 4x10, `MUZZLE_FLASH` ~2x (keep `mount` anchor); `LIVES_ICON` 16x16; HUD layout constants nudged; `formatScore`/`slotView` untouched.

- [ ] **Step 1: Redraw shots**

- `TRACER` 4x8: bright core column (`8`/`k`) with dimmer sheath columns (`l`/`m` family — match the old file's chars).
- `ROCKET` 4x10: body `m`, nose `5`, and a visible exhaust pixel row at the tail (`8` over `5`), per spec.
- `MUZZLE_FLASH`: ~2x with a brighter core; keep `mount`.

- [ ] **Step 2: Redraw `LIVES_ICON` at 16x16 in `src/game/hud.ts`**

A recognizable top-down mini-chopper (body + rotor cross), same palette family as the old 8x8 icon. Nudge HUD layout so the row of 16px icons and the weapon panel don't collide with the score text — keep all HUD elements inside the 640x480 frame and visually separated; adjust the pixel offsets in `createHud().draw` as needed (small integer changes only, no structural rewrite).

- [ ] **Step 3: Update tests**

`shots.test.ts`: dims 4x8 / 4x10, flash anchor logic kept. `hud.test.ts`: `LIVES_ICON` frame is 16x16; existing formatScore/slotView tests untouched.

- [ ] **Step 4: Run and commit**

Run: `npx vitest run src/game/sprites/shots.test.ts src/game/hud.test.ts && npm test && npm run typecheck` — PASS.

```bash
git add src/game/sprites/shots.ts src/game/sprites/shots.test.ts src/game/hud.ts src/game/hud.test.ts
git commit -m "feat: 2x tracer, rocket, muzzle flash, and 16px lives icon"
```

---

### Task 9: Input — pause binding + NumpadEnter

**Files:**
- Modify: `src/engine/input.ts`
- Test: `src/engine/input.test.ts`

**Interfaces:**
- Produces: `Input` gains `pause: boolean`; `Escape` → `pause`; `NumpadEnter` → `start`. Task 11 reads `input.pause` and `input.start`.

- [ ] **Step 1: Write the failing tests** (append to `src/engine/input.test.ts`, matching its existing style of driving `onKey`):

```ts
it('binds Escape to pause', () => {
  const input = createInput();
  input.onKey('Escape', true);
  expect(input.state.pause).toBe(true);
  input.onKey('Escape', false);
  expect(input.state.pause).toBe(false);
});

it('binds NumpadEnter to start', () => {
  const input = createInput();
  input.onKey('NumpadEnter', true);
  expect(input.state.start).toBe(true);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/engine/input.test.ts` — FAIL (`pause` missing / binding absent).

- [ ] **Step 3: Implement**

In `src/engine/input.ts`: add `pause: boolean` to the `Input` interface and the initial state object (`pause: false`); add to `BINDINGS`: `Escape: 'pause',` and `NumpadEnter: 'start',`. The blur-clear path resets all fields via the existing loop — verify it covers `pause` (it iterates the state object; if it lists fields explicitly, add `pause`).

- [ ] **Step 4: Run and commit**

Run: `npx vitest run src/engine/input.test.ts && npm test && npm run typecheck` — PASS.

```bash
git add src/engine/input.ts src/engine/input.test.ts
git commit -m "feat: Escape pause binding and NumpadEnter start"
```

---

### Task 10: Pause menu pure module

**Files:**
- Create: `src/game/pausemenu.ts`
- Test: `src/game/pausemenu.test.ts`

**Interfaces:**
- Produces (Task 11 consumes exactly this):

```ts
export type PauseAction = 'continue' | 'abandon' | null;
export interface PauseMenuState { cursor: 0 | 1 } // 0 = CONTINUE, 1 = ABANDON RUN
export interface PauseEdges { up: boolean; down: boolean; confirm: boolean; pause: boolean }
export function createPauseMenu(): PauseMenuState;
// Mutates m.cursor on up/down (wrapping between the 2 items). Returns:
// 'continue' when pause is edged (Escape resumes) or confirm on cursor 0,
// 'abandon' when confirm on cursor 1, else null. pause wins over confirm.
export function tickPauseMenu(m: PauseMenuState, edges: PauseEdges): PauseAction;
// True when this tick moved the cursor (scene plays the select blip).
export function pauseMenuMoved(before: 0 | 1, after: 0 | 1): boolean;
```

(`pauseMenuMoved` is trivially `before !== after` — include it so the scene reads declaratively.)

- [ ] **Step 1: Write the failing tests** (`src/game/pausemenu.test.ts`):

```ts
import { describe, expect, it } from 'vitest';
import { createPauseMenu, pauseMenuMoved, tickPauseMenu } from './pausemenu';

const edges = (o: Partial<{ up: boolean; down: boolean; confirm: boolean; pause: boolean }> = {}) =>
  ({ up: false, down: false, confirm: false, pause: false, ...o });

describe('pause menu', () => {
  it('starts on CONTINUE', () => {
    expect(createPauseMenu().cursor).toBe(0);
  });

  it('down moves to ABANDON, down again wraps to CONTINUE', () => {
    const m = createPauseMenu();
    expect(tickPauseMenu(m, edges({ down: true }))).toBeNull();
    expect(m.cursor).toBe(1);
    tickPauseMenu(m, edges({ down: true }));
    expect(m.cursor).toBe(0);
  });

  it('up from CONTINUE wraps to ABANDON', () => {
    const m = createPauseMenu();
    tickPauseMenu(m, edges({ up: true }));
    expect(m.cursor).toBe(1);
  });

  it('confirm routes by cursor', () => {
    const m = createPauseMenu();
    expect(tickPauseMenu(m, edges({ confirm: true }))).toBe('continue');
    m.cursor = 1;
    expect(tickPauseMenu(m, edges({ confirm: true }))).toBe('abandon');
  });

  it('pause edge resumes regardless of cursor, and wins over confirm', () => {
    const m = createPauseMenu();
    m.cursor = 1;
    expect(tickPauseMenu(m, edges({ pause: true }))).toBe('continue');
    expect(tickPauseMenu(m, edges({ pause: true, confirm: true }))).toBe('continue');
  });

  it('no edges → null, cursor unmoved', () => {
    const m = createPauseMenu();
    expect(tickPauseMenu(m, edges())).toBeNull();
    expect(m.cursor).toBe(0);
  });

  it('pauseMenuMoved detects cursor change', () => {
    expect(pauseMenuMoved(0, 1)).toBe(true);
    expect(pauseMenuMoved(1, 1)).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/game/pausemenu.test.ts` — FAIL (module not found).

- [ ] **Step 3: Implement `src/game/pausemenu.ts`:**

```ts
// Pause-menu state machine, pure and headless: the TOP scene feeds it
// edge-detected input and acts on the returned action. Two items only:
// 0 = CONTINUE, 1 = ABANDON RUN.
export type PauseAction = 'continue' | 'abandon' | null;

export interface PauseMenuState { cursor: 0 | 1 }

export interface PauseEdges { up: boolean; down: boolean; confirm: boolean; pause: boolean }

export function createPauseMenu(): PauseMenuState {
  return { cursor: 0 };
}

export function tickPauseMenu(m: PauseMenuState, edges: PauseEdges): PauseAction {
  if (edges.pause) return 'continue'; // Escape resumes; deliberate confirm required to abandon
  if (edges.up || edges.down) m.cursor = m.cursor === 0 ? 1 : 0;
  if (edges.confirm) return m.cursor === 0 ? 'continue' : 'abandon';
  return null;
}

export function pauseMenuMoved(before: 0 | 1, after: 0 | 1): boolean {
  return before !== after;
}
```

- [ ] **Step 4: Run and commit**

Run: `npx vitest run src/game/pausemenu.test.ts && npm test && npm run typecheck` — PASS.

```bash
git add src/game/pausemenu.ts src/game/pausemenu.test.ts
git commit -m "feat: pause menu state machine"
```

---

### Task 11: TOP scene pause integration

**Files:**
- Modify: `src/game/scenes/top.ts`
- Test: `src/game/scenes/top.test.ts`

**Interfaces:**
- Consumes: `pausemenu.ts` exactly as defined in Task 10; `input.pause` / `input.start` from Task 9.
- Produces: `Overlay` type gains `'paused'`; `TopDeps` gains `onAbandon(): void`. Task 12 wires `onAbandon` in main.ts.

- [ ] **Step 1: Write the failing tests** (append to `src/game/scenes/top.test.ts`, using the file's existing scene-construction helpers — read them first and reuse; the snippets below show intent, adapt dep names to the file's helper):

```ts
describe('pause', () => {
  it('Escape pauses: world state freezes, resume continues exactly', () => {
    const scene = makeScene(); // file's existing helper with stub deps
    scene.enter();
    for (let i = 0; i < 60; i++) scene.update(DT);
    const yBefore = scene.debugPlayerY();
    input.onKey('Escape', true);
    scene.update(DT);
    input.onKey('Escape', false);
    // 120 paused ticks: nothing moves
    for (let i = 0; i < 120; i++) scene.update(DT);
    expect(scene.debugPlayerY()).toBe(yBefore);
    // Escape again resumes; scroll rides once more
    input.onKey('Escape', true);
    scene.update(DT);
    input.onKey('Escape', false);
    for (let i = 0; i < 60; i++) scene.update(DT);
    expect(scene.debugPlayerY()).not.toBe(yBefore);
  });

  it('abandon calls onAbandon, never onExit, and stops music', () => {
    // pause, cursor down to ABANDON RUN, Enter
    // assert onAbandon called once, onExit never, sequencer.stop called
  });

  it('Escape during gameover overlay does nothing', () => {
    // drive run to gameover via the file's existing damage path helper,
    // press Escape, assert overlay stays 'gameover'
  });
});
```

The second and third tests must be written out fully in the same style — the comments above name the required assertions; implement them with the file's existing helpers (`onExit` is already a recorded stub in the file's dep factory; add an `onAbandon` stub beside it).

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/game/scenes/top.test.ts` — FAIL (`onAbandon` missing from deps, no pause behavior).

- [ ] **Step 3: Implement in `src/game/scenes/top.ts`**

1. `export type Overlay = 'playing' | 'paused' | 'complete' | 'gameover';`
2. `TopDeps` gains `onAbandon(): void;`.
3. Import `createPauseMenu, pauseMenuMoved, tickPauseMenu` from `../pausemenu`; add to the closure: `const pauseMenu = createPauseMenu();` and extend `prevInput` with `pause: false, up: false, down: false, start: false`.
4. In `enter()`: reset `pauseMenu.cursor = 0` and the new `prevInput` fields to `false`.
5. In `update(dt)`, before the `'playing'` block: compute edges once per tick (no allocation — reuse a module-level or closure-level edges object):

```ts
const edgePause = input.pause && !prevInput.pause;
```

   - If `state.overlay === 'playing'` and `edgePause`: set `state.overlay = 'paused'`, `pauseMenu.cursor = 0`, play `SFX.select`; skip the rest of the playing block this tick.
   - If `state.overlay === 'paused'`: fill the reused edges object (`up`/`down`/`start`→confirm/`pause` edges from `input` vs `prevInput`), record `cursor` before, call `tickPauseMenu`; on cursor move play `SFX.select`; on `'continue'` set overlay back to `'playing'`; on `'abandon'` call `deps.sequencer.stop()` then `deps.onAbandon()`. Nothing else runs while paused — no `state.ticks++`, no `tickRun`, no camera/scroll, no world ticks (determinism: paused ticks never happen).
   - `'complete'`/`'gameover'` blocks: unchanged (Escape ignored — no pause path from them).
   - At the END of `update` (all overlay states): copy current `input` values into ALL `prevInput` fields (the existing weapon-edge copy already does some; extend it).
6. In `draw()`, after the HUD, add the paused overlay:

```ts
if (overlay === 'paused') {
  ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.textAlign = 'center';
  ctx.font = '24px monospace';
  ctx.fillStyle = PALETTE[21];
  ctx.fillText('P A U S E D', WIDTH / 2, HEIGHT / 2 - 48);
  ctx.font = '16px monospace';
  const items = PAUSE_ITEMS; // module-level: ['CONTINUE', 'ABANDON RUN']
  for (let i = 0; i < items.length; i++) {
    ctx.fillStyle = pauseMenu.cursor === i ? PALETTE[8] : PALETTE[22];
    ctx.fillText((pauseMenu.cursor === i ? '> ' : '  ') + items[i], WIDTH / 2, HEIGHT / 2 - 8 + i * 24);
  }
  ctx.font = '12px monospace';
  ctx.fillStyle = PALETTE[27];
  ctx.fillText('ABANDONING FORFEITS YOUR CREDIT', WIDTH / 2, HEIGHT / 2 + 56);
}
```

`PAUSE_ITEMS` is a module-level `const` (no per-frame array allocation).

- [ ] **Step 4: Run and commit**

Run: `npx vitest run src/game/scenes/top.test.ts && npm test && npm run typecheck` — PASS.

```bash
git add src/game/scenes/top.ts src/game/scenes/top.test.ts
git commit -m "feat: Escape pause with CONTINUE / ABANDON RUN menu in TOP scene"
```

---

### Task 12: Title forfeit message + main wiring

**Files:**
- Modify: `src/game/scenes/title.ts`
- Modify: `src/game/main.ts`
- Test: `src/game/scenes/title.test.ts`

**Interfaces:**
- Consumes: `TopDeps.onAbandon` from Task 11.
- Produces: `createTitleScene` returns `Scene & { notifyForfeit(): void }`.

- [ ] **Step 1: Write the failing tests** (append to `src/game/scenes/title.test.ts`, matching its existing stub-deps style):

```ts
it('notifyForfeit shows the forfeit line for 240 ticks after enter', () => {
  const title = makeTitle(); // file's existing helper
  title.notifyForfeit();
  title.enter();
  expect(title.debugForfeitTicks()).toBe(240);
  for (let i = 0; i < 240; i++) title.update(DT);
  expect(title.debugForfeitTicks()).toBe(0);
});

it('enter without notifyForfeit shows no forfeit line', () => {
  const title = makeTitle();
  title.enter();
  expect(title.debugForfeitTicks()).toBe(0);
});

it('forfeit flag is consumed — a second enter does not re-show it', () => {
  const title = makeTitle();
  title.notifyForfeit();
  title.enter();
  title.enter();
  expect(title.debugForfeitTicks()).toBe(0);
});
```

Give the returned object a `debugForfeitTicks(): number` read-only seam alongside `notifyForfeit` (same pattern as `debugPlayerY` in top.ts) and update the return type accordingly.

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/game/scenes/title.test.ts` — FAIL.

- [ ] **Step 3: Implement**

In `src/game/scenes/title.ts`:

```ts
const FORFEIT_TICKS = 240; // 4 s at 60 Hz
const FORFEIT_BLINK = 20;  // ticks per blink phase
```

Closure state: `let forfeitPending = false; let forfeitTicks = 0;`. `notifyForfeit()` sets `forfeitPending = true`. In `enter()`: `forfeitTicks = forfeitPending ? FORFEIT_TICKS : 0; forfeitPending = false;`. In `update()`: `if (forfeitTicks > 0) forfeitTicks--;`. In `draw()`, below the INSERT COIN prompt, when `forfeitTicks > 0` and `Math.floor(forfeitTicks / FORFEIT_BLINK) % 2 === 0`:

```ts
ctx.font = '14px monospace';
ctx.fillStyle = PALETTE[27];
ctx.fillText('CREDIT FORFEITED — GOOD PILOTS FINISH THE MISSION.', WIDTH / 2, HEIGHT - 96);
```

(Position it clear of the existing INSERT COIN and seed readout lines — check their y coordinates in the file and pick a free row.)

In `src/game/main.ts`: add to the `createTopScene` deps:

```ts
onAbandon: () => {
  title.notifyForfeit();
  scenes.switchTo(title);
},
```

(`title` is referenced from the closure exactly like the existing `onExit` does.)

- [ ] **Step 4: Run and commit**

Run: `npx vitest run src/game/scenes/title.test.ts && npm test && npm run typecheck` — PASS.

```bash
git add src/game/scenes/title.ts src/game/scenes/title.test.ts src/game/main.ts
git commit -m "feat: abandon forfeits the credit — title forfeit flash and main wiring"
```

---

### Task 13: Documentation

**Files:**
- Modify: `docs/architecture.md`
- Modify: `README.md` (only if inaccurate — commands are unchanged)

**Interfaces:** none — prose only.

- [ ] **Step 1: Update `docs/architecture.md` to the current state**

It must describe the application as it now is (no history, no plans): 2x sprite sizes (chopper 64x64, boat/delta 48x32, pickups 64, crate 24x20, salvage 16, water tiles 32, tracer 4x8, rocket 4x10, lives icon 16), the doubled world constants (scroll 120 px/s, level length 22_080, player speed 360, radii per the spec table — state the current values, not the old ones), the pause flow (`'paused'` overlay state, `pausemenu.ts` module, `Escape`/`Enter` bindings incl. `NumpadEnter`, `onAbandon` seam, title `notifyForfeit`), and the input map additions. Style: short sentences, real file paths, no filler. Read the whole doc and fix anything the pass made stale — sprite dimensions and constants appear in several sections.

- [ ] **Step 2: Verify and commit**

Run: `npm test && npm run typecheck` — PASS (unchanged code).

```bash
git add docs/architecture.md README.md
git commit -m "docs: architecture updated for 2x world scale and pause"
```

---

## After all tasks (controller, not a subagent)

1. Final whole-branch review per subagent-driven-development.
2. Live Chrome pass on the dev server: art-review screenshots of every redrawn sprite in-game; **projectile readability judgment** — if tracers/enemy shots/rockets still read thin at real presentation scale, enemy shots get a small 2-frame pulsing orb sprite (~6x6) in shots.ts drawn at bullet positions (this is the deliberately deferred "bullets read as single pixels" item — it must be explicitly judged, not skipped); full pause walkthrough (pause → navigate → continue; pause → abandon → forfeit flash on title → INSERT COIN flow still works; music keeps playing while paused).
3. finishing-a-development-branch.
