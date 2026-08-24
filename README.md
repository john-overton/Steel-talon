# Steel Talon: Operation Greenfire

A browser-based roguelike attack-helicopter shooter in the spirit of Twin Cobra, Contra, and Desert Strike — three modes (top-down shmup, side scroll, free roam) across 10 levels, with salvage-funded upgrades between runs. Built as the launch title for [Gnarcade](docs/gnarcade-concpet.md).

Everything is hand-rolled: plain TypeScript, Canvas 2D, Web Audio. No engine, no runtime dependencies, no asset files — sprites are pixel grids in source code and all audio is synthesized. The whole game targets < 200KB.

## Status

Pre-code. The repo currently holds the design and technical documentation; the engine is built next, milestone by milestone.

## Repo Structure

```
docs/
  steel-talon-engine-spec.md   # technical spec: rendering, loop, audio, build order
  steel-talon-beat-sheet.md    # story, cast, and 10-level design
  gnarcade-concpet.md          # the surrounding arcade vision
  architecture.md              # live doc of how the code works (arrives with first code)
  mockups/                     # visual references (guides, not literals)
CLAUDE.md                      # working practices for AI-assisted development
src/                           # (arrives with first milestone)
  engine/                      # game-agnostic: loop, renderer, sprites, audio, input, rng
  game/                        # Steel Talon: palette, sprites, songs, entities, scenes
```

## Development

Requires Node.js (LTS). Once the project is scaffolded:

```bash
npm install          # dev dependencies only (Vite, Vitest, TypeScript)
npm run dev          # dev server with hot reload at localhost:5173
npm run build        # static production build to dist/
npm run typecheck    # strict TypeScript check
```

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
