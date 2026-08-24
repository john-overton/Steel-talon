# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

Steel Talon: Operation Greenfire — a browser-based roguelike attack-helicopter shooter (top-down shmup, side scroll, and free-roam modes) and the proof-of-concept launch title for the Gnarcade virtual arcade. This repo covers the game only: it must run standalone from a static folder with zero runtime dependencies.

The repo currently contains documentation only. Code is built milestone by milestone per the build order in `docs/steel-talon-engine-spec.md`.

## Documentation Map

Read these before starting work; they are the source of truth in this order:

1. `docs/architecture.md` — **the live bible.** Documents how the application works *right now*. It always exists once code exists, and it is never allowed to drift from the code. (Not yet created; create it with the first code milestone.)
2. `docs/steel-talon-engine-spec.md` — technical spec: core decisions, rendering contract, loop, audio, architecture, build order.
3. `docs/steel-talon-beat-sheet.md` — story, cast, and the 10-level design with mode breakdowns and difficulty curve.
4. `docs/gnarcade-concpet.md` — the surrounding arcade vision and business context. Steel Talon must stay wrappable by the future shell.
5. `docs/mockups/` — visual references, when present. **Mockups are guides, not literals.** Match their intent (layout, tone, palette direction), not their pixels.

### Documentation discipline (non-negotiable)

- **After every change, recursively review the docs it touches** — `docs/architecture.md`, the README, and this file — and update anything now inaccurate. A change is not done while any doc describes a state that no longer exists.
- `docs/architecture.md` describes the application **in its current state**: what exists, how it fits together, how data flows. Do not record plans, alternatives considered, or decision history there — git history and the specs carry that.
- Documentation style: technical, human-readable, concise. Short sentences, real file paths, no filler.
- `README.md` is user-facing: repo structure, setup, and the commands to develop and test. Keep it accurate as commands and structure appear.

## Commands

Toolchain: TypeScript + Vite (only dev dependencies; zero runtime dependencies) with Vitest for tests. Once scaffolded:

```bash
npm run dev          # Vite dev server with hot reload
npm run build        # static production build to dist/
npm test             # run the full Vitest suite
npx vitest run src/engine/rng.test.ts   # run a single test file
npx vitest -t "pool reuses dead bullets" # run tests matching a name
npm run typecheck    # tsc --noEmit (strict mode)
```

If you add or change a script in `package.json`, update this list and the README in the same change.

## Architecture

Two layers with a hard boundary:

- `src/engine/` — game-agnostic (~600 lines total, reused for every future Gnarcade cabinet): fixed-timestep loop, 640x480 renderer, sprite rasterizer, synthesized audio, input, seeded RNG, math. Nothing in `engine/` may import from `game/`.
- `src/game/` — Steel Talon itself: palette, sprite grids, songs, entities, scenes (title/top/side/roam), seeded wave generation.

Load-bearing invariants (from the engine spec — violating any of these is a bug):

- **The 640x480 contract.** All drawing targets a fixed 640x480 offscreen buffer, presented with integer scaling and smoothing off. Game code never knows the real window size.
- **Fixed 60Hz timestep.** Update logic is deterministic and frame-rate independent. Render is decoupled.
- **Determinism.** All gameplay randomness goes through the seeded PRNG (mulberry32). Never `Math.random()`, `Date.now()`, or `performance.now()` inside update logic — seeded runs must replay identically.
- **Assets are code.** Sprites are pixel-string grids indexing the single ≤32-color palette (`game/palette.ts`), rasterized once at boot. Audio is synthesized (oscillator SFX + 4-channel sequencer). No image or sound files, ever. Total payload target < 200KB.
- **No engine, no frameworks, no ECS.** Plain TypeScript, Canvas 2D, Web Audio. Entities are one flat interface with object pools for bullets/particles. Circle-vs-circle collision; no spatial partitioning until profiling demands it.
- **Thin shell seam.** The game exposes `start(seed)` and emits `gameover(score, salvage)`. The future arcade shell wraps the game and never reaches inside; nothing else may leak across that boundary.
- **Scenes/modes** are `{ enter(), update(dt), draw(ctx) }`. TOP/SIDE/ROAM share engine and entities and differ only in camera, gravity, and spawn logic.

## Coding Practices

- **Test-driven development.** Write the failing test first, then the implementation. The deterministic core makes this practical: pure logic (RNG, pools, collision, waves, sequencer timing, entity ticks) is tested headlessly with fixed seeds and simulated ticks. Canvas/Web Audio boundary code stays thin and is verified visually/audibly in the dev server.
- **Everything is a component.** Each object, system, sound, engine feature, and fragment lives in its own module with a small explicit interface, reusable and testable in isolation. If a piece can't be used or tested without dragging in neighbors, its boundary is wrong.
- **TypeScript strict mode.** Types are the documentation; no `any` in committed code.
- **Small, runnable milestones.** Follow the build order in the engine spec: each step is complete, runnable, and understood before the next begins. Do not scaffold ahead of the current milestone.
- **No allocation in the hot loop.** Bullets and particles come from pools; steady-state gameplay should not churn the GC.
- **Tone.** Player-facing text (briefings, taunts, HUD copy) follows the beat sheet's voice: late-80s action movie, sincere with a wink.
