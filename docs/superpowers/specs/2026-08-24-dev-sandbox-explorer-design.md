# Dev Sandbox + Object Explorer + 2x Rotor — Design

Date: 2026-08-24. Status: approved pending spec review.

## Goal

Two dev-only screens for polish work, reachable only under `npm run dev`:

1. **Sandbox** — play with the full arsenal and spawn any enemy/pickup on demand.
2. **Object explorer** — browse every sprite in the game visually, auto-discovering new ones as code is added.

Plus one cosmetic fix: double the chopper's top rotor size.

## Gating & bundle isolation

- All dev code lives in `src/game/dev/`.
- `src/game/main.ts` wires it only inside `if (import.meta.env.DEV)` via dynamic `import('./dev/...')`. Vite tree-shakes the directory out of `npm run build`: zero bytes in prod, no risk to the <200KB payload target.
- Nothing in `src/engine/` changes. The shell seam (`start(seed)` / `gameover`) is untouched.

## Title entry

- `TitleDeps` grows optional `onDevSelect?(screen: 'sandbox' | 'explorer'): void`.
- When present (dev only), the title draws two hint lines — `F1 SANDBOX · F2 EXPLORER` — and handles those keys. Every other key keeps the existing two-press any-key flow.
- When absent (prod), the title renders and behaves pixel-identically to today.

## Sandbox

Built as an option on the real TOP scene so real gameplay code is exercised as-is.

- `TopDeps` grows optional `sandbox?: true`. When set, `createTopScene`:
  - skips the wave script entirely (no `generateWaveScript` / `tickWaves`);
  - freezes scroll (scroll speed 0; water animation still runs);
  - starts the run with all weapons granted and missiles pinned at 9;
  - on death, respawns in place with invuln instead of consuming lives / ending the run — the sandbox never reaches gameover;
  - never reaches the level-complete outro (no level end without scroll).
- **Spawn palette:** Tab opens an overlay that freezes the tick (same pattern as pause). Up/Down navigates a list of everything spawnable; Enter spawns the pick near the top of the screen at the player's x lane; Tab/Esc closes.
- The list comes from a registry in `src/game/dev/spawns.ts`: `{ label, spawn(world, x, y) }[]` covering boat, delta, missile crate, minigun pickup, rocket pickup. Spawn signatures differ across entity kinds, so this is an explicit one-line-per-entry registry, not auto-discovery. Adding a future enemy = one registry line.
- Exit to title through the existing pause menu (ABANDON RUN path, no score submission).
- Sandbox spawning uses the scene's seeded rng stream; no `Math.random()`.

## Object explorer

A standalone scene in `src/game/dev/explorer.ts`.

- **Auto-discovery:** `import.meta.glob('../sprites/*.ts', { eager: true })`, then duck-type each module export:
  - object with `rows: string[]` or `frames` → `SpriteDef`;
  - object with `layers` → `LayeredSprite`;
  - array of grids/defs (e.g. `WATER_TILES`) → animation strip.
  - everything else (functions, numbers) ignored.
- New sprite files and exports appear with zero registration. `import.meta.glob` is a Vite-only construct, which is fine: the module never ships.
- **UI:** browse entries with arrow keys; each entry shows export name, source file, pixel dimensions, and the sprite rasterized at 1x/2x/4x on a checkerboard. Multi-frame entries animate at a sensible default frame-tick rate. Esc returns to title.
- The classification logic (module map → typed entry list) is a pure function in its own module so it tests headlessly.

## Rotor 2x (cosmetic)

`CHOPPER_ROTOR` in `src/game/sprites/player.ts` is generated procedurally from constants. Double them:

- `ROTOR_SIZE` 59 → 117, `ROTOR_HUB` 29 → 58 (hub stays centered);
- `BLADE_MIN`/`BLADE_MAX` 5/28 → 10/56;
- `BLUR_ARCS` radii 27/19 → 54/38 (dash periods scale roughly with circumference);
- blade tip/chord thresholds (22, 24) and hub Manhattan radii scale ×2.

No layer or anchor changes — the rotor still attaches `hub` → `mast`. Verified visually (the explorer makes this easy).

## Testing (TDD, headless)

Write failing tests first for the pure parts:

- Sandbox: run starts with all weapons + 9 missiles; scroll stays frozen; death respawns without consuming lives; spawn registry entries actually spawn into a `World`.
- Spawn palette: open/close/navigate/select state transitions.
- Explorer: classification function, fed a fake module map, finds defs/layered/animations and ignores non-sprite exports.
- Rotor: frame dimensions are 117×117 and hub anchor at [58, 58].

Canvas drawing stays thin and is verified visually in the dev server.

## Docs

- `docs/architecture.md`: add a "Dev tools" section (gating, both screens, registry).
- `README.md`: note F1/F2 dev screens under `npm run dev`.
