# Architecture

Live reference for how the code works right now. Kept in sync with every change; see `docs/steel-talon-engine-spec.md` for the design source of truth and `CLAUDE.md` for working practices.

## Layers

Two directories, one boundary: `src/engine/` never imports from `src/game/`.

- `src/engine/` — game-agnostic. Implemented: renderer, loop, input, sprite, pool, rng, collide, audio. Stub (empty module, filled in a later milestone): `math.ts`.
- `src/game/` — Steel Talon. Implemented: `palette.ts`, `sprites/player.ts`, `sprites/boat.ts`, `sprites/shots.ts`, `entities.ts`, `sfx.ts`, `main.ts`. Stubs: `waves.ts`, `scenes/title.ts`, `scenes/top.ts`, `songs/theme.ts`.

Stub modules contain only a comment pointing at the relevant engine-spec section and `export {};`.

## Rendering: the 640x480 contract

`src/engine/renderer.ts` owns the fixed back buffer. `createRenderer(screen)` creates a hidden `<canvas>` sized 640x480 (`WIDTH`, `HEIGHT`) with `imageSmoothingEnabled = false`; game code draws only to its `ctx`. `resize()` sets the visible `screen` canvas to `window.innerWidth`/`innerHeight`. `present()` calls `computePresentation(screenW, screenH)`, which picks the largest integer scale that fits both dimensions and centers the result (letterbox), then blits the back buffer onto the screen canvas with smoothing off.

Deliberate deviation from the engine spec: the spec's snippet uses `OffscreenCanvas` for the back buffer. This implementation uses a plain hidden `<canvas>` instead, for browser compatibility and simplicity — no functional difference for a single-threaded game loop.

## Loop: fixed 60Hz timestep

`src/engine/loop.ts` implements a standard accumulator loop. `STEP = 1000 / 60` (ms). `createLoop(update, render)` returns a `Loop` with one method, `frame(now)`: it adds `min(now - last, 250)` to the accumulator (the 250ms clamp stops a backgrounded tab from spiraling into a huge catch-up), then calls `update(STEP / 1000)` in a `while (acc >= STEP - EPSILON)` loop before calling `render()` once.

`EPSILON = 1e-9` exists because `STEP` (16.6666...) isn't exactly representable in binary floating point — repeated subtraction leaves a sub-picosecond shortfall, so an exact N-step time gap would otherwise run only N-1 updates without the tolerance.

`src/game/main.ts` drives `loop.frame(now)` from `requestAnimationFrame`, tracking `now` timestamps itself. Because `frame(now)` takes an explicit timestamp, `loop.test.ts` drives it with synthetic values headlessly.

## Input

`src/engine/input.ts` defines the `Input` state shape (`up`, `down`, `left`, `right`, `fire`, `special`, `start`) and a `BINDINGS` table mapping `KeyboardEvent.code` values to those fields (arrows and WASD for movement, Z/J for fire, X/K for special, Enter for start). `createInput()` returns an `InputSource` holding one polled `state` object; `attach(target)` wires `keydown`/`keyup` listeners on the given `EventTarget` (`window` in `main.ts`) that flip booleans in `state` via `onKey`. Bound keys get `preventDefault()` on `keydown` so arrows/WASD don't scroll the page. A `blur` listener zeroes every field in `state`, so alt-tabbing away with a key held doesn't leave it stuck down. Game code reads `state` every tick; it never sees raw key events. Gamepad and touch are not implemented.

## Sprite pipeline

`src/engine/sprite.ts` splits parsing from rendering:

- `parseGrid(rows, palette)` is pure: it turns an array of equal-length strings into a `PixelGrid { width, height, rgba }`. Each character is a base-32 digit (`0`-`9`, `a`-`v`) indexing `palette`, or `.` for transparent. `rgba` is typed `Uint8ClampedArray<ArrayBuffer>` (not `SharedArrayBuffer`) so it satisfies the `ImageData` constructor's type under TypeScript 5.9 (5.7+ behavior).
- `rasterize(grid)` is browser-only: it paints a `PixelGrid` onto a small offscreen `<canvas>` via `putImageData`/`ImageData`, once at boot, and returns the canvas for repeated `drawImage` calls.
- Layered sprites: a `SpriteDef` is `{ frames, anchors }` where anchors are named pixel coordinates. A `LayeredSprite` is an ordered stack of `Layer`s (`{ def, frame, attach?, visible? }`); layer 0 is the base and each attached layer is positioned by mapping its own anchor onto a named base anchor. `visible` defaults to shown (`undefined`/`true`); setting it `false` skips the layer in `drawLayered` without removing it from the stack, so a muzzle flash can flip on and off every tick with no array edit. `layerOffsets` is pure (headlessly tested); `prepareLayered` rasterizes every frame of every layer once and also calls `layerOffsets` once, storing the result on `PreparedLayered.offsets` so per-frame draws never recompute or reallocate it. `drawLayered` reads `prepared.offsets` and blits the stack centered on a point, last layer on top. Layers animate independently via their `frame` index; adding/removing a layer (e.g. a weapon pickup) is an array edit followed by `prepareLayered`.

`src/game/palette.ts` defines `PALETTE`: DawnBringer 32, 32 hex colors, indexed 0-9 then a-v in the sprite strings.

`src/game/sprites/player.ts` builds the chopper from layers. `CHOPPER_BODY` is a single 32x32 airframe frame (no blades) with anchors `mast`, `podL`/`podR`, `muzzleL`/`muzzleR` (gun flash mount points), and `pylonL`/`pylonR` (empty hardpoints for a future missile-pickup milestone). `ROCKET_POD` (gray pod, red rocket tips) attaches once per wing. `CHOPPER_ROTOR` is a 28x28 two-frame blur disc (`+` then `x`, so the rotor reads as spinning top-down) attached hub-to-mast. `MISSILE` is defined but unattached. `createChopper()` returns a 6-layer stack: body, two pods, rotor, and two `MUZZLE_FLASH` layers (one per muzzle anchor) created with `visible: false`.

`src/game/sprites/shots.ts` defines projectile visuals: `TRACER` (2x4 yellow-tipped, gunmetal-tailed bullet) and `MUZZLE_FLASH`, a two-frame flash (white/yellow star, then a smaller orange cross) whose frames alternate each shot.

`src/game/sprites/boat.ts` builds the drone-boat enemy from layers: `BOAT_HULL` (24x16, bow-down, cyan wake sparkle at the stern) plus a static `BOAT_TURRET` attached to the hull's `turret` anchor. `createBoat()` returns the 2-layer stack.

## Pools, RNG, collision (engine)

`src/engine/pool.ts` implements the fixed-size object pool the engine spec requires for zero hot-loop allocation: `createPool(size, factory)` preallocates `size` items via `factory()` (each starting `alive: false`) and returns a `Pool<T>` — `spawn()` linear-scans for a dead slot and marks it alive (returns `undefined` when full, no growth), `forEachAlive`/`countAlive` iterate only live items, `reset()` kills everything. Any `T` need only carry an `alive: boolean` field.

`src/engine/rng.ts` exports `mulberry32(seed)`, the sole PRNG for gameplay randomness — a closure returning a `() => number` in `[0, 1)`. Same seed, same sequence, forever.

`src/engine/collide.ts` exports `circlesOverlap(ax, ay, ar, bx, by, br)`: squared-distance circle-vs-circle test, no `sqrt`, strict inequality.

## Audio (engine + game)

`src/engine/audio.ts` synthesizes SFX with one oscillator + one gain node per blip, no sample files. `BlipParams { type, startFreq, endFreq, duration, volume }` describes a sound; `blipEnvelope(p)` is pure and tested — it derives attack/decay timing and clamps peak/floor gain and frequencies to safe (non-zero) ranges for `exponentialRampToValueAtTime`. `createAudio()` returns an `AudioSystem`: `unlock()` lazily creates (or resumes) the single `AudioContext` — must be called from a user gesture, per browser autoplay policy — and `blip(p)` is a no-op until unlocked; otherwise it builds an oscillator/gain pair from the envelope, starts it, and disconnects both nodes on `onended`.

`src/game/sfx.ts` defines `SFX`, a `Record` of four named `BlipParams` presets tuned by ear: `shoot` (short square downsweep), `hit` (lower square downsweep), `explode` (sawtooth, longer, deeper), `pickup` (triangle upsweep, wired in a later milestone).

## Entities (game)

`src/game/entities.ts` is the flat entity model over fixed pools (no ECS), now world-space: a `World` holds five `Pool`s — `bullets` (64, typed `Bullet`), `enemyBullets` (64, plain `Entity`), `enemies` (16, typed `Enemy`), `pickups` (16, typed `Pickup`), `particles` (256, extending `Entity` with `size`/`color`/`life` for a one-`fillRect`-per-particle render pass) — plus the seeded `rng` used for every random draw in this module. Despawn bounds are camera-relative: an entity dies once it scrolls past `camY - CAM_MARGIN` (above) or `camY + HEIGHT + CAM_MARGIN` (below), `CAM_MARGIN = 32`. Systems are plain functions over a `World`:

- `Bullet` adds `dmg`, `splash` (triggers splash damage in `collideBulletsEnemies`), `homing`, `accel`, `trail`/`trailCount` — player and (later) enemy ordnance share one shape. `Enemy` adds `enemyKind` (`'boat' | 'delta'`), `fireTimer` (boats' aimed-shot countdown), `baseX`/`hasFired` (deltas' weave/single-shot latch), `score`, `salvageChance`. `Pickup` adds `pickupKind` (`'minigun' | 'rockets' | 'crate' | 'salvage'`).
- `tickBullets(w, dt, camY)` steers `homing` bullets toward the nearest live enemy (turn rate capped at `HOMING_TURN_RATE = 3.5` rad/s, speed preserved), applies `accel` px/s² along the current velocity direction, integrates position, emits `spawnTrailSmoke` every `TRAIL_TICKS = 4` ticks when `trail` is set, then despawns on the camera band or `age > 2`. `tickEnemyBullets(w, dt, camY)` only integrates and despawns on the same band (no homing/accel/trail). `tickEnemies(w, dt, camY, player)` ages and moves each enemy, then fires enemy-side behaviors: boats integrate straight-line velocity, count down `fireTimer`, and — once it elapses while the boat is inside the visible camera band (`camY <= pos.y <= camY + HEIGHT`) — spawn one aimed `enemyBullets` shot at speed 140 toward `player` (straight down if the player sits exactly on the boat) and reset `fireTimer = 2.0 + rng() * 0.8`; deltas overwrite `pos.x = baseX + sin(age * 2.2) * 28` every tick (a pure function of `age`, `vel.x` stays 0), integrate `pos.y`, and once (`hasFired` latches) fire a straight-down `enemyBullets` shot `vel (0, 200)` when `|player.y - pos.y| < 220`. Both despawn below the camera band as before. `tickPickups(w, dt, camY, player)` integrates, magnetizes toward the player at `MAGNET_SPEED = 220` once within `MAGNET_RADIUS = 56` px, and despawns below the band. `tickParticles` is unchanged: integrates, applies `PARTICLE_DRAG`, despawns at `age >= life`.
- `createFireControl()` / `tickFire(w, fc, muzzles, held, dt)` gate firing at `FIRE_INTERVAL` (8 shots/sec): while `held` and off cooldown, it spawns one bullet per `Muzzle` (world-space fire point with an ejection `dir`), resetting every `Bullet` flag (`dmg = 1`, `splash`/`homing`/`trail = false`, `accel`/`trailCount = 0`) so reused pool slots never leak state, plus a shell casing particle kicked outward from the muzzle and — every third shot — a puff of smoke. Returns `true` on the tick a shot fires (the caller uses this to trigger the `shoot` SFX). `FireControl` also tracks `flashTicks`/`flashFrame` so the caller can drive the chopper's muzzle-flash layers.
- `spawnBoat`/`spawnDelta`/`spawnPickup` are typed pool-spawn helpers (boats: hp 3, radius 10, score 100, 25% salvage chance; deltas: hp 2, radius 8, score 150, 40% salvage chance; pickups: radius and drift speed vary by `PickupKind`). The interim milestone-4-6 `Spawner`/`createSpawner`/`tickSpawner` is gone — milestone 7's `waves.ts` drives spawning now; `src/game/main.ts`'s sandbox calls `spawnBoat` on a fixed 1.5s timer in the meantime.
- `collideBulletsEnemies(w)` is O(bullets × enemies) using `circlesOverlap`: each hit kills the bullet, decrements enemy hp by `b.dmg`, and spawns a small particle burst. hp reaching 0 routes through the private `killEnemy(w, e, result)` helper, shared by the direct-hit and splash paths: it marks the enemy dead, counts the kill, adds `e.score` to `result.score`, spawns a 12-particle fire burst plus 4 lingering smoke puffs, and rolls `w.rng() < e.salvageChance` to drop a `salvage` pickup at the enemy's position. When the hitting bullet has `splash` set, after the direct-hit damage a second pass over `w.enemies.forEachAlive` deals 1 damage to every other live enemy within `SPLASH_RADIUS = 24` px of the impact point, running each through `killEnemy` if it dies. Returns the module-level reused `CollisionResult` — `{ hits, kills, score }`, reset each call — so the caller can pick `hit` vs. `explode` SFX and tally score.
- Player-side collisions mirror the same `circlesOverlap` + reused-object discipline: `collideEnemyBulletsPlayer(w, player, radius, invulnerable)` and `collideEnemiesPlayer(w, player, radius, invulnerable)` both return `false` immediately when `invulnerable`, otherwise return `true` on the first overlap found (enemy bullets die on hit and spark 3 particles; rammed enemies do not die — the player bounces off, only a spark plays), stopping after one hit per call. `collidePickupsPlayer(w, player, radius, onCollect)` is callback-style to avoid allocation: on overlap the pickup dies and `onCollect(pickup.pickupKind)` fires.

## Game wiring

`src/game/main.ts` is the combat-sandbox entry point (milestones 4-6). It creates the renderer, input, and audio (`audio.unlock()` on every `keydown`, per autoplay policy — `unlock()` is idempotent so this is a no-op once the context is already running, and it keeps retrying if the browser leaves it suspended), seeds a `mulberry32` RNG from a fixed constant (`start(seed)` will replace this once the shell seam exists), and builds a `World` and `FireControl` from it (the interim spawn timer is a module-level `let spawnTimer`, not a pooled object). It prepares the layered chopper and boat sprites and the tracer bullet canvas once via `prepareLayered`/`rasterize`, and keeps direct references to the chopper's rotor layer and its two muzzle-flash layers for per-tick animation.

`update(dt)` moves the chopper from `input.state` at `SPEED = 180` px/s (diagonal movement normalized by `Math.SQRT1_2`), clamps it to the 640x480 bounds, and recomputes the two module-level `Muzzle` points in place from the body's `muzzleL`/`muzzleR` anchors and the chopper's current position — no per-tick array or object allocation. Each tick it counts down `spawnTimer` and calls `spawnBoat` at a fixed 1.5s cadence, then calls `tickBullets`/`tickEnemies`/`tickParticles` (passing `camY = 0` — the sandbox has no camera yet — and a reused module-level `PLAYER_POS` mutated from the chopper's position, to satisfy the world-space signatures) then `collideBulletsEnemies` in that order each tick; `collideBulletsEnemies` likewise returns a single module-level `CollisionResult` it resets and mutates each call, so callers must read it before the next tick rather than retain the reference. It plays `SFX.shoot` on a fired shot, `SFX.explode` on a kill (else `SFX.hit` on a non-lethal hit), and drives the two muzzle-flash layers' `visible`/`frame` from `FireControl.flashTicks`/`flashFrame`. The rotor layer's frame comes from `Math.floor(ticks / 4) % rotorLayer.def.frames.length`.

`render()` clears the back buffer, draws every live enemy (`drawLayered` with the boat) and bullet (`ctx.drawImage` of the pre-rasterized tracer), draws the chopper (`drawLayered`, `CHOPPER_SCALE = 1`), then every live particle as a `fillRect` in its own color/size — particles draw last so muzzle smoke and explosion sparks sit on top. An FPS counter overlays the frame; `renderer.present()` closes it out. A `requestAnimationFrame` loop tracks `now`, updates the FPS counter once per second, and calls `loop.frame(now)`.

## Testing

Tests are colocated with their source as `*.test.ts` and run with Vitest. 103 tests pass across 16 files: `src/engine/collide.test.ts`, `src/engine/pool.test.ts`, `src/engine/audio.test.ts`, `src/engine/sprite.test.ts`, `src/engine/rng.test.ts`, `src/engine/input.test.ts`, `src/engine/loop.test.ts`, `src/engine/renderer.test.ts`, `src/engine/tilemap.test.ts`, `src/engine/scene.test.ts`, `src/game/sprites/player.test.ts`, `src/game/sprites/tiles.test.ts`, `src/game/entities.test.ts`, `src/game/sprites/shots.test.ts`, `src/game/sprites/boat.test.ts`, `src/game/sfx.test.ts`. Pure logic (`computePresentation`, `parseGrid`, `layerOffsets`, the loop's accumulator math, input binding, `mulberry32`, `circlesOverlap`, `blipEnvelope`, pool spawn/reuse, every `entities.ts` system) is tested headlessly with fixed seeds, fixed inputs, and synthetic timestamps. Canvas-, Web Audio-, and `requestAnimationFrame`-dependent code (`rasterize`, `createRenderer`, `AudioContext` construction, the `main.ts` render loop) stays thin and is verified visually/audibly in the dev server rather than under test.

## TypeScript configuration

`tsconfig.json` targets ES2022 with `strict: true` and `lib: ["ES2022", "DOM"]`. `skipLibCheck: true` is set because Vitest's bundled `.d.ts` files reference DOM lifecycle APIs not present in this DOM-only lib configuration; without it, `tsc --noEmit` fails on library type-checking that has nothing to do with this project's own code.
