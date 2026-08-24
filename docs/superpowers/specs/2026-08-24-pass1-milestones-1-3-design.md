# Pass 1 Design: Milestones 1–3 (Render Contract, Loop + Input, Sprites)

Approved 2026-08-24. Implements the first three milestones of the build order in
`docs/steel-talon-engine-spec.md` §8, ending with the chopper on screen with an
animated rotor.

## Process

- All work happens on branch `pass/milestones-1-3`, branched from `main`.
- Scaffold the full project up front (config plus the complete `src/` tree from
  spec §7 as typed stubs), then fill in milestone order 1 → 2 → 3.
- Test-driven for pure logic: failing test first, then implementation. Canvas
  and `requestAnimationFrame` boundary code stays thin and is verified in the
  dev server.
- Documentation (`docs/architecture.md`, `README.md`) is written in one cleanup
  pass as the final commit on the branch, before merge. This pass-level doc
  discipline is the working agreement for this solo repo.
- If subagents are used: Opus at low effort for routine tasks, Sonnet at medium
  effort for harder tasks.

## Scaffolding

- `package.json` — dev dependencies only: `vite`, `typescript`, `vitest`.
  Scripts: `dev` (vite), `build` (vite build), `test` (vitest run),
  `typecheck` (tsc --noEmit).
- `tsconfig.json` — strict mode. No `any` in committed code.
- `index.html` — a single full-window `<canvas>`, loads `src/game/main.ts` as a
  module.
- `src/` tree exactly as spec §7: `engine/` (loop, renderer, sprite, audio,
  input, rng, math) and `game/` (palette, sprites/, songs/, entities, scenes/,
  waves, main). Files beyond this pass's milestones are typed stubs only.

## Milestone 1 — Render contract

`src/engine/renderer.ts`:

- Back buffer is a hidden 640x480 `<canvas>` element (not `OffscreenCanvas` as
  the spec snippet shows — identical behavior, broader compatibility, simpler
  to reason about; the deviation is recorded in `docs/architecture.md`).
- `present(screen)` draws the buffer to the visible canvas at the largest
  integer scale that fits, centered with letterbox bars, image smoothing off.
- Scale and offset math lives in a pure function
  (`computePresentation(screenW, screenH) → { scale, x, y }`) so it is
  testable headlessly.
- Window resize resizes only the screen canvas; the buffer is 640x480 forever.
- FPS counter drawn into the buffer with `fillText` as a debug overlay (not
  game art; game text later uses sprite fonts).

Done when: `npm run dev` shows a black 640x480 field, integer-scaled and
letterboxed at any window size, with a live FPS counter.

## Milestone 2 — Fixed timestep loop and input

`src/engine/loop.ts`:

- Fixed 60Hz accumulator exactly per spec §3, including the 250ms frame-time
  clamp.
- The accumulator/step logic takes `now` as a parameter and invokes injected
  `update(dt)` / `render()` callbacks, so tests drive it with synthetic
  timestamps and count update calls; only the outer `requestAnimationFrame`
  hookup touches the browser.

`src/engine/input.ts`:

- `keydown`/`keyup` listeners write into one `Input` state object per spec §6:
  arrows + WASD movement, Z/X or J/K for fire/special, Enter for start.
- Game code polls the state object; it never sees events. Gamepad is deferred.

Proof: a keyboard-driven test rect moving at a fixed speed per tick,
deterministic and frame-rate independent.

Done when: the rect moves identically regardless of display refresh rate, and
loop/input tests pass.

## Milestone 3 — Sprite pipeline

- `src/game/palette.ts`: the single exported ≤32-color DB32-style palette.
- `src/engine/sprite.ts`, split for testability:
  - `parseGrid(grid, palette)` — pure: string grid → `{ width, height, rgba }`
    (a flat RGBA byte array). `.` is transparent; unknown characters throw.
  - a thin rasterize step that puts that data on a small canvas once at boot.
- `src/game/sprites/player.ts`: chopper pixel grid with a 2-frame rotor
  animation, drawn centered on screen, frame chosen from tick count.

Done when: the chopper renders crisply at integer scale with a spinning rotor,
and all sprite tests pass.

## Testing summary

Headless Vitest, no canvas required:

- `computePresentation`: scales at various window sizes, minimum 1x, centering.
- Loop: update counts for exact/fractional/oversized frame times; 250ms clamp.
- Input: state transitions for press/release, multiple bindings per action.
- `parseGrid`: dimensions, colors, transparency, error on unknown character.

## Out of scope for this pass

Audio, RNG use, entities/pools, scenes beyond a minimal boot path in
`main.ts`, and milestones 4+. Stub files exist but contain no logic.

## Docs cleanup pass (final commit on branch)

- Write `docs/architecture.md` describing the code as it exists (current state
  only, no plans or history), including the back-buffer deviation.
- Update `README.md` status and structure sections.
- Verify CLAUDE.md's command list still matches `package.json` (it should).
