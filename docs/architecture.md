# Architecture

Live reference for how the code works right now. Kept in sync with every change; see `docs/steel-talon-engine-spec.md` for the design source of truth and `CLAUDE.md` for working practices.

## Layers

Two directories, one boundary: `src/engine/` never imports from `src/game/`.

- `src/engine/` — game-agnostic. Implemented: renderer, loop, input, sprite. Stubs (empty modules, filled in a later milestone): `audio.ts`, `rng.ts`, `math.ts`.
- `src/game/` — Steel Talon. Implemented: `palette.ts`, `sprites/player.ts`, `main.ts`. Stubs: `entities.ts`, `waves.ts`, `scenes/title.ts`, `scenes/top.ts`, `songs/theme.ts`.

Stub modules contain only a comment pointing at the relevant engine-spec section and `export {};`.

## Rendering: the 640x480 contract

`src/engine/renderer.ts` owns the fixed back buffer. `createRenderer(screen)` creates a hidden `<canvas>` sized 640x480 (`WIDTH`, `HEIGHT`) with `imageSmoothingEnabled = false`; game code draws only to its `ctx`. `resize()` sets the visible `screen` canvas to `window.innerWidth`/`innerHeight`. `present()` calls `computePresentation(screenW, screenH)`, which picks the largest integer scale that fits both dimensions and centers the result (letterbox), then blits the back buffer onto the screen canvas with smoothing off.

Deliberate deviation from the engine spec: the spec's snippet uses `OffscreenCanvas` for the back buffer. This implementation uses a plain hidden `<canvas>` instead, for browser compatibility and simplicity — no functional difference for a single-threaded game loop.

## Loop: fixed 60Hz timestep

`src/engine/loop.ts` implements a standard accumulator loop. `STEP = 1000 / 60` (ms). `createLoop(update, render)` returns a `Loop` with one method, `frame(now)`: it adds `min(now - last, 250)` to the accumulator (the 250ms clamp stops a backgrounded tab from spiraling into a huge catch-up), then calls `update(STEP / 1000)` in a `while (acc >= STEP - EPSILON)` loop before calling `render()` once.

`EPSILON = 1e-9` exists because `STEP` (16.6666...) isn't exactly representable in binary floating point — repeated subtraction leaves a sub-picosecond shortfall, so an exact N-step time gap would otherwise run only N-1 updates without the tolerance.

`src/game/main.ts` drives `loop.frame(now)` from `requestAnimationFrame`, tracking `now` timestamps itself. Because `frame(now)` takes an explicit timestamp, `loop.test.ts` drives it with synthetic values headlessly.

## Input

`src/engine/input.ts` defines the `Input` state shape (`up`, `down`, `left`, `right`, `fire`, `special`, `start`) and a `BINDINGS` table mapping `KeyboardEvent.code` values to those fields (arrows and WASD for movement, Z/J for fire, X/K for special, Enter for start). `createInput()` returns an `InputSource` holding one polled `state` object; `attach(target)` wires `keydown`/`keyup` listeners on the given `EventTarget` (`window` in `main.ts`) that flip booleans in `state` via `onKey`. Game code reads `state` every tick; it never sees raw key events. Gamepad and touch are not implemented.

## Sprite pipeline

`src/engine/sprite.ts` splits parsing from rendering:

- `parseGrid(rows, palette)` is pure: it turns an array of equal-length strings into a `PixelGrid { width, height, rgba }`. Each character is a base-32 digit (`0`-`9`, `a`-`v`) indexing `palette`, or `.` for transparent. `rgba` is typed `Uint8ClampedArray<ArrayBuffer>` (not `SharedArrayBuffer`) so it satisfies the `ImageData` constructor's type under TypeScript 5.9 (5.7+ behavior).
- `rasterize(grid)` is browser-only: it paints a `PixelGrid` onto a small offscreen `<canvas>` via `putImageData`/`ImageData`, once at boot, and returns the canvas for repeated `drawImage` calls.

`src/game/palette.ts` defines `PALETTE`: DawnBringer 32, 32 hex colors, indexed 0-9 then a-v in the sprite strings.

`src/game/sprites/player.ts` defines the chopper as two 16x14 frames (`BODY_A`, `BODY_B`, identical except the rotor blur row) parsed with `parseGrid` into `CHOPPER_FRAMES: PixelGrid[]`.

## Game wiring

`src/game/main.ts` is the entry point. It creates the renderer and input, rasterizes `CHOPPER_FRAMES` once, and defines `update(dt)`/`render()` closures around a single chopper position (moved by `input.state` at `SPEED = 180` px/s, clamped to the 640x480 bounds) and a rotor-flap animation (`Math.floor(ticks / 4) % 2` selects the frame). `render()` clears the back buffer, draws the current chopper frame, overlays an FPS counter, and calls `renderer.present()`. A `requestAnimationFrame` loop tracks `now`, updates an FPS counter once per second, and calls `loop.frame(now)`.

## Testing

Tests are colocated with their source as `*.test.ts` (e.g. `src/engine/loop.test.ts`, `src/game/sprites/player.test.ts`) and run with Vitest. 21 tests pass across 5 files: `src/engine/input.test.ts`, `src/engine/loop.test.ts`, `src/engine/renderer.test.ts`, `src/engine/sprite.test.ts`, `src/game/sprites/player.test.ts`. Pure logic (`computePresentation`, `parseGrid`, the loop's accumulator math, input binding) is tested headlessly with fixed inputs and synthetic timestamps. Canvas- and `requestAnimationFrame`-dependent code (`rasterize`, `createRenderer`, the `main.ts` render loop) stays thin and is verified visually in the dev server rather than under test.

## TypeScript configuration

`tsconfig.json` targets ES2022 with `strict: true` and `lib: ["ES2022", "DOM"]`. `skipLibCheck: true` is set because Vitest's bundled `.d.ts` files reference DOM lifecycle APIs not present in this DOM-only lib configuration; without it, `tsc --noEmit` fails on library type-checking that has nothing to do with this project's own code.
