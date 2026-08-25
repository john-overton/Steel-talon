# Steel Talon: Operation Greenfire

A browser-based roguelike attack-helicopter shooter in the spirit of Twin Cobra, Contra, and Desert Strike — three modes (top-down shmup, side scroll, free roam) across 10 levels, with salvage-funded upgrades between runs. Built as the launch title for [Gnarcade](docs/gnarcade-concpet.md).

Everything is hand-rolled: plain TypeScript, Canvas 2D, Web Audio. No engine, no runtime dependencies, no asset files — sprites are pixel grids in source code and all audio is synthesized. The whole game targets < 200KB.

## Status

Milestones 1-10 complete: the 640x480 render contract, the fixed-timestep loop with keyboard input, the sprite pipeline (DB32 palette, layered sprites with named anchors), a scrolling water tilemap with a camera, seeded wave generation, HP/salvage/lives and a four-slot weapon system (chain gun, miniguns, rockets, homing missiles), a synthesized music sequencer with two songs, and a title screen. Current build is the Level 1 TOP-down vertical slice: boot into the title screen, press any key twice to launch, fly a seeded 3-minute run against boats and delta drones, collect pickups, and reach the segment-complete or game-over outro. Escape pauses the run with a CONTINUE / ABANDON RUN menu; abandoning forfeits the run. See `docs/steel-talon-engine-spec.md` for the build order and `docs/architecture.md` for how it all fits together.

## Repo Structure

```
docs/
  steel-talon-engine-spec.md   # technical spec: rendering, loop, audio, build order
  steel-talon-beat-sheet.md    # story, cast, and 10-level design
  gnarcade-concpet.md          # the surrounding arcade vision
  architecture.md              # live doc of how the code works
  mockups/                     # visual references (guides, not literals)
CLAUDE.md                      # working practices for AI-assisted development
src/
  engine/                      # game-agnostic: loop, renderer, sprites, audio, input, rng
  game/                        # Steel Talon: palette, sprites, songs, entities, scenes
  **/*.test.ts                 # tests colocated with their source
```

## Development

Requires Node.js (LTS).

```bash
npm install          # dev dependencies only (Vite, Vitest, TypeScript)
npm run dev          # dev server with hot reload at localhost:5173
npm run build        # static production build to dist/
npm run typecheck    # strict TypeScript check
```

`npm run dev` exposes two dev-only screens from the title screen: F1 opens a sandbox (waves off, full arsenal, spawn any enemy/pickup) and F2 opens an object explorer (browse every sprite at 1x/2x/4x). Both are loaded via a dynamic import gated on `import.meta.env.DEV` and do not exist in production builds (`npm run build`).

## Testing

Development is test-driven; the deterministic core (seeded RNG, fixed timestep, pooled entities) is designed to be tested headlessly.

```bash
npm test                                  # full test suite
npx vitest run src/engine/rng.test.ts     # a single test file
npx vitest -t "pool reuses dead bullets"  # tests matching a name
npx vitest --watch                        # watch mode
```

## Documentation

`docs/architecture.md` is the living reference for how the code works right now and is kept in sync with every change. The engine spec and beat sheet are the design source of truth; start there.
