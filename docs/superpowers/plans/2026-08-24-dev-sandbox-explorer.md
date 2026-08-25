# Dev Sandbox + Object Explorer + 2x Rotor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Two dev-only screens (sandbox with full arsenal + on-demand enemy spawning; auto-discovering sprite explorer) gated behind `npm run dev`, plus a 2x rotor sprite.

**Architecture:** All dev code lives in `src/game/dev/`, wired from `main.ts` only inside `if (import.meta.env.DEV)` via dynamic import so `npm run build` tree-shakes it out. The sandbox is the real TOP scene with an optional `sandbox` hooks object; the explorer is a standalone scene fed by a pure classification function over `import.meta.glob` results. Spec: `docs/superpowers/specs/2026-08-24-dev-sandbox-explorer-design.md`.

**Tech Stack:** TypeScript strict, Vite, Vitest, Canvas 2D. Zero runtime dependencies.

## Global Constraints

- Work on branch `dev-tools` off `main`. `src/game/weapons.ts` has uncommitted user changes — never stage, commit, or revert that file.
- Nothing in `src/engine/` changes. The shell seam (`start(seed)` / `gameover`) is untouched.
- No `Math.random()`, `Date.now()`, or `performance.now()` in update logic; gameplay randomness uses the scene's seeded rng.
- No allocation in the hot loop (reuse edge/state objects like the existing `prevInput` pattern in `src/game/scenes/top.ts`).
- TDD: failing test first for every pure unit. Canvas drawing stays thin and is verified visually.
- TypeScript strict, no `any`. Run `npm run typecheck` and `npm test` before each commit.
- Prod bundle must contain zero dev code (verified in the final task).
- Docs are updated in the final task only (user preference: docs at end of pass).

---

### Task 1: Branch + 2x rotor

**Files:**
- Modify: `src/game/sprites/player.ts:140-197` (rotor constants + hub)
- Test: `src/game/sprites/player.test.ts`

**Interfaces:**
- Consumes: existing `CHOPPER_ROTOR: SpriteDef` in `src/game/sprites/player.ts`.
- Produces: same export, frames now 117x117, `anchors.hub` at `[58, 58]`. No signature changes.

- [ ] **Step 1: Create the branch**

```bash
git checkout -b dev-tools
```

- [ ] **Step 2: Check existing rotor assertions**

Run: `grep -n "59\|29\|ROTOR" src/game/sprites/player.test.ts`
Note any assertions pinning the old size — they will be updated in Step 3.

- [ ] **Step 3: Write/adjust the failing test**

In `src/game/sprites/player.test.ts`, add (and update any old size assertions found in Step 2 to the new values):

```ts
it('rotor disc is 117x117 with the hub centered', () => {
  expect(CHOPPER_ROTOR.frames[0].width).toBe(117);
  expect(CHOPPER_ROTOR.frames[0].height).toBe(117);
  expect(CHOPPER_ROTOR.frames[1].width).toBe(117);
  expect(CHOPPER_ROTOR.anchors.hub).toEqual([58, 58]);
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npx vitest run src/game/sprites/player.test.ts`
Expected: FAIL (width is 59).

- [ ] **Step 5: Double the rotor constants**

In `src/game/sprites/player.ts`, scale the generation constants ×2:

```ts
const ROTOR_SIZE = 117;
const ROTOR_HUB = 58;
const BLADE_MIN = 10;
const BLADE_MAX = 56;

// [radius, dash period] of the blur arcs; dashes are 2px long.
const BLUR_ARCS: Array<[number, number]> = [[54, 7], [38, 5]];
```

Inside `rotorFrame`, scale the blade thresholds: `set(x, y, r > 44 ? 'o' : 'n');` (was `r > 22`) and `if (r < 48)` for the trailing chord (was `r < 24`). Scale the hub block: loop `ROTOR_HUB - 6` to `ROTOR_HUB + 6`, with `d <= 4` → `'m'`, `d <= 8` → `'n'`, `d <= 10` → `'1'`. Update the "59x59" comment above `ROTOR_SIZE` to say 117x117.

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run src/game/sprites/player.test.ts` then `npm test && npm run typecheck`
Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add src/game/sprites/player.ts src/game/sprites/player.test.ts
git commit -m "feat: double top rotor disc to 117x117"
```

---

### Task 2: Sandbox option on the TOP scene

**Files:**
- Modify: `src/game/scenes/top.ts`
- Test: `src/game/scenes/top.test.ts`

**Interfaces:**
- Consumes: `grantWeapon`, `damagePlayer` from `src/game/run.ts`; `World` from `src/game/entities.ts`.
- Produces (Task 7 relies on these exactly):

```ts
// exported from src/game/scenes/top.ts
export interface SandboxHooks {
  /** Called once per playing tick, before pause handling and gameplay.
   *  Return true to freeze this tick (e.g. the spawn overlay is open). */
  tick(world: World, playerX: number, camY: number): boolean;
  /** Screen-space overlay, drawn last. */
  draw(ctx: CanvasRenderingContext2D): void;
}
// TopDeps gains: sandbox?: SandboxHooks;
```

- [ ] **Step 1: Write the failing tests**

In `src/game/scenes/top.test.ts`, extend `makeScene` to accept an optional `sandbox` param and pass it through to `createTopScene`. Add:

```ts
function makeSandboxHooks(): { hooks: SandboxHooks; calls: Array<[number, number]>; frozen: { value: boolean } } {
  const calls: Array<[number, number]> = [];
  const frozen = { value: false };
  return {
    hooks: {
      tick(_w, playerX, camY) { calls.push([playerX, camY]); return frozen.value; },
      draw() {},
    },
    calls, frozen,
  };
}

describe('sandbox mode', () => {
  it('freezes scroll and skips the wave script', () => {
    const { hooks } = makeSandboxHooks();
    const { camera, scene } = makeScene(hooks);
    scene.enter();
    const y0 = camera.y;
    for (let i = 0; i < 600; i++) scene.update(DT);
    expect(camera.y).toBe(y0);            // no scroll
    expect(scene.debugOverlay()).toBe('playing'); // never completes
  });

  it('starts with the full arsenal and missiles pinned at 9', () => {
    const { hooks } = makeSandboxHooks();
    const { scene, input } = makeScene(hooks);
    scene.enter();
    input.onKey('Digit2', true); scene.update(DT); input.onKey('Digit2', false);
    expect(scene.debugSelected()).toBe(2); // miniguns owned from tick 0
  });

  it('a frozen tick advances nothing world-side', () => {
    const { hooks, frozen } = makeSandboxHooks();
    const { scene, camera } = makeScene(hooks);
    scene.enter();
    frozen.value = true;
    const y0 = camera.y;
    for (let i = 0; i < 60; i++) scene.update(DT);
    expect(camera.y).toBe(y0);
  });

  it('death respawns in place instead of ending the run', () => {
    // drive damage via debugDamage() seam; hp exhaustion must not
    // reach the gameover overlay in sandbox mode
    const { hooks } = makeSandboxHooks();
    const { scene } = makeScene(hooks);
    scene.enter();
    for (let i = 0; i < 20; i++) scene.debugDamage();
    expect(scene.debugOverlay()).toBe('playing');
  });
});
```

Add two tiny read/drive seams next to the existing `debugPlayerY`/`debugOverlay`: `debugSelected(): number` (returns `state.run.selected`) and `debugDamage(): void` (runs the same hit-resolution path as a collision, so the sandbox respawn branch is exercised without scripting enemy fire).

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/game/scenes/top.test.ts`
Expected: FAIL (no `sandbox` dep, no new seams).

- [ ] **Step 3: Implement in `src/game/scenes/top.ts`**

1. Export `SandboxHooks` (as specified above) and add `sandbox?: SandboxHooks` to `TopDeps`.
2. `enter()`: `state.script = deps.sandbox ? [] : generateWaveScript(state.rng, LEVEL_LENGTH);` and after `state.run = createRun()`, when sandbox: `grantWeapon(state.run, 'miniguns'); grantWeapon(state.run, 'rockets'); state.run.missileAmmo = 9; state.run.selected = 1;`.
3. Extract the end-of-update prevInput copy block into a closure `const latchPrevInput = (): void => { ... }` (same nine assignments) and call it where the block was.
4. At the very top of `update()`, before the `edgePause` computation:

```ts
if (deps.sandbox && state.overlay === 'playing') {
  if (deps.sandbox.tick(state.world, playerPos.x, deps.camera.y)) {
    latchPrevInput();
    return;
  }
}
```

5. Scroll: `camera.y = Math.max(0, camera.y - (deps.sandbox ? 0 : SCROLL_SPEED) * dt);` (keep the delta-riding line, it becomes a no-op).
6. Missiles pinned: right after `tickRun(run, dt)`, add `if (deps.sandbox) run.missileAmmo = 9;`.
7. Hit resolution: extract the existing `switch (damagePlayer(run)) {...}` body into a closure `const resolveHit = (): void => {...}`; inside it, when `deps.sandbox` and the result is `'death'` or `'gameover'`: `run.lives = 3; run.hp = 3; run.invulnTicks = 180;` spawn the 4 smoke puffs, blip `SFX.explode`, and do NOT change `state.overlay` or stop the sequencer. Call `resolveHit()` from the collision `if (hit)` branch and from the new `debugDamage()` seam.
8. Outro check: guard with `!deps.sandbox &&`.
9. `draw()`: at the very end, `deps.sandbox?.draw(ctx);`.
10. Add the `debugSelected` / `debugDamage` seams to the returned object and to the return type annotation.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/game/scenes/top.test.ts` then `npm test && npm run typecheck`
Expected: all PASS (existing non-sandbox tests must be untouched by the refactor).

- [ ] **Step 5: Commit**

```bash
git add src/game/scenes/top.ts src/game/scenes/top.test.ts
git commit -m "feat: sandbox hooks option on the TOP scene"
```

---

### Task 3: Spawn registry

**Files:**
- Create: `src/game/dev/spawns.ts`
- Test: `src/game/dev/spawns.test.ts`

**Interfaces:**
- Consumes: `spawnBoat(w, x, y)`, `spawnDelta(w, x, y)`, `spawnPickup(w, kind, x, y)`, `createWorld`, `World` from `src/game/entities.ts`.
- Produces:

```ts
export interface SpawnEntry { label: string; spawn(w: World, x: number, y: number): void; }
export const SANDBOX_SPAWNS: readonly SpawnEntry[];
```

- [ ] **Step 1: Write the failing test**

`src/game/dev/spawns.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../engine/rng';
import { createWorld } from '../entities';
import { SANDBOX_SPAWNS } from './spawns';

describe('sandbox spawn registry', () => {
  it('covers every enemy and pickup kind with unique labels', () => {
    const labels = SANDBOX_SPAWNS.map((e) => e.label);
    expect(new Set(labels).size).toBe(labels.length);
    expect(labels).toEqual(
      expect.arrayContaining(['BOAT', 'DELTA', 'MISSILE CRATE', 'MINIGUN PICKUP', 'ROCKET PICKUP', 'SALVAGE']),
    );
  });

  it('every entry spawns exactly one live object into the world', () => {
    for (const entry of SANDBOX_SPAWNS) {
      const w = createWorld(mulberry32(1));
      entry.spawn(w, 320, 100);
      const alive = w.enemies.countAlive() + w.pickups.countAlive();
      expect(alive, entry.label).toBe(1);
    }
  });
});
```

(If `Pool` has no `countAlive`, check `src/engine/pool.ts` for the equivalent — the existing top scene uses `world.enemies.countAlive()`, so it exists.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/game/dev/spawns.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `src/game/dev/spawns.ts`**

```ts
// Dev-only sandbox spawn registry. One line per spawnable thing; the
// spawn palette lists these labels in order. Add new enemies here.
import { spawnBoat, spawnDelta, spawnPickup, type World } from '../entities';

export interface SpawnEntry {
  label: string;
  spawn(w: World, x: number, y: number): void;
}

export const SANDBOX_SPAWNS: readonly SpawnEntry[] = [
  { label: 'BOAT', spawn: (w, x, y) => void spawnBoat(w, x, y) },
  { label: 'DELTA', spawn: (w, x, y) => void spawnDelta(w, x, y) },
  { label: 'MISSILE CRATE', spawn: (w, x, y) => void spawnPickup(w, 'crate', x, y) },
  { label: 'MINIGUN PICKUP', spawn: (w, x, y) => void spawnPickup(w, 'minigun', x, y) },
  { label: 'ROCKET PICKUP', spawn: (w, x, y) => void spawnPickup(w, 'rockets', x, y) },
  { label: 'SALVAGE', spawn: (w, x, y) => void spawnPickup(w, 'salvage', x, y) },
];
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/game/dev/spawns.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game/dev/spawns.ts src/game/dev/spawns.test.ts
git commit -m "feat: dev sandbox spawn registry"
```

---

### Task 4: Spawn menu state machine

**Files:**
- Create: `src/game/dev/spawnmenu.ts`
- Test: `src/game/dev/spawnmenu.test.ts`

**Interfaces:**
- Consumes: nothing (pure).
- Produces (Task 7 relies on these exactly):

```ts
export interface SpawnMenuState { open: boolean; cursor: number; }
export interface SpawnMenuEdges { toggle: boolean; up: boolean; down: boolean; confirm: boolean; close: boolean; }
export type SpawnMenuAction = 'none' | number; // number = registry index to spawn
export function createSpawnMenu(): SpawnMenuState;
export function tickSpawnMenu(s: SpawnMenuState, e: SpawnMenuEdges, count: number): SpawnMenuAction;
```

- [ ] **Step 1: Write the failing test**

`src/game/dev/spawnmenu.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createSpawnMenu, tickSpawnMenu, type SpawnMenuEdges } from './spawnmenu';

const idle = (): SpawnMenuEdges => ({ toggle: false, up: false, down: false, confirm: false, close: false });

describe('spawn menu', () => {
  it('toggle opens with the cursor reset, toggle again closes', () => {
    const s = createSpawnMenu();
    expect(s.open).toBe(false);
    tickSpawnMenu(s, { ...idle(), toggle: true }, 6);
    expect(s.open).toBe(true);
    expect(s.cursor).toBe(0);
    tickSpawnMenu(s, { ...idle(), toggle: true }, 6);
    expect(s.open).toBe(false);
  });

  it('up/down wrap over the entry count', () => {
    const s = createSpawnMenu();
    tickSpawnMenu(s, { ...idle(), toggle: true }, 3);
    tickSpawnMenu(s, { ...idle(), up: true }, 3);
    expect(s.cursor).toBe(2); // wrapped
    tickSpawnMenu(s, { ...idle(), down: true }, 3);
    expect(s.cursor).toBe(0);
  });

  it('confirm returns the cursor index and stays open for repeat spawns', () => {
    const s = createSpawnMenu();
    tickSpawnMenu(s, { ...idle(), toggle: true }, 6);
    tickSpawnMenu(s, { ...idle(), down: true }, 6);
    expect(tickSpawnMenu(s, { ...idle(), confirm: true }, 6)).toBe(1);
    expect(s.open).toBe(true);
  });

  it('close closes; input while closed is a no-op returning none', () => {
    const s = createSpawnMenu();
    tickSpawnMenu(s, { ...idle(), toggle: true }, 6);
    tickSpawnMenu(s, { ...idle(), close: true }, 6);
    expect(s.open).toBe(false);
    expect(tickSpawnMenu(s, { ...idle(), up: true, confirm: true }, 6)).toBe('none');
    expect(s.cursor).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/game/dev/spawnmenu.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `src/game/dev/spawnmenu.ts`**

```ts
// Pure spawn-palette state: open/closed + cursor. The sandbox scene owns
// edge detection and rendering; this module owns only the transitions.
export interface SpawnMenuState { open: boolean; cursor: number; }
export interface SpawnMenuEdges { toggle: boolean; up: boolean; down: boolean; confirm: boolean; close: boolean; }
export type SpawnMenuAction = 'none' | number;

export function createSpawnMenu(): SpawnMenuState {
  return { open: false, cursor: 0 };
}

export function tickSpawnMenu(s: SpawnMenuState, e: SpawnMenuEdges, count: number): SpawnMenuAction {
  if (e.toggle) {
    s.open = !s.open;
    if (s.open) s.cursor = 0;
    return 'none';
  }
  if (!s.open) return 'none';
  if (e.close) { s.open = false; return 'none'; }
  if (e.up) s.cursor = (s.cursor + count - 1) % count;
  if (e.down) s.cursor = (s.cursor + 1) % count;
  if (e.confirm) return s.cursor;
  return 'none';
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/game/dev/spawnmenu.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game/dev/spawnmenu.ts src/game/dev/spawnmenu.test.ts
git commit -m "feat: dev spawn palette state machine"
```

---

### Task 5: Dev key latches

**Files:**
- Create: `src/game/dev/keys.ts`
- Test: `src/game/dev/keys.test.ts`

**Interfaces:**
- Consumes: nothing engine-side.
- Produces (Tasks 7 and 9 rely on these exactly):

```ts
export type DevKey = 'sandbox' | 'explorer' | 'menu';
export interface DevKeys {
  onKey(code: string, down: boolean): void;  // testable seam
  consume(key: DevKey): boolean;             // true once per press
  attach(target: EventTarget): void;         // window keydown, preventDefault on bound keys
}
export function createDevKeys(): DevKeys;
```

Bindings: `F1` → `sandbox`, `F2` → `explorer`, `Tab` → `menu`.

- [ ] **Step 1: Write the failing test**

`src/game/dev/keys.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createDevKeys } from './keys';

describe('dev keys', () => {
  it('latches F1/F2/Tab and consumes each press exactly once', () => {
    const k = createDevKeys();
    expect(k.consume('sandbox')).toBe(false);
    k.onKey('F1', true);
    expect(k.consume('sandbox')).toBe(true);
    expect(k.consume('sandbox')).toBe(false); // consumed
    k.onKey('F2', true);
    k.onKey('Tab', true);
    expect(k.consume('explorer')).toBe(true);
    expect(k.consume('menu')).toBe(true);
  });

  it('keyup and unbound keys do not latch', () => {
    const k = createDevKeys();
    k.onKey('F1', false);
    k.onKey('KeyQ', true);
    expect(k.consume('sandbox')).toBe(false);
    expect(k.consume('explorer')).toBe(false);
    expect(k.consume('menu')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/game/dev/keys.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `src/game/dev/keys.ts`**

```ts
// Dev-only key latches (F1/F2/Tab). Separate from engine input so the
// engine's binding table never carries dev keys into the prod build.
export type DevKey = 'sandbox' | 'explorer' | 'menu';

const BINDINGS: Record<string, DevKey> = { F1: 'sandbox', F2: 'explorer', Tab: 'menu' };

export interface DevKeys {
  onKey(code: string, down: boolean): void;
  consume(key: DevKey): boolean;
  attach(target: EventTarget): void;
}

export function createDevKeys(): DevKeys {
  const latched: Record<DevKey, boolean> = { sandbox: false, explorer: false, menu: false };
  const onKey = (code: string, down: boolean): void => {
    const key = BINDINGS[code];
    if (key && down) latched[key] = true;
  };
  return {
    onKey,
    consume(key) {
      const seen = latched[key];
      latched[key] = false;
      return seen;
    },
    attach(target) {
      target.addEventListener('keydown', (e) => {
        const ke = e as KeyboardEvent;
        if (BINDINGS[ke.code]) ke.preventDefault(); // Tab must not move focus
        onKey(ke.code, true);
      });
    },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/game/dev/keys.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game/dev/keys.ts src/game/dev/keys.test.ts
git commit -m "feat: dev key latches (F1/F2/Tab)"
```

---

### Task 6: Sprite catalog classifier

**Files:**
- Create: `src/game/dev/catalog.ts`
- Test: `src/game/dev/catalog.test.ts`

**Interfaces:**
- Consumes: `PixelGrid`, `SpriteDef`, `LayeredSprite` types from `src/engine/sprite.ts`. Note: `SpriteDef` is `{ frames: PixelGrid[]; anchors: Record<string, readonly [number, number]> }`; `PixelGrid` is `{ width: number; height: number; rgba: Uint8ClampedArray }`; `LayeredSprite` is `{ layers: Layer[] }` with `layers[0].def` a `SpriteDef`.
- Produces (Task 8 relies on these exactly):

```ts
export type CatalogEntry =
  | { name: string; file: string; kind: 'def'; def: SpriteDef }
  | { name: string; file: string; kind: 'layered'; layered: LayeredSprite }
  | { name: string; file: string; kind: 'strip'; frames: PixelGrid[] };
export function buildCatalog(modules: Record<string, Record<string, unknown>>): CatalogEntry[];
```

`modules` is shaped like an eager `import.meta.glob` result: file path → module namespace. Entries are sorted by file, then export name. Factory functions (`createBoat` etc.), numbers, and other exports are ignored.

- [ ] **Step 1: Write the failing test**

`src/game/dev/catalog.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { parseGrid, type SpriteDef } from '../../engine/sprite';
import { PALETTE } from '../palette';
import { buildCatalog } from './catalog';

const grid = () => parseGrid(['11', '11'], PALETTE);
const def = (): SpriteDef => ({ frames: [grid()], anchors: { hub: [1, 1] } });

describe('buildCatalog', () => {
  it('classifies defs, layered sprites, and grid strips; ignores the rest', () => {
    const entries = buildCatalog({
      './b.ts': {
        MY_DEF: def(),
        MY_LAYERED: { layers: [{ def: def(), frame: 0 }] },
        MY_STRIP: [grid(), grid()],
        FRAME_TICKS: 8,
        createThing: () => 0,
        EMPTY: [],
      },
      './a.ts': { OTHER_DEF: def() },
    });
    expect(entries.map((e) => [e.file, e.name, e.kind])).toEqual([
      ['./a.ts', 'OTHER_DEF', 'def'],
      ['./b.ts', 'MY_DEF', 'def'],
      ['./b.ts', 'MY_LAYERED', 'layered'],
      ['./b.ts', 'MY_STRIP', 'strip'],
    ]);
  });

  it('finds every real sprite module export without registration', () => {
    // Smoke test against a real module namespace.
    return import('../sprites/shots').then((shots) => {
      const entries = buildCatalog({ './shots.ts': { ...shots } });
      const names = entries.map((e) => e.name);
      expect(names).toContain('TRACER');
      expect(names).toContain('ENEMY_SHOT');
      expect(names).not.toContain('ENEMY_SHOT_FRAME_TICKS');
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/game/dev/catalog.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `src/game/dev/catalog.ts`**

```ts
// Duck-types module exports into explorer entries so new sprites appear
// with zero registration. Fed by import.meta.glob (dev-only).
import type { LayeredSprite, PixelGrid, SpriteDef } from '../../engine/sprite';

export type CatalogEntry =
  | { name: string; file: string; kind: 'def'; def: SpriteDef }
  | { name: string; file: string; kind: 'layered'; layered: LayeredSprite }
  | { name: string; file: string; kind: 'strip'; frames: PixelGrid[] };

function isPixelGrid(v: unknown): v is PixelGrid {
  return (
    typeof v === 'object' && v !== null &&
    typeof (v as PixelGrid).width === 'number' &&
    typeof (v as PixelGrid).height === 'number' &&
    (v as PixelGrid).rgba instanceof Uint8ClampedArray
  );
}

function isSpriteDef(v: unknown): v is SpriteDef {
  if (typeof v !== 'object' || v === null) return false;
  const d = v as SpriteDef;
  return Array.isArray(d.frames) && d.frames.length > 0 && d.frames.every(isPixelGrid) &&
    typeof d.anchors === 'object' && d.anchors !== null;
}

function isLayered(v: unknown): v is LayeredSprite {
  if (typeof v !== 'object' || v === null) return false;
  const s = v as LayeredSprite;
  return Array.isArray(s.layers) && s.layers.length > 0 && isSpriteDef(s.layers[0]?.def);
}

function isGridStrip(v: unknown): v is PixelGrid[] {
  return Array.isArray(v) && v.length > 0 && v.every(isPixelGrid);
}

export function buildCatalog(modules: Record<string, Record<string, unknown>>): CatalogEntry[] {
  const entries: CatalogEntry[] = [];
  for (const file of Object.keys(modules).sort()) {
    const mod = modules[file];
    for (const name of Object.keys(mod).sort()) {
      const value = mod[name];
      if (isSpriteDef(value)) entries.push({ name, file, kind: 'def', def: value });
      else if (isLayered(value)) entries.push({ name, file, kind: 'layered', layered: value });
      else if (isGridStrip(value)) entries.push({ name, file, kind: 'strip', frames: value });
    }
  }
  return entries;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/game/dev/catalog.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game/dev/catalog.ts src/game/dev/catalog.test.ts
git commit -m "feat: sprite catalog classifier for the dev explorer"
```

---

### Task 7: Sandbox hooks + sandbox scene

**Files:**
- Create: `src/game/dev/sandbox.ts`
- Test: `src/game/dev/sandbox.test.ts`

**Interfaces:**
- Consumes: `SandboxHooks`, `createTopScene`, `TopDeps` from `src/game/scenes/top.ts` (Task 2); `SANDBOX_SPAWNS` (Task 3); `createSpawnMenu`, `tickSpawnMenu` (Task 4); `DevKeys` (Task 5); `InputSource` from `src/engine/input.ts`.
- Produces (Task 9 relies on these exactly):

```ts
// Pure-ish hook factory, tested headlessly:
export function createSandboxHooks(input: InputSource, devKeys: DevKeys): SandboxHooks;
// Scene assembly (thin glue over createTopScene):
export interface SandboxDeps {
  input: InputSource; audio: AudioSystem; sequencer: Sequencer; camera: Camera;
  water: Tilemap; makeRng(): () => number; devKeys: DevKeys; onExit(): void;
}
export function createSandboxScene(deps: SandboxDeps): Scene;
```

- [ ] **Step 1: Write the failing test**

`src/game/dev/sandbox.test.ts` — test the hooks directly against a real `World`:

```ts
import { describe, expect, it } from 'vitest';
import { createInput } from '../../engine/input';
import { mulberry32 } from '../../engine/rng';
import { createWorld } from '../entities';
import { createDevKeys } from './keys';
import { createSandboxHooks } from './sandbox';
import { SANDBOX_SPAWNS } from './spawns';

describe('sandbox hooks', () => {
  it('is transparent while the menu is closed', () => {
    const hooks = createSandboxHooks(createInput(), createDevKeys());
    const w = createWorld(mulberry32(1));
    expect(hooks.tick(w, 320, 1000)).toBe(false);
    expect(w.enemies.countAlive()).toBe(0);
  });

  it('Tab opens (frozen), Enter spawns the selected entry at the player lane, Tab closes', () => {
    const input = createInput();
    const devKeys = createDevKeys();
    const hooks = createSandboxHooks(input, devKeys);
    const w = createWorld(mulberry32(1));

    devKeys.onKey('Tab', true);
    expect(hooks.tick(w, 320, 1000)).toBe(true); // open = frozen

    input.onKey('Enter', true);
    expect(hooks.tick(w, 320, 1000)).toBe(true); // spawn happens, stays open
    input.onKey('Enter', false);
    expect(w.enemies.countAlive() + w.pickups.countAlive()).toBe(1);

    devKeys.onKey('Tab', true);
    expect(hooks.tick(w, 320, 1000)).toBe(true); // closing tick still frozen (swallows the edge)
    expect(hooks.tick(w, 320, 1000)).toBe(false); // next tick runs free
  });

  it('cursor navigation selects other registry entries', () => {
    const input = createInput();
    const devKeys = createDevKeys();
    const hooks = createSandboxHooks(input, devKeys);
    const w = createWorld(mulberry32(1));
    devKeys.onKey('Tab', true);
    hooks.tick(w, 320, 1000);
    input.onKey('ArrowDown', true);
    hooks.tick(w, 320, 1000); // cursor -> 1 (DELTA)
    input.onKey('ArrowDown', false);
    input.onKey('Enter', true);
    hooks.tick(w, 320, 1000);
    let kind = '';
    w.enemies.forEachAlive((e) => { kind = e.enemyKind ?? ''; });
    expect(kind).toBe(SANDBOX_SPAWNS[1].label.toLowerCase()); // 'delta'
  });
});
```

(If `Enemy` names its kind field differently, mirror what `src/game/scenes/top.ts` reads: `e.enemyKind`.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/game/dev/sandbox.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `src/game/dev/sandbox.ts`**

```ts
// Dev sandbox: the real TOP scene with waves off, scroll frozen, the full
// arsenal, and a Tab spawn palette that drops any registry entry in.
import type { AudioSystem } from '../../engine/audio';
import type { InputSource } from '../../engine/input';
import { HEIGHT, WIDTH, type Camera } from '../../engine/renderer';
import type { Scene } from '../../engine/scene';
import type { Sequencer } from '../../engine/sequencer';
import type { Tilemap } from '../../engine/tilemap';
import type { World } from '../entities';
import { PALETTE } from '../palette';
import { createTopScene, type SandboxHooks } from '../scenes/top';
import type { DevKeys } from './keys';
import { createSpawnMenu, tickSpawnMenu, type SpawnMenuEdges } from './spawnmenu';
import { SANDBOX_SPAWNS } from './spawns';

const SPAWN_Y_OFFSET = 48; // px below the camera's top edge

export function createSandboxHooks(input: InputSource, devKeys: DevKeys): SandboxHooks {
  const menu = createSpawnMenu();
  // Reused every tick — no allocation in the hot loop.
  const edges: SpawnMenuEdges = { toggle: false, up: false, down: false, confirm: false, close: false };
  const prev = { up: false, down: false, start: false, pause: false };
  return {
    tick(world: World, playerX: number, camY: number): boolean {
      const s = input.state;
      const wasOpen = menu.open;
      edges.toggle = devKeys.consume('menu');
      edges.up = s.up && !prev.up;
      edges.down = s.down && !prev.down;
      edges.confirm = s.start && !prev.start;
      edges.close = s.pause && !prev.pause;
      prev.up = s.up; prev.down = s.down; prev.start = s.start; prev.pause = s.pause;
      const action = tickSpawnMenu(menu, edges, SANDBOX_SPAWNS.length);
      if (action !== 'none') {
        SANDBOX_SPAWNS[action].spawn(world, playerX, camY + SPAWN_Y_OFFSET);
      }
      // The tick a close happens still freezes, so the closing keypress
      // never leaks into gameplay (Esc would otherwise open the pause menu).
      return menu.open || wasOpen;
    },
    draw(ctx: CanvasRenderingContext2D): void {
      if (!menu.open) {
        ctx.font = '10px monospace';
        ctx.fillStyle = PALETTE[22];
        ctx.fillText('SANDBOX — TAB: SPAWN MENU', 8, HEIGHT - 8);
        return;
      }
      const w = 220;
      const h = SANDBOX_SPAWNS.length * 18 + 40;
      const x = WIDTH - w - 16;
      const y = 48;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
      ctx.fillRect(x, y, w, h);
      ctx.font = '12px monospace';
      ctx.fillStyle = PALETTE[8];
      ctx.fillText('SPAWN', x + 12, y + 20);
      ctx.font = '12px monospace';
      SANDBOX_SPAWNS.forEach((entry, i) => {
        ctx.fillStyle = menu.cursor === i ? PALETTE[8] : PALETTE[22];
        ctx.fillText((menu.cursor === i ? '> ' : '  ') + entry.label, x + 12, y + 40 + i * 18);
      });
    },
  };
}

export interface SandboxDeps {
  input: InputSource;
  audio: AudioSystem;
  sequencer: Sequencer;
  camera: Camera;
  water: Tilemap;
  makeRng(): () => number;
  devKeys: DevKeys;
  onExit(): void;
}

export function createSandboxScene(deps: SandboxDeps): Scene {
  return createTopScene({
    input: deps.input,
    audio: deps.audio,
    sequencer: deps.sequencer,
    camera: deps.camera,
    water: deps.water,
    makeRng: deps.makeRng,
    sandbox: createSandboxHooks(deps.input, deps.devKeys),
    onExit: () => deps.onExit(),
    onAbandon: () => deps.onExit(),
  });
}
```

Note: `createSandboxScene` builds hooks once at creation; the menu state persists across `enter()` calls, which is fine for a dev tool (it starts closed and re-opening is one Tab).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/game/dev/sandbox.test.ts` then `npm test && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game/dev/sandbox.ts src/game/dev/sandbox.test.ts
git commit -m "feat: dev sandbox scene with Tab spawn palette"
```

---

### Task 8: Explorer scene

**Files:**
- Create: `src/game/dev/explorer.ts`
- Test: none (draw-heavy boundary module; catalog logic was tested in Task 6; verified visually in Task 10)

**Interfaces:**
- Consumes: `buildCatalog`, `CatalogEntry` (Task 6); `rasterize`, `prepareLayered`, `drawLayered` from `src/engine/sprite.ts`; `WIDTH`, `HEIGHT` from `src/engine/renderer.ts`; `InputSource`; `PALETTE`.
- Produces (Task 9 relies on this exactly):

```ts
export interface ExplorerDeps { input: InputSource; onExit(): void; }
export function createExplorerScene(deps: ExplorerDeps): Scene;
```

- [ ] **Step 1: Implement `src/game/dev/explorer.ts`**

```ts
// Dev object explorer: auto-discovers every sprite export via
// import.meta.glob and shows it rasterized at 1x/2x/4x on a checkerboard.
// Left/Right browses; Esc exits. New sprite exports appear automatically.
import type { InputSource } from '../../engine/input';
import { HEIGHT, WIDTH } from '../../engine/renderer';
import type { Scene } from '../../engine/scene';
import {
  drawLayered, prepareLayered, rasterize,
  type PixelGrid, type PreparedLayered,
} from '../../engine/sprite';
import { PALETTE } from '../palette';
import { buildCatalog, type CatalogEntry } from './catalog';

const FRAME_TICKS = 10; // uniform preview animation rate
const ZOOMS = [1, 2, 4] as const;

interface PreparedEntry {
  frames?: HTMLCanvasElement[];      // def / strip
  layered?: PreparedLayered;         // layered
  width: number;
  height: number;
  frameCount: number;
}

export interface ExplorerDeps { input: InputSource; onExit(): void; }

export function createExplorerScene(deps: ExplorerDeps): Scene {
  const modules = import.meta.glob('../sprites/*.ts', { eager: true }) as Record<string, Record<string, unknown>>;
  const catalog = buildCatalog(modules);
  const preparedCache = new Map<CatalogEntry, PreparedEntry>();
  let index = 0;
  let ticks = 0;
  const prev = { left: false, right: false, pause: false };

  function prepare(entry: CatalogEntry): PreparedEntry {
    let p = preparedCache.get(entry);
    if (p) return p;
    if (entry.kind === 'layered') {
      const layered = prepareLayered(entry.layered);
      const base = entry.layered.layers[0].def.frames[0];
      p = { layered, width: base.width, height: base.height, frameCount: 1 };
    } else {
      const grids: PixelGrid[] = entry.kind === 'def' ? entry.def.frames : entry.frames;
      p = {
        frames: grids.map(rasterize),
        width: grids[0].width,
        height: grids[0].height,
        frameCount: grids.length,
      };
    }
    preparedCache.set(entry, p);
    return p;
  }

  function drawChecker(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
    ctx.fillStyle = '#2a2a2a';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#3a3a3a';
    for (let cy = 0; cy < h; cy += 8) {
      for (let cx = (cy / 8) % 2 === 0 ? 0 : 8; cx < w; cx += 16) {
        ctx.fillRect(x + cx, y + cy, Math.min(8, w - cx), Math.min(8, h - cy));
      }
    }
  }

  return {
    enter() {
      ticks = 0;
      prev.left = true; prev.right = true; prev.pause = true; // swallow held keys
    },
    update() {
      ticks++;
      const s = deps.input.state;
      if (s.right && !prev.right && catalog.length > 0) index = (index + 1) % catalog.length;
      if (s.left && !prev.left && catalog.length > 0) index = (index + catalog.length - 1) % catalog.length;
      if (s.pause && !prev.pause) { prev.pause = s.pause; deps.onExit(); return; }
      prev.left = s.left; prev.right = s.right; prev.pause = s.pause;
    },
    draw(ctx) {
      ctx.fillStyle = '#101418';
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
      ctx.textAlign = 'left';
      ctx.font = '12px monospace';
      ctx.fillStyle = PALETTE[8];
      ctx.fillText('OBJECT EXPLORER', 16, 24);
      ctx.fillStyle = PALETTE[22];
      ctx.font = '10px monospace';
      ctx.fillText('LEFT/RIGHT: BROWSE — ESC: TITLE', 16, 40);

      if (catalog.length === 0) {
        ctx.fillText('NO SPRITES FOUND', 16, 80);
        return;
      }
      const entry = catalog[index];
      const p = prepare(entry);
      ctx.fillStyle = PALETTE[21];
      ctx.font = '14px monospace';
      ctx.fillText(`${entry.name}  (${index + 1}/${catalog.length})`, 16, 68);
      ctx.fillStyle = PALETTE[22];
      ctx.font = '10px monospace';
      ctx.fillText(`${entry.file}  ${p.width}x${p.height}  ${entry.kind}  frames: ${p.frameCount}`, 16, 84);

      const frame = Math.floor(ticks / FRAME_TICKS) % p.frameCount;
      let x = 16;
      for (const zoom of ZOOMS) {
        const w = p.width * zoom;
        const h = p.height * zoom;
        if (x + w > WIDTH - 16) break; // zoom does not fit; skip it
        const y = 120;
        drawChecker(ctx, x, y, w, h);
        ctx.save();
        ctx.imageSmoothingEnabled = false;
        ctx.translate(x, y);
        ctx.scale(zoom, zoom);
        if (p.layered) drawLayered(ctx, p.layered, p.width / 2, p.height / 2);
        else if (p.frames) ctx.drawImage(p.frames[frame], 0, 0);
        ctx.restore();
        ctx.fillStyle = PALETTE[22];
        ctx.fillText(`${zoom}x`, x, 116);
        x += w + 24;
      }
    },
  };
}
```

Note: `drawLayered(ctx, prepared, x, y)` centers on the base sprite — check its signature in `src/engine/sprite.ts:87` while implementing and match how `src/game/scenes/top.ts` calls it (`drawLayered(ctx, assets.chopper, x, y)` where x/y is the sprite center). Adjust the translate/center math if the preview looks offset; this is a dev screen, visual verification in Task 10 is the acceptance test.

- [ ] **Step 2: Typecheck (import.meta.glob types)**

Run: `npm run typecheck`
If `import.meta.glob` or `import.meta.env` is not typed, ensure a `src/vite-env.d.ts` exists containing `/// <reference types="vite/client" />` (create it if missing — check first, Vite scaffolds usually have it).

- [ ] **Step 3: Run the full suite**

Run: `npm test && npm run typecheck`
Expected: PASS (no new tests; nothing existing may break).

- [ ] **Step 4: Commit**

```bash
git add src/game/dev/explorer.ts
git commit -m "feat: dev object explorer scene with auto-discovered sprites"
```

(Include `src/vite-env.d.ts` in the add if it was created.)

---

### Task 9: Title dev entries + main.ts wiring

**Files:**
- Create: `src/game/dev/index.ts`
- Modify: `src/game/scenes/title.ts`, `src/game/main.ts`
- Test: `src/game/scenes/title.test.ts`

**Interfaces:**
- Consumes: `createDevKeys` (Task 5), `createSandboxScene` (Task 7), `createExplorerScene` (Task 8).
- Produces:

```ts
// src/game/scenes/title.ts — TitleDeps gains:
export interface TitleDevHook {
  poll(): 'sandbox' | 'explorer' | null;
  open(screen: 'sandbox' | 'explorer'): void;
}
// TitleDeps: dev?: TitleDevHook;

// src/game/dev/index.ts:
export interface DevToolsDeps {
  input: InputSource; audio: AudioSystem; sequencer: Sequencer; camera: Camera;
  water: Tilemap; makeRng(): () => number;
  switchTo(s: Scene): void; toTitle(): void;
}
export interface DevTools { poll(): 'sandbox' | 'explorer' | null; open(screen: 'sandbox' | 'explorer'): void; }
export function createDevTools(deps: DevToolsDeps): DevTools;
```

- [ ] **Step 1: Write the failing title tests**

In `src/game/scenes/title.test.ts` (mirror its existing stub pattern for deps), add:

```ts
it('polls the dev hook and opens the picked screen without starting a run', () => {
  const opened: string[] = [];
  let pick: 'sandbox' | 'explorer' | null = null;
  const { scene, starts } = makeTitle({ // extend the existing helper with dev?: TitleDevHook
    dev: { poll: () => { const p = pick; pick = null; return p; }, open: (s) => opened.push(s) },
  });
  scene.enter();
  pick = 'sandbox';
  scene.update(1 / 60);
  expect(opened).toEqual(['sandbox']);
  expect(starts).toEqual([]); // onStart must not fire
});

it('without a dev hook, behavior is unchanged', () => {
  const { scene } = makeTitle({});
  scene.enter();
  scene.update(1 / 60); // must not throw
});
```

(`starts` = the helper's record of `onStart` calls; add it if the helper lacks one.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/game/scenes/title.test.ts`
Expected: FAIL (`dev` not in `TitleDeps`).

- [ ] **Step 3: Modify `src/game/scenes/title.ts`**

1. Export `TitleDevHook` (as above); add `dev?: TitleDevHook;` to `TitleDeps`.
2. At the top of `update()`, before `ticks++`:

```ts
const pick = deps.dev?.poll();
if (pick) {
  if (started) deps.sequencer.stop();
  started = false;
  deps.dev?.open(pick);
  return;
}
```

3. In `draw()`, just above the SEED line:

```ts
if (deps.dev) {
  ctx.font = '10px monospace';
  ctx.fillStyle = PALETTE[22];
  ctx.fillText('F1 SANDBOX · F2 EXPLORER', WIDTH / 2, 430);
}
```

Note the F1/F2 keydowns also latch the input's `anyKey`; the early `return` keeps this tick from consuming it, and `enter()` already drains stale latches when the title comes back — no extra handling needed.

- [ ] **Step 4: Implement `src/game/dev/index.ts`**

```ts
// Dev tools entry: only ever loaded via a DEV-guarded dynamic import in
// main.ts, so the whole src/game/dev/ tree is absent from prod builds.
import type { AudioSystem } from '../../engine/audio';
import type { InputSource } from '../../engine/input';
import type { Camera } from '../../engine/renderer';
import type { Scene } from '../../engine/scene';
import type { Sequencer } from '../../engine/sequencer';
import type { Tilemap } from '../../engine/tilemap';
import { createExplorerScene } from './explorer';
import { createDevKeys } from './keys';
import { createSandboxScene } from './sandbox';

export interface DevToolsDeps {
  input: InputSource;
  audio: AudioSystem;
  sequencer: Sequencer;
  camera: Camera;
  water: Tilemap;
  makeRng(): () => number;
  switchTo(s: Scene): void;
  toTitle(): void;
}

export interface DevTools {
  poll(): 'sandbox' | 'explorer' | null;
  open(screen: 'sandbox' | 'explorer'): void;
}

export function createDevTools(deps: DevToolsDeps): DevTools {
  const devKeys = createDevKeys();
  devKeys.attach(window);
  const sandbox = createSandboxScene({
    input: deps.input, audio: deps.audio, sequencer: deps.sequencer,
    camera: deps.camera, water: deps.water, makeRng: deps.makeRng,
    devKeys, onExit: () => deps.toTitle(),
  });
  const explorer = createExplorerScene({ input: deps.input, onExit: () => deps.toTitle() });
  return {
    poll() {
      if (devKeys.consume('sandbox')) return 'sandbox';
      if (devKeys.consume('explorer')) return 'explorer';
      return null;
    },
    open(screen) {
      deps.switchTo(screen === 'sandbox' ? sandbox : explorer);
    },
  };
}
```

- [ ] **Step 5: Wire `src/game/main.ts`**

After `scenes` and `makeRng` exist and the `title`/`top` scenes are created, replace the title creation with:

```ts
let devTools: import('./dev').DevTools | undefined;
const title = createTitleScene({
  input, audio, sequencer, water, seed,
  onStart: () => scenes.switchTo(top),
  dev: import.meta.env.DEV
    ? { poll: () => devTools?.poll() ?? null, open: (s) => devTools?.open(s) }
    : undefined,
});
if (import.meta.env.DEV) {
  void import('./dev').then((m) => {
    devTools = m.createDevTools({
      input, audio, sequencer, camera: renderer.camera, water, makeRng,
      switchTo: (s) => scenes.switchTo(s),
      toTitle: () => scenes.switchTo(title),
    });
  });
}
```

(`top` is declared before `title` in the current file — keep that order.)

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test && npm run typecheck`
Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add src/game/dev/index.ts src/game/scenes/title.ts src/game/scenes/title.test.ts src/game/main.ts
git commit -m "feat: wire dev sandbox and explorer behind import.meta.env.DEV"
```

---

### Task 10: Verification, prod-exclusion check, docs

**Files:**
- Modify: `docs/architecture.md`, `README.md`
- No source changes expected.

- [ ] **Step 1: Full suite + typecheck**

Run: `npm test && npm run typecheck`
Expected: PASS.

- [ ] **Step 2: Prod build excludes dev code**

```bash
npm run build
grep -rl "OBJECT EXPLORER\|SPAWN MENU\|F1 SANDBOX" dist/ || echo "CLEAN: no dev code in dist"
```

Expected: `CLEAN: no dev code in dist`. If dev strings appear in `dist/`, the dynamic import is not properly guarded — fix before proceeding.

- [ ] **Step 3: Visual verification in the dev server**

Run `npm run dev`, then verify in the browser:
- Title shows `F1 SANDBOX · F2 EXPLORER`.
- F1 → sandbox: no scroll, no waves, weapons 1–4 all selectable, missiles show 9. Tab opens the spawn palette; up/down + Enter drops a boat/delta/pickup at the player's column near the top; Esc closes the palette; Esc again pauses; ABANDON RUN returns to title with no forfeit-style score side effects (dev path uses `onExit`, not the game's abandon flow).
- F2 → explorer: browse with left/right through every sprite (chopper layers, boat, delta, shots, pickups, water tiles), animations play, 1x/2x/4x render crisp on the checkerboard, Esc returns to title.
- Rotor: chopper's rotor disc reads clearly larger (117px) in both the sandbox and a normal run.

- [ ] **Step 4: Update docs**

- `docs/architecture.md`: add a "Dev tools" section: `src/game/dev/` layout (keys, spawns, spawnmenu, sandbox, catalog, explorer, index), the `import.meta.env.DEV` dynamic-import gating in `main.ts`, the `sandbox?: SandboxHooks` seam on the TOP scene, the `dev?: TitleDevHook` seam on the title, and the spawn-registry convention (one line per new enemy). Also correct any now-stale rotor size mention (59 → 117) anywhere in the doc.
- `README.md`: under the dev commands, note: `npm run dev` exposes F1 (sandbox) / F2 (object explorer) from the title screen; these do not exist in production builds.

- [ ] **Step 5: Commit**

```bash
git add docs/architecture.md README.md
git commit -m "docs: dev sandbox + explorer tooling"
```
