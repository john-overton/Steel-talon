# Pass 6 Design: Procedural Island Terrain + Title Flyover

Date: 2026-08-25. Base: `main` (passes 1-5 merged).

Two goals: (1) a seeded procedural island terrain system for TOP mode — smooth coastlines, elevation bands (water → beach → grass → jungle → rock), animated coastal waves, and scenery decorations (trees, villages, rocks); (2) rework the title screen into an attract-mode flyover showcasing that terrain, with the chopper banking over a per-boot archipelago.

The 640x480 buffer, engine/game boundary, determinism rules, pixel-string asset format, and zero-runtime-dependency constraint are unchanged. All new gameplay-visible logic is pure and seeded; nothing uses `Math.random()`, `Date.now()`, or `performance.now()`.

## 1. Island field — `src/game/terrain/field.ts`

A pure, seeded scalar field: `elevation(x, y, seed) → number` in [0, 1], where higher = more inland/elevated.

**Plots.** The world is an infinite grid of 5000x5000-unit plots. Each plot hashes `(plotCol, plotRow, seed)` (same integer-hash style as `cellHash` in `sprites/tiles.ts`) to derive, deterministically:

- **Occupied or open water.** Not every plot has land; open-water plots keep the archipelago from feeling like a checkerboard.
- **Shape archetype:** one of `round` (blob), `crescent` (caldera arc), `snake` (elongated winding ridge), `chain` (2–5 small mixed islands scattered inside the plot).
- **Size scale:** island footprint covers ~10% to ~95% of the plot, continuous range.
- **Rotation and center jitter** so islands don't align to the plot grid.

**Shapes.** Each archetype is a smooth signed-distance-style function of local plot coordinates (circle SDF; arc SDF for crescent; a polyline-of-arcs spine with radius falloff for snake; a min() of several small round/crescent SDFs for chain). Distance maps to elevation by a smooth falloff.

**Coastline warp.** Two to three octaves of seeded value noise (bilinear-interpolated lattice hash — same hash family, no simplex/perlin library) perturb the input coordinates before SDF evaluation. This is what turns mathematical circles into natural, undulating coastlines. Warp amplitude scales with island size so small islands don't dissolve.

**Bands.** Ordered elevation thresholds define terrain bands, exported as constants:

`DEEP < SHALLOW < BEACH < GRASS < JUNGLE < ROCK`

`bandAt(x, y, seed) → Band` is the single lookup the tilemap, waves, and decor all share. A plot's field must go to 0 (deep water) at its own border so islands never clip against neighboring plots; adjacent plots therefore never need to blend.

**Sampling cost.** Field evaluation is pure math (hashes + lerps + a few SDFs). Rendering samples it per 16px cell corner for the visible region only (~41x31 cells), and results for a cell are computed on the fly each frame — no caching until profiling demands it (per the no-premature-optimization rule).

## 2. Terrain tilemap — `src/game/terrain/tiles.ts` + `src/engine/tilemap.ts`

16px terrain tiles drawn **over** the existing animated 32px water tilemap. Terrain tiles exist only where the cell is at/above the beach band; open water cells draw nothing, letting the animated water show through. Shallow-water cells draw a translucent-free lighter-blue tint tile (palette `h`/`i` speckle) so reefs read from the air.

**Autotiling.** For each 16px cell, sample the band at its four corners. Marching-squares over corner bands picks one of the 16 edge/corner cases per band transition (water→beach, beach→grass, grass→jungle, jungle→rock). Transition tiles are drawn with curved pixel-art edges so coastlines and band boundaries read as smooth lines, not stair-steps.

**Tile generation.** Tiles are built in code the way water tiles are: a base fill color per band with seeded speckle texture (sand flecks on beach, grass blades, jungle understory darkening, rock cracks), plus the 16 marching-squares masks applied as curved-edge cutouts. Interior tiles get 2–3 variants picked by `cellHash` to avoid visible repetition. All rasterized once at boot.

**Rendering contract.** Terrain rendering is a `drawTerrain(ctx, camX, camY, seed, tick)` function in `game/terrain`; it uses the engine's `visibleRange` helper but does not need engine changes beyond what exists (the marching-squares picker lives game-side since band semantics are game knowledge). The engine stays game-agnostic.

## 3. Coastal waves — `src/game/terrain/waves.ts`

Animated white "snake" lines just offshore, drifting toward the coastline — the aerial-view surf look.

- **Placement:** cells in a near-shore band (elevation between SHALLOW and BEACH thresholds) may host a wave; a seeded cell hash decides presence (~1 in 6 shore cells), length (3–12 segments), and phase offset.
- **Shape:** each wave is a polyline following the local elevation contour — segments step perpendicular to the field gradient (gradient estimated by two extra field samples). Rendered as a 1–2px foam-white (`l`) line with `i` feathered ends, matching the existing foam-crest style.
- **Animation:** a ~90-tick cycle per wave, offset by its phase hash: fade in offshore → translate along the gradient (toward land) → break/fade at the shore → respawn at the start position. Purely a function of `(cell, seed, tick)` — deterministic, no state, no allocation (waves are drawn immediate-mode each frame, not pooled entities).

## 4. Decorations — `src/game/terrain/decor.ts` + `src/game/sprites/terrain-decor.ts`

Pure seeded placement of scenery sprites; no collision, no HP this pass.

- **Trees:** jungle cells may host a tree (dense) and grass cells occasionally (sparse). 2–3 canopy sizes (~12px to ~24px), layered look: dark under-canopy ring below a highlighted canopy, drawn on top of the ground so they visibly sit above terrain. Position jittered within the cell by hash.
- **Villages:** a plot-level hash picks 0–2 village sites per occupied plot, snapped to beach/grass cells near the shore. A village is a cluster of 2–5 hut sprites (~10–16px, thatched-roof palette browns/tans) around a cleared sand-path patch. A village claims a small radius in which tree placement is suppressed.
- **Rocks:** occasional boulder sprites on rock and grass bands.

`decorationsIn(x0, y0, x1, y1, seed)` returns placements for a world rect; the title and TOP scenes call it for the visible region each frame. Draw order everywhere: water → terrain tiles → waves → decorations → entities → HUD.

Placement is deterministic, so a later pass can promote specific decorations (e.g. village huts) to destructible entities without re-siting them.

## 5. Title scene rework — `src/game/scenes/title.ts`

The title becomes an attract-mode flyover of a per-boot-seeded archipelago:

- **Camera:** drifts on a slow lissajous-style wander (~25 px/s, incommensurate x/y periods so the path doesn't visibly loop), scaled so it regularly crosses island plots.
- **Chopper:** the existing prepared player sprite flies its own gentle curved path around and across the screen, rotors animating, with a soft dark ellipse shadow drawn offset below-right on the water to sell altitude (no shadow sprite exists yet; it is a simple alpha ellipse). It leans into turns by rotating the sprite canvas a few degrees toward its path tangent (the player sprite has one body frame; a ctx rotation sells the bank for now).
- **Text:** the current 55% full-screen dim is removed. The title block ("STEEL TALON" / "OPERATION GREENFIRE"), the insert-coin prompt, the forfeit notice, dev hints, and seed readout each get a soft dark backing rectangle (or subtle shadow) so they stay readable over bright terrain.
- **Flow unchanged:** two-press start, forfeit notice, F1/F2 dev hooks, seed display all behave exactly as today. The flyover seed is the boot seed shown on screen — the archipelago you admire is derived from the seed you'll fly.

## 6. TOP mode hookup — `src/game/scenes/top.ts`

`top.ts` draws water → terrain → waves → decorations at the camera position instead of bare water. Gameplay is untouched this pass: no terrain collision, spawns unchanged. (Wave generation currently scrolls a fixed-length strip; islands appear under the flight path as pure scenery.)

## 7. Testing (TDD, headless)

All logic below is pure and tested with fixed seeds before implementation code is written:

- `field.ts`: same seed → identical samples; different seeds → different plots; band thresholds strictly ordered; plot border elevation is 0; each archetype reachable and its footprint within the 10%–95% coverage range (measured by sampling); warp keeps coastlines within plot bounds.
- Marching-squares picker: all 16 corner patterns map to the correct tile case; band-pair selection correct.
- `waves.ts`: placement in-band only; deterministic across calls; animation cycle returns to start state; contour segments are finite and near-perpendicular to the gradient.
- `decor.ts`: deterministic; trees only on grass/jungle; villages only on beach/grass near shore; village radius suppresses trees; rect queries are consistent under different query windows (same world position → same decoration).
- Title scene: existing tests keep passing (flow untouched); camera/chopper paths are pure functions of ticks and asserted deterministic.

Rendering (tile art, wave look, title composition) is verified visually in the dev sandbox/explorer.

## 8. Out of scope

Terrain collision and terrain-aware spawning; destructible villages; minimap; SIDE/ROAM terrain; performance caching of field samples. Each waits for the pass that needs it. Planned immediately after this pass: proper bank frames for the player sprite (drawn left/right lean poses replacing the ctx-rotation lean, used by both the title flyover and TOP-mode strafing).
