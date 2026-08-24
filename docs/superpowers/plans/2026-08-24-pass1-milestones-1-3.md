# Steel Talon Pass 1 (Milestones 1–3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold the project and implement build-order milestones 1–3: the 640x480 render contract with FPS counter, the fixed 60Hz timestep loop with keyboard input driving a test rect, and the sprite pipeline showing the chopper with an animated rotor.

**Architecture:** Two layers with a hard boundary: `src/engine/` (game-agnostic: renderer, loop, input, sprite rasterizer) and `src/game/` (palette, sprites, main wiring). All drawing targets a hidden 640x480 back-buffer canvas presented with integer scaling and smoothing off. Pure logic (scale math, accumulator, input state, grid parsing) is headlessly tested; canvas/rAF code stays thin and is verified in the dev server.

**Tech Stack:** TypeScript (strict), Vite, Vitest, Canvas 2D. Zero runtime dependencies.

## Global Constraints

- All work on branch `pass/milestones-1-3` (create in Task 1; every task commits to it).
- Zero runtime dependencies; dev dependencies only `vite`, `typescript`, `vitest`.
- TypeScript strict mode; no `any` in committed code.
- Nothing in `src/engine/` may import from `src/game/`.
- Back buffer is a hidden 640x480 `<canvas>` element (deliberate deviation from spec's `OffscreenCanvas` snippet), fixed forever; game code never sees the window size.
- Never `Math.random()`, `Date.now()`, or `performance.now()` inside update logic.
- Tests are colocated: `src/engine/foo.test.ts` next to `src/engine/foo.ts`.
- Do NOT update `docs/architecture.md` or `README.md` until Task 8 (agreed pass-level docs discipline for this solo repo).
- Files not covered by a task stay as typed stubs (`export {};` + one comment line). Do not implement ahead.

---

### Task 1: Branch and project scaffold

**Files:**
- Create: `package.json`, `tsconfig.json`, `index.html`, `.gitignore`
- Create (stubs): `src/engine/loop.ts`, `src/engine/renderer.ts`, `src/engine/sprite.ts`, `src/engine/audio.ts`, `src/engine/input.ts`, `src/engine/rng.ts`, `src/engine/math.ts`, `src/game/palette.ts`, `src/game/entities.ts`, `src/game/waves.ts`, `src/game/main.ts`, `src/game/sprites/player.ts`, `src/game/songs/theme.ts`, `src/game/scenes/title.ts`, `src/game/scenes/top.ts`

**Interfaces:**
- Consumes: nothing (first task).
- Produces: a repo where `npm install`, `npm run typecheck`, and `npm run build` succeed; every later task fills in a stub file.

- [ ] **Step 1: Create the branch**

```bash
git checkout -b pass/milestones-1-3
```

- [ ] **Step 2: Write config files**

`package.json`:

```json
{
  "name": "steel-talon",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "vite": "^6.0.0",
    "vitest": "^3.0.0"
  }
}
```

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM"],
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "noEmit": true
  },
  "include": ["src"]
}
```

`index.html`:

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Steel Talon: Operation Greenfire</title>
  <style>
    html, body { margin: 0; height: 100%; background: #000; overflow: hidden; }
    canvas { display: block; }
  </style>
</head>
<body>
  <canvas id="screen"></canvas>
  <script type="module" src="/src/game/main.ts"></script>
</body>
</html>
```

`.gitignore`:

```
node_modules/
dist/
```

- [ ] **Step 3: Write stub files**

Every stub file listed above gets exactly this shape (adjust the comment to the file):

```ts
// Stub — implemented in a later milestone (see docs/steel-talon-engine-spec.md §8).
export {};
```

Exception: `src/game/main.ts` must be a valid entry point so `vite build` succeeds:

```ts
// Entry point — wired up milestone by milestone.
console.log('Steel Talon: scaffold OK');
```

- [ ] **Step 4: Install and verify**

Run: `npm install && npm run typecheck && npm run build`
Expected: all succeed, `dist/` produced.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json tsconfig.json index.html .gitignore src
git commit -m "chore: scaffold Vite + TypeScript + Vitest project with stub tree"
```

---

### Task 2: Milestone 1 — renderer and the 640x480 contract

**Files:**
- Modify: `src/engine/renderer.ts` (replace stub)
- Modify: `src/game/main.ts` (replace stub)
- Test: `src/engine/renderer.test.ts`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces:
  - `WIDTH = 640`, `HEIGHT = 480` (exported constants)
  - `computePresentation(screenW: number, screenH: number): { scale: number; x: number; y: number }` — pure
  - `createRenderer(screen: HTMLCanvasElement): Renderer` where `Renderer` is `{ ctx: CanvasRenderingContext2D; present(): void; resize(): void }` — `ctx` is the 640x480 back-buffer context all game drawing targets; `resize()` matches the screen canvas to `window.innerWidth/Height`.

- [ ] **Step 1: Write the failing test**

`src/engine/renderer.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { computePresentation, HEIGHT, WIDTH } from './renderer';

describe('computePresentation', () => {
  it('exports the 640x480 contract', () => {
    expect(WIDTH).toBe(640);
    expect(HEIGHT).toBe(480);
  });

  it('uses 1x at exactly 640x480 with no offset', () => {
    expect(computePresentation(640, 480)).toEqual({ scale: 1, x: 0, y: 0 });
  });

  it('picks the largest integer scale that fits', () => {
    expect(computePresentation(1920, 1080).scale).toBe(2); // 1080/480 = 2.25 → 2
    expect(computePresentation(1280, 960).scale).toBe(2);
    expect(computePresentation(3840, 2160).scale).toBe(4);
  });

  it('never goes below 1x even when the window is smaller', () => {
    expect(computePresentation(320, 240).scale).toBe(1);
  });

  it('centers with letterbox offsets', () => {
    const p = computePresentation(1920, 1080); // 2x → 1280x960 image
    expect(p.x).toBe((1920 - 1280) / 2);
    expect(p.y).toBe((1080 - 960) / 2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/engine/renderer.test.ts`
Expected: FAIL (`computePresentation` not exported).

- [ ] **Step 3: Implement renderer**

`src/engine/renderer.ts`:

```ts
// 640x480 back-buffer contract: all game drawing targets `ctx`; present()
// scales to the screen canvas by the largest integer that fits, letterboxed.
export const WIDTH = 640;
export const HEIGHT = 480;

export interface Presentation { scale: number; x: number; y: number }

export function computePresentation(screenW: number, screenH: number): Presentation {
  const scale = Math.max(1, Math.floor(Math.min(screenW / WIDTH, screenH / HEIGHT)));
  return {
    scale,
    x: (screenW - WIDTH * scale) / 2,
    y: (screenH - HEIGHT * scale) / 2,
  };
}

export interface Renderer {
  ctx: CanvasRenderingContext2D;
  present(): void;
  resize(): void;
}

export function createRenderer(screen: HTMLCanvasElement): Renderer {
  const buf = document.createElement('canvas');
  buf.width = WIDTH;
  buf.height = HEIGHT;
  const ctx = buf.getContext('2d');
  const screenCtx = screen.getContext('2d');
  if (!ctx || !screenCtx) throw new Error('Canvas 2D context unavailable');
  ctx.imageSmoothingEnabled = false;

  return {
    ctx,
    resize() {
      screen.width = window.innerWidth;
      screen.height = window.innerHeight;
    },
    present() {
      const { scale, x, y } = computePresentation(screen.width, screen.height);
      screenCtx.imageSmoothingEnabled = false;
      screenCtx.fillStyle = '#000';
      screenCtx.fillRect(0, 0, screen.width, screen.height);
      screenCtx.drawImage(buf, x, y, WIDTH * scale, HEIGHT * scale);
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/engine/renderer.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire main.ts with an FPS counter**

`src/game/main.ts`:

```ts
// Milestone 1: black 640x480 field, integer-scaled, with an FPS debug overlay.
import { createRenderer, HEIGHT, WIDTH } from '../engine/renderer';

const screen = document.getElementById('screen') as HTMLCanvasElement;
const renderer = createRenderer(screen);
renderer.resize();
window.addEventListener('resize', () => renderer.resize());

let frames = 0;
let fps = 0;
let fpsWindowStart = 0;

function draw(now: number): void {
  frames++;
  if (now - fpsWindowStart >= 1000) {
    fps = frames;
    frames = 0;
    fpsWindowStart = now;
  }
  const { ctx } = renderer;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.fillStyle = '#9badb7';
  ctx.font = '10px monospace';
  ctx.fillText(`FPS ${fps}`, 4, 12);
  renderer.present();
  requestAnimationFrame(draw);
}
requestAnimationFrame(draw);
```

- [ ] **Step 6: Verify in the dev server**

Run: `npm run dev`, open the page. Expected: black 640x480 field, crisp integer scaling, black letterbox bars, FPS counter near 60. Resize the window; the field re-letterboxes and never blurs. Then `npm run typecheck` passes.

- [ ] **Step 7: Commit**

```bash
git add src/engine/renderer.ts src/engine/renderer.test.ts src/game/main.ts
git commit -m "feat: milestone 1 - 640x480 render contract with FPS counter"
```

---

### Task 3: Fixed-timestep loop

**Files:**
- Modify: `src/engine/loop.ts` (replace stub)
- Test: `src/engine/loop.test.ts`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces:
  - `STEP` (ms per update, `1000 / 60`)
  - `createLoop(update: (dt: number) => void, render: () => void): Loop` where `Loop` is `{ frame(now: number): void }`. Callers hook `frame` to `requestAnimationFrame` themselves; tests call it with synthetic timestamps. `dt` is always `STEP / 1000` seconds. The first `frame()` call only records the baseline (no updates).

- [ ] **Step 1: Write the failing test**

`src/engine/loop.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createLoop, STEP } from './loop';

function harness() {
  const calls: string[] = [];
  const loop = createLoop(
    (dt) => calls.push(`u${dt.toFixed(4)}`),
    () => calls.push('r'),
  );
  return { calls, loop };
}

describe('createLoop', () => {
  it('runs zero updates on the first frame, renders once', () => {
    const { calls, loop } = harness();
    loop.frame(0);
    expect(calls).toEqual(['r']);
  });

  it('runs one update per elapsed STEP', () => {
    const { calls, loop } = harness();
    loop.frame(0);
    loop.frame(STEP * 3);
    expect(calls.filter((c) => c.startsWith('u'))).toHaveLength(3);
  });

  it('accumulates fractional frames until a full step fits', () => {
    const { calls, loop } = harness();
    loop.frame(0);
    loop.frame(STEP * 0.6); // 0.6 steps — no update yet
    expect(calls.filter((c) => c.startsWith('u'))).toHaveLength(0);
    loop.frame(STEP * 1.2); // now 1.2 accumulated — one update
    expect(calls.filter((c) => c.startsWith('u'))).toHaveLength(1);
  });

  it('clamps a huge frame gap to 250ms (background tab)', () => {
    const { calls, loop } = harness();
    loop.frame(0);
    loop.frame(10_000);
    expect(calls.filter((c) => c.startsWith('u'))).toHaveLength(Math.floor(250 / STEP)); // 15
  });

  it('always passes dt = STEP/1000 seconds', () => {
    const { calls, loop } = harness();
    loop.frame(0);
    loop.frame(STEP);
    expect(calls[1]).toBe(`u${(STEP / 1000).toFixed(4)}`);
  });

  it('renders exactly once per frame call', () => {
    const { calls, loop } = harness();
    loop.frame(0);
    loop.frame(STEP * 5);
    expect(calls.filter((c) => c === 'r')).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/engine/loop.test.ts`
Expected: FAIL (`createLoop` not exported).

- [ ] **Step 3: Implement loop**

`src/engine/loop.ts`:

```ts
// Fixed 60Hz timestep: update logic is deterministic and frame-rate
// independent; render runs once per animation frame. Callers drive frame()
// from requestAnimationFrame; tests drive it with synthetic timestamps.
export const STEP = 1000 / 60;
const MAX_FRAME = 250; // clamp so a background tab doesn't spiral

export interface Loop { frame(now: number): void }

export function createLoop(update: (dt: number) => void, render: () => void): Loop {
  let last: number | null = null;
  let acc = 0;
  return {
    frame(now) {
      if (last !== null) {
        acc += Math.min(now - last, MAX_FRAME);
        while (acc >= STEP) {
          update(STEP / 1000);
          acc -= STEP;
        }
      }
      last = now;
      render();
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/engine/loop.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/engine/loop.ts src/engine/loop.test.ts
git commit -m "feat: fixed 60Hz timestep loop with 250ms clamp"
```

---

### Task 4: Keyboard input

**Files:**
- Modify: `src/engine/input.ts` (replace stub)
- Test: `src/engine/input.test.ts`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces:
  - `Input` interface: `{ up: boolean; down: boolean; left: boolean; right: boolean; fire: boolean; special: boolean; start: boolean }`
  - `createInput(): InputSource` where `InputSource` is `{ state: Input; onKey(code: string, down: boolean): void; attach(target: EventTarget): void }`. `code` is a `KeyboardEvent.code` string. Game code polls `state`; `attach(window)` hooks real listeners; tests call `onKey` directly.

- [ ] **Step 1: Write the failing test**

`src/engine/input.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createInput } from './input';

describe('createInput', () => {
  it('starts with everything released', () => {
    const { state } = createInput();
    expect(state).toEqual({
      up: false, down: false, left: false, right: false,
      fire: false, special: false, start: false,
    });
  });

  it('maps arrows and WASD to the same directions', () => {
    const input = createInput();
    input.onKey('ArrowUp', true);
    expect(input.state.up).toBe(true);
    input.onKey('ArrowUp', false);
    input.onKey('KeyW', true);
    expect(input.state.up).toBe(true);
    input.onKey('KeyA', true);
    input.onKey('ArrowRight', true);
    expect(input.state.left).toBe(true);
    expect(input.state.right).toBe(true);
  });

  it('maps Z/J to fire, X/K to special, Enter to start', () => {
    const input = createInput();
    input.onKey('KeyZ', true);
    input.onKey('KeyK', true);
    input.onKey('Enter', true);
    expect(input.state.fire).toBe(true);
    expect(input.state.special).toBe(true);
    expect(input.state.start).toBe(true);
    input.onKey('KeyZ', false);
    expect(input.state.fire).toBe(false);
    input.onKey('KeyJ', true);
    expect(input.state.fire).toBe(true);
  });

  it('ignores unmapped keys', () => {
    const input = createInput();
    input.onKey('KeyQ', true);
    expect(input.state).toEqual({
      up: false, down: false, left: false, right: false,
      fire: false, special: false, start: false,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/engine/input.test.ts`
Expected: FAIL (`createInput` not exported).

- [ ] **Step 3: Implement input**

`src/engine/input.ts`:

```ts
// Keyboard polled into one state object; game code reads state, never events.
// Gamepad and touch are deferred (spec §6).
export interface Input {
  up: boolean; down: boolean; left: boolean; right: boolean;
  fire: boolean; special: boolean; start: boolean;
}

const BINDINGS: Record<string, keyof Input> = {
  ArrowUp: 'up', KeyW: 'up',
  ArrowDown: 'down', KeyS: 'down',
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
  KeyZ: 'fire', KeyJ: 'fire',
  KeyX: 'special', KeyK: 'special',
  Enter: 'start',
};

export interface InputSource {
  state: Input;
  onKey(code: string, down: boolean): void;
  attach(target: EventTarget): void;
}

export function createInput(): InputSource {
  const state: Input = {
    up: false, down: false, left: false, right: false,
    fire: false, special: false, start: false,
  };
  const onKey = (code: string, down: boolean): void => {
    const action = BINDINGS[code];
    if (action) state[action] = down;
  };
  return {
    state,
    onKey,
    attach(target) {
      target.addEventListener('keydown', (e) => onKey((e as KeyboardEvent).code, true));
      target.addEventListener('keyup', (e) => onKey((e as KeyboardEvent).code, false));
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/engine/input.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/engine/input.ts src/engine/input.test.ts
git commit -m "feat: keyboard input polled into a single state object"
```

---

### Task 5: Milestone 2 glue — keyboard-driven test rect

**Files:**
- Modify: `src/game/main.ts`

**Interfaces:**
- Consumes: `createRenderer`/`WIDTH`/`HEIGHT` (Task 2), `createLoop`/`STEP` (Task 3), `createInput` (Task 4).
- Produces: `main.ts` running the real loop; Task 7 replaces only the rect drawing/update with the chopper.

- [ ] **Step 1: Rewrite main.ts**

`src/game/main.ts`:

```ts
// Milestone 2: fixed-timestep loop moving a test rect via keyboard.
import { createInput } from '../engine/input';
import { createLoop } from '../engine/loop';
import { createRenderer, HEIGHT, WIDTH } from '../engine/renderer';

const screen = document.getElementById('screen') as HTMLCanvasElement;
const renderer = createRenderer(screen);
renderer.resize();
window.addEventListener('resize', () => renderer.resize());

const input = createInput();
input.attach(window);

const RECT_SPEED = 180; // pixels per second
const rect = { x: WIDTH / 2 - 8, y: HEIGHT / 2 - 8, w: 16, h: 16 };

function update(dt: number): void {
  if (input.state.up) rect.y -= RECT_SPEED * dt;
  if (input.state.down) rect.y += RECT_SPEED * dt;
  if (input.state.left) rect.x -= RECT_SPEED * dt;
  if (input.state.right) rect.x += RECT_SPEED * dt;
  rect.x = Math.min(Math.max(rect.x, 0), WIDTH - rect.w);
  rect.y = Math.min(Math.max(rect.y, 0), HEIGHT - rect.h);
}

let frames = 0;
let fps = 0;
let fpsWindowStart = 0;

function render(): void {
  const { ctx } = renderer;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.fillStyle = '#6abe30';
  ctx.fillRect(Math.round(rect.x), Math.round(rect.y), rect.w, rect.h);
  ctx.fillStyle = '#9badb7';
  ctx.font = '10px monospace';
  ctx.fillText(`FPS ${fps}`, 4, 12);
  renderer.present();
}

const loop = createLoop(update, render);

function frame(now: number): void {
  frames++;
  if (now - fpsWindowStart >= 1000) {
    fps = frames;
    frames = 0;
    fpsWindowStart = now;
  }
  loop.frame(now);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
```

- [ ] **Step 2: Verify in the dev server**

Run: `npm run dev`. Expected: green 16x16 rect centered; arrows and WASD move it smoothly at constant speed; it stops at the 640x480 edges; FPS ~60. Run `npm run typecheck` and `npm test` — all pass.

- [ ] **Step 3: Commit**

```bash
git add src/game/main.ts
git commit -m "feat: milestone 2 - fixed-timestep loop drives keyboard test rect"
```

---

### Task 6: Palette and sprite pipeline

**Files:**
- Modify: `src/game/palette.ts` (replace stub)
- Modify: `src/engine/sprite.ts` (replace stub)
- Test: `src/engine/sprite.test.ts`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces:
  - `PALETTE: readonly string[]` — 32 hex colors (DB32). Grid characters are base-32 digits (`0`–`9`, `a`–`v`) indexing it; `.` is transparent.
  - `PixelGrid` interface: `{ width: number; height: number; rgba: Uint8ClampedArray }` (rgba length = width × height × 4)
  - `parseGrid(rows: string[], palette: readonly string[]): PixelGrid` — pure; throws on unknown characters or ragged rows.
  - `rasterize(grid: PixelGrid): HTMLCanvasElement` — browser-only, one canvas per sprite at boot.

- [ ] **Step 1: Write the palette**

`src/game/palette.ts`:

```ts
// The single game palette: DawnBringer 32. Sprite grids index it with
// base-32 digits (0-9, a-v); '.' means transparent. Engine spec §2.
export const PALETTE: readonly string[] = [
  '#000000', '#222034', '#45283c', '#663931', // 0-3
  '#8f563b', '#df7126', '#d9a066', '#eec39a', // 4-7
  '#fbf236', '#99e550', '#6abe30', '#37946e', // 8-b
  '#4b692f', '#524b24', '#323c39', '#3f3f74', // c-f
  '#306082', '#5b6ee1', '#639bff', '#5fcde4', // g-j
  '#cbdbfc', '#ffffff', '#9badb7', '#847e87', // k-n
  '#696a6a', '#595652', '#76428a', '#ac3232', // o-r
  '#d95763', '#d77bba', '#8f974a', '#8a6f30', // s-v
];
```

- [ ] **Step 2: Write the failing test**

`src/engine/sprite.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { parseGrid } from './sprite';

const PAL = ['#000000', '#ff0000', '#00ff00'] as const;

describe('parseGrid', () => {
  it('reports width and height from the grid', () => {
    const g = parseGrid(['012', '210'], PAL);
    expect(g.width).toBe(3);
    expect(g.height).toBe(2);
    expect(g.rgba).toHaveLength(3 * 2 * 4);
  });

  it('decodes palette indices to opaque RGBA', () => {
    const g = parseGrid(['1'], PAL);
    expect([...g.rgba]).toEqual([255, 0, 0, 255]);
  });

  it('treats "." as transparent', () => {
    const g = parseGrid(['.2'], PAL);
    expect(g.rgba[3]).toBe(0); // first pixel fully transparent
    expect([...g.rgba.slice(4)]).toEqual([0, 255, 0, 255]);
  });

  it('throws on a character outside the palette', () => {
    expect(() => parseGrid(['5'], PAL)).toThrow(/palette/i);
    expect(() => parseGrid(['!'], PAL)).toThrow(/palette/i);
  });

  it('throws on ragged rows', () => {
    expect(() => parseGrid(['01', '012'], PAL)).toThrow(/row/i);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/engine/sprite.test.ts`
Expected: FAIL (`parseGrid` not exported).

- [ ] **Step 4: Implement sprite module**

`src/engine/sprite.ts`:

```ts
// Pixel-grid sprites: parseGrid is pure (headlessly testable); rasterize
// paints the result onto a small canvas once at boot (engine spec §4).
export interface PixelGrid {
  width: number;
  height: number;
  rgba: Uint8ClampedArray;
}

export function parseGrid(rows: string[], palette: readonly string[]): PixelGrid {
  const height = rows.length;
  const width = rows[0]?.length ?? 0;
  const rgba = new Uint8ClampedArray(width * height * 4);
  rows.forEach((row, y) => {
    if (row.length !== width) throw new Error(`row ${y} length ${row.length} != ${width}`);
    for (let x = 0; x < width; x++) {
      const ch = row[x];
      if (ch === '.') continue; // transparent
      const index = parseInt(ch, 32);
      const hex = Number.isNaN(index) ? undefined : palette[index];
      if (hex === undefined) throw new Error(`'${ch}' is not a palette index`);
      const o = (y * width + x) * 4;
      rgba[o] = parseInt(hex.slice(1, 3), 16);
      rgba[o + 1] = parseInt(hex.slice(3, 5), 16);
      rgba[o + 2] = parseInt(hex.slice(5, 7), 16);
      rgba[o + 3] = 255;
    }
  });
  return { width, height, rgba };
}

export function rasterize(grid: PixelGrid): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = grid.width;
  canvas.height = grid.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');
  ctx.putImageData(new ImageData(grid.rgba, grid.width, grid.height), 0, 0);
  return canvas;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/engine/sprite.test.ts`
Expected: PASS. Also `npm run typecheck` passes.

- [ ] **Step 6: Commit**

```bash
git add src/game/palette.ts src/engine/sprite.ts src/engine/sprite.test.ts
git commit -m "feat: DB32 palette and pixel-grid sprite pipeline"
```

---

### Task 7: Milestone 3 glue — chopper with animated rotor

**Files:**
- Modify: `src/game/sprites/player.ts` (replace stub)
- Modify: `src/game/main.ts` (swap rect for chopper)

**Interfaces:**
- Consumes: `PALETTE` (Task 6), `parseGrid`/`PixelGrid` (Task 6), plus Task 5's `main.ts` structure.
- Produces: `CHOPPER_FRAMES: PixelGrid[]` (2 rotor frames, same dimensions) from `src/game/sprites/player.ts`.

- [ ] **Step 1: Write the chopper sprite**

`src/game/sprites/player.ts`:

```ts
// Player chopper, top-down, two rotor frames. m = gunmetal, c = olive,
// 1 = dark, o = gray (rotor blur). Indices into PALETTE (base-32 digits).
import { parseGrid, type PixelGrid } from '../../engine/sprite';
import { PALETTE } from '../palette';

const BODY_A = [
  '.......mm.......',
  'oooooooommoooooo',
  '.......mm.......',
  '......cccc......',
  '.....cccccc.....',
  '....ccmccmcc....',
  '....cccccccc....',
  '.....cccccc.....',
  '......cccc......',
  '......1cc1......',
  '.......cc.......',
  '.......cc.......',
  '......m11m......',
  '.......11.......',
];

const BODY_B = BODY_A.map((row, y) =>
  y === 1 ? '...oooooooooo...' : row,
);

export const CHOPPER_FRAMES: PixelGrid[] = [
  parseGrid(BODY_A, PALETTE),
  parseGrid(BODY_B, PALETTE),
];
```

(All rows must be exactly 16 characters. If any `parseGrid` call throws at boot, fix the grid, not the parser.)

- [ ] **Step 2: Wire the chopper into main.ts**

Modify `src/game/main.ts` from Task 5 — replace the rect state, its `update` movement target, and the rect drawing with:

```ts
// additional imports at top:
import { rasterize } from '../engine/sprite';
import { CHOPPER_FRAMES } from './sprites/player';

// replaces `const rect = ...`:
const SPEED = 180; // pixels per second
const chopperCanvases = CHOPPER_FRAMES.map(rasterize);
const chopper = {
  x: WIDTH / 2,
  y: HEIGHT / 2,
  w: CHOPPER_FRAMES[0].width,
  h: CHOPPER_FRAMES[0].height,
};
let ticks = 0;

// replaces update():
function update(dt: number): void {
  ticks++;
  if (input.state.up) chopper.y -= SPEED * dt;
  if (input.state.down) chopper.y += SPEED * dt;
  if (input.state.left) chopper.x -= SPEED * dt;
  if (input.state.right) chopper.x += SPEED * dt;
  chopper.x = Math.min(Math.max(chopper.x, chopper.w / 2), WIDTH - chopper.w / 2);
  chopper.y = Math.min(Math.max(chopper.y, chopper.h / 2), HEIGHT - chopper.h / 2);
}

// inside render(), replaces the rect fill:
const frameIndex = Math.floor(ticks / 4) % chopperCanvases.length;
ctx.drawImage(
  chopperCanvases[frameIndex],
  Math.round(chopper.x - chopper.w / 2),
  Math.round(chopper.y - chopper.h / 2),
);
```

- [ ] **Step 3: Verify in the dev server**

Run: `npm run dev`. Expected: the chopper renders crisply, rotor flickers between the two frames (~7.5 alternations/sec), moves with arrows/WASD, clamps to screen edges. Run `npm test` and `npm run typecheck` — all pass.

- [ ] **Step 4: Commit**

```bash
git add src/game/sprites/player.ts src/game/main.ts
git commit -m "feat: milestone 3 - chopper sprite with animated rotor"
```

---

### Task 8: Docs cleanup pass

**Files:**
- Create: `docs/architecture.md` (replaces the placeholder content)
- Modify: `README.md`

**Interfaces:**
- Consumes: everything on the branch — describe the code exactly as it exists after Task 7.
- Produces: the finalized docs for this pass; the branch is ready to merge.

- [ ] **Step 1: Write docs/architecture.md**

Describe the current state only (no plans, no history). Required content, in the doc style from CLAUDE.md (short sentences, real file paths):

- The two layers: `src/engine/` (renderer, loop, input, sprite; audio/rng/math still stubs) and `src/game/` (palette, chopper sprite, main wiring; the rest stubs). Engine never imports game.
- The 640x480 contract: hidden back-buffer `<canvas>` in `src/engine/renderer.ts`, `computePresentation` integer scale + letterbox, smoothing off. **Note the deliberate deviation:** plain `<canvas>` instead of the spec snippet's `OffscreenCanvas`, chosen for compatibility and simplicity.
- The fixed 60Hz loop in `src/engine/loop.ts`: accumulator, 250ms clamp, `frame(now)` driven by rAF in `src/game/main.ts`, testable with synthetic timestamps.
- Input in `src/engine/input.ts`: bindings table, polled state object, `attach(window)`.
- Sprite pipeline: `parseGrid` (pure) + `rasterize` (boot-time canvas) in `src/engine/sprite.ts`; `PALETTE` (DB32, base-32 digit indexing, `.` transparent) in `src/game/palette.ts`; chopper frames in `src/game/sprites/player.ts`.
- Testing approach: colocated `*.test.ts`, pure logic headless, canvas/rAF verified in the dev server.

- [ ] **Step 2: Update README.md**

- Status section: replace "Pre-code" with milestones 1–3 complete (render contract, fixed-timestep loop + input, sprite pipeline; chopper on screen), milestones 4+ next.
- Repo structure: mark `src/` as present; remove "(arrives with first milestone)" phrasing; note tests are colocated `src/**/*.test.ts`.
- Verify the commands listed match `package.json` (they should already).

- [ ] **Step 3: Verify everything**

Run: `npm test && npm run typecheck && npm run build`
Expected: all pass. Check CLAUDE.md's command list against `package.json` — no changes expected; if a mismatch exists, fix CLAUDE.md too.

- [ ] **Step 4: Commit**

```bash
git add docs/architecture.md README.md
git commit -m "docs: architecture and README for milestones 1-3"
```
