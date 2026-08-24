# Architecture

Live reference for how the code works right now. Kept in sync with every change; see `docs/steel-talon-engine-spec.md` for the design source of truth and `CLAUDE.md` for working practices.

## Layers

Two directories, one boundary: `src/engine/` never imports from `src/game/`.

- `src/engine/` — game-agnostic. Implemented: renderer (with camera), loop, input, sprite, pool, rng, collide, audio (blips + noise), sequencer, scene, tilemap. Stub (empty module, filled when a future cabinet needs vector math): `math.ts`.
- `src/game/` — Steel Talon. `palette.ts`, `entities.ts`, `run.ts`, `weapons.ts`, `waves.ts`, `hud.ts`, `sfx.ts`, `main.ts`, `boot.ts`, `sprites/` (player, boat, delta, shots, pickups, tiles), `songs/` (title, level1), `scenes/` (title, top).

## Scene flow

`src/game/boot.ts` is the dev entry: it registers an `onGameOver` logger and calls `start(0xc0ffee)`. `src/game/main.ts`'s `start(seed)` builds the renderer, input, audio, sequencer, and the water tilemap once, creates a `SceneManager` (`src/engine/scene.ts`), and switches it to the title scene. The title scene's `onStart` switches to the TOP scene; the TOP scene's `onExit(score, salvage)` calls the game-over callback and switches back to the title scene — boot → title → top → title, looping. Each run through TOP draws a fresh RNG stream (`seed ^ (runIndex++ * 0x9e3779b9)`, `runIndex` incrementing every `enter()`) so a full replay from the boot seed is still deterministic but distinct per run.

## Rendering: the 640x480 contract

`src/engine/renderer.ts` owns the fixed back buffer. `createRenderer(screen)` creates a hidden `<canvas>` sized 640x480 (`WIDTH`, `HEIGHT`) with `imageSmoothingEnabled = false`; game code draws only to its `ctx`. `resize()` sets the visible `screen` canvas to `window.innerWidth`/`innerHeight`. `present()` calls `computePresentation(screenW, screenH)`, which picks the largest integer scale that fits both dimensions and centers the result (letterbox), then blits the back buffer onto the screen canvas with smoothing off.

`Renderer` also exposes `camera: { x, y }` — the world-space view origin. The renderer never applies it; the active scene owns and resets it (TOP sets `camera.x = 0`, `camera.y = LEVEL_LENGTH - HEIGHT` on `enter()` and scrolls `camera.y` down each tick), and all game draw code subtracts it (`draw at pos - camera`).

Deliberate deviation from the engine spec: the spec's snippet uses `OffscreenCanvas` for the back buffer. This implementation uses a plain hidden `<canvas>` instead, for browser compatibility and simplicity — no functional difference for a single-threaded game loop.

## Loop: fixed 60Hz timestep

`src/engine/loop.ts` implements a standard accumulator loop. `STEP = 1000 / 60` (ms). `createLoop(update, render)` returns a `Loop` with one method, `frame(now)`: it adds `min(now - last, 250)` to the accumulator (the 250ms clamp stops a backgrounded tab from spiraling into a huge catch-up), then calls `update(STEP / 1000)` in a `while (acc >= STEP - EPSILON)` loop before calling `render()` once.

`EPSILON = 1e-9` exists because `STEP` (16.6666...) isn't exactly representable in binary floating point — repeated subtraction leaves a sub-picosecond shortfall, so an exact N-step time gap would otherwise run only N-1 updates without the tolerance.

`main.ts`'s `start()` drives `loop.frame(now)` from a `requestAnimationFrame` callback that tracks `now` itself. Because `frame(now)` takes an explicit timestamp, `loop.test.ts` drives it with synthetic values headlessly.

## Scenes

`src/engine/scene.ts` defines `Scene { enter(); update(dt); draw(ctx) }` and a minimal `SceneManager` (`switchTo`, `update`, `draw` delegate to `current`; no stack, no transitions).

`src/game/scenes/title.ts` is the attract screen: a scrolling water backdrop under a 55%-alpha black scrim, "STEEL TALON" / "OPERATION GREENFIRE" title text, a blinking "INSERT COIN — PRESS ANY KEY" prompt, and the boot seed printed in hex. `InputSource.consumeAnyKey()` drives a two-press flow: the first keypress starts `TITLE_SONG` on the sequencer, the second stops it and calls `onStart()`.

`src/game/scenes/top.ts` is the Level 1 TOP-down vertical slice. `enter()` builds a fresh `World`, `RunState`, `WeaponState`, and wave script from `deps.makeRng()`, resets the camera to the top of the level and the player to `(WIDTH/2, camera.y + HEIGHT - 80)`, resets the chopper's flash/missile layer visibility, and starts `LEVEL1_SONG`. `update(dt)` (only while `overlay === 'playing'`) scrolls the camera at `SCROLL_SPEED`, moves the player from `input.state` at `SPEED = 180` px/s (`Math.SQRT1_2`-normalized diagonals) clamped to the screen width and the camera's vertical band, handles rising-edge weapon-select/cycle input, recomputes the five `Mounts` from the chopper body's anchors plus player position, calls `tickWeapons`, `tickWaves`, the four `tickBullets`/`tickEnemyBullets`/`tickEnemies`/`tickPickups`/`tickParticles` systems, then the collision functions, plays the matching SFX, and drives the chopper's flash/missile/rotor layers. It detects level completion when `camera.y === 0`, no enemies remain, and the wave script is exhausted, and detects game-over via `damagePlayer` returning `'gameover'` — both set `state.overlay` and start a 5-second (`OUTRO_TICKS = 300`) outro during which particles keep ticking and the score/salvage tally rolls up over `TALLY_TICKS = 120` (2s) before calling `deps.onExit(run.score, run.salvage)`. `draw(ctx)` lazily rasterizes all sprites/HUD on first call (`ensurePrepared`), draws water, pickups, enemies, enemy bullets, player bullets (rocket sprite if `dmg >= 2`, else tracer), the chopper (skipped every other 4-tick window while invulnerable, for a blink), particles, the HUD, and a centered "SEGMENT COMPLETE" / "GAME OVER" overlay with score tally during the outro.

## Input

`src/engine/input.ts` defines `Input` (`up`, `down`, `left`, `right`, `fire`, `special`, `start`, `weapon1`-`weapon4`) and a `BINDINGS` table mapping `KeyboardEvent.code` to those fields: arrows/WASD for movement, Z/J for fire, X/K for special, Enter for start, Digit1-4/Numpad1-4 for the four weapon slots. `createInput()` returns an `InputSource` holding one polled `state` object plus `consumeAnyKey()` — latched true by any keydown (bound or not) and reset on read, used by the title screen's "press any key" prompt without needing its own binding. `attach(target)` wires `keydown`/`keyup` listeners (`window` in `main.ts`) that flip booleans via `onKey`, `preventDefault()`s bound keys so arrows/WASD don't scroll the page, and a `blur` listener zeroes every field so alt-tabbing with a key held doesn't leave it stuck. Game code reads `state` every tick; it never sees raw key events. Gamepad and touch are not implemented.

## Sprite pipeline

`src/engine/sprite.ts` splits parsing from rendering:

- `parseGrid(rows, palette)` is pure: it turns an array of equal-length strings into a `PixelGrid { width, height, rgba }`. Each character is a base-32 digit (`0`-`9`, `a`-`v`) indexing `palette`, or `.` for transparent.
- `rasterize(grid)` is browser-only: it paints a `PixelGrid` onto a small offscreen `<canvas>` via `putImageData`/`ImageData`, once at boot, and returns the canvas for repeated `drawImage` calls.
- Layered sprites: a `SpriteDef` is `{ frames, anchors }` where anchors are named pixel coordinates. A `LayeredSprite` is an ordered stack of `Layer`s (`{ def, frame, attach?, visible? }`); layer 0 is the base and each attached layer is positioned by mapping its own anchor onto a named base anchor. `visible` defaults to shown; setting it `false` skips the layer in `drawLayered` without removing it from the stack. `prepareLayered` rasterizes every frame of every layer once and precomputes `layerOffsets`, storing both on `PreparedLayered` so per-frame draws never recompute or reallocate. `drawLayered` blits the stack centered on a point, last layer on top.

`src/game/palette.ts` defines `PALETTE`: DawnBringer 32, 32 hex colors, indexed 0-9 then a-v in sprite strings.

### Player chopper (`src/game/sprites/player.ts`)

`CHOPPER_BODY` is a 32x32 airframe frame with anchors `mast` (rotor hub), `podL`/`podR` (rocket pods), `muzzleL`/`muzzleR` (wing gun-flash mounts), `nose` (nose gun-flash and chain-gun fire point), and `pylonL`/`pylonR` (missile hardpoints). `ROCKET_POD` attaches once per wing. `CHOPPER_ROTOR` is a 28x28 two-frame blur disc (`+` then `x`) attached hub-to-mast. `MISSILE` hangs from a pylon by its nose. `createChopper()` returns a 9-layer `LayeredSprite`; the `LAYER` constant names each index so callers never use magic numbers:

```
LAYER.BODY = 0, POD_L = 1, POD_R = 2, ROTOR = 3,
LAYER.FLASH_L = 4, FLASH_R = 5, FLASH_NOSE = 6,
LAYER.MISSILE_L = 7, MISSILE_R = 8
```

The three `MUZZLE_FLASH` layers (wing L/R, nose) and the two `MISSILE` layers start `visible: false`; `top.ts` toggles them per tick from `WeaponState` and `RunState.missileAmmo`.

### Other sprites

`src/game/sprites/shots.ts`: `TRACER` (2x4 yellow/gunmetal bullet), `MUZZLE_FLASH` (two-frame flash, alternated per shot), `ROCKET` (2x5 white-tipped rocket in flight, drawn for any bullet with `dmg >= 2`).

`src/game/sprites/boat.ts`: `createBoat()` — a 2-layer drone-boat (24x16 hull plus a static turret on the `turret` anchor).

`src/game/sprites/delta.ts`: `createDelta()` — a 2-layer delta-wing target drone: a 24x16 `DELTA_BODY` (orange/gray livery, cyan canopy, nose at the bottom so it flies down-screen) plus a 4x3 `DELTA_JET` exhaust-flicker layer on the trailing (`tail`) anchor, two frames alternating for a flame flicker.

`src/game/sprites/pickups.ts`: `MINIGUN_PICKUP` and `ROCKET_PICKUP` are 32x32, 4-frame rotating badges — a 12x12 weapon glyph (`rotateGrid` turns it 90° per frame) ringed by a pulsing yellow/white circle. `CRATE` is a static 12x10 brass supply crate. `SALVAGE` is a 2-frame spinning gray/brass canister. `PICKUP_FRAME_TICKS = 8` and `SALVAGE_FRAME_TICKS = 15` drive their frame cadence in `top.ts`.

`src/game/sprites/tiles.ts`: `createWaterTilemap()` builds the engine's `Tilemap` from six 16x16 rasterized variants (calm/chop/foam, two shimmer frames each). `pickWaterTile(col, row, frame)` is pure and deterministic per cell: a hash of `(col, row)` picks calm (80%), chop (15%), or foam (5%), and `frame % 2` picks the shimmer phase. `WATER_FRAME_TICKS = 30` is the frame-advance rate used by scenes.

## Tilemap (engine)

`src/engine/tilemap.ts` defines `Tilemap { tileSize, tiles: CanvasImageSource[], pickTile(col, row, frame) }` — the engine only knows how to draw a repeating grid; the game supplies the rasterized tiles and the pure `pickTile`. `visibleRange(cam, view, tileSize)` returns the inclusive `[first, last]` tile indices whose span intersects the camera's visible window on one axis; `drawTilemap(ctx, map, camX, camY, viewW, viewH, frame)` calls it on both axes and draws every visible tile with `ctx.drawImage`.

## Pools, RNG, collision (engine)

`src/engine/pool.ts` implements the fixed-size object pool the engine spec requires for zero hot-loop allocation: `createPool(size, factory)` preallocates `size` items via `factory()` (each starting `alive: false`) and returns a `Pool<T>` — `spawn()` linear-scans for a dead slot and marks it alive (returns `undefined` when full, no growth), `forEachAlive`/`countAlive` iterate only live items, `reset()` kills everything.

`src/engine/rng.ts` exports `mulberry32(seed)`, the sole PRNG for gameplay randomness — a closure returning a `() => number` in `[0, 1)`. Same seed, same sequence, forever.

`src/engine/collide.ts` exports `circlesOverlap(ax, ay, ar, bx, by, br)`: squared-distance circle-vs-circle test, no `sqrt`, strict inequality.

## Audio (engine + game)

`src/engine/audio.ts` synthesizes both SFX and the sequencer's drum channel, no sample files. `BlipParams { type, startFreq, endFreq, duration, volume }` describes an oscillator blip; `blipEnvelope(p)` is pure and tested. `createAudio()` returns an `AudioSystem`: `unlock()` lazily creates/resumes the single `AudioContext` (must run from a user gesture); `blip(p)` is a no-op until unlocked. `noise(durationSec, volume, bandFreq = 800, whenSec?)` builds one white-noise `AudioBuffer` lazily and reuses it for every call, routing each burst through a bandpass filter centered on `bandFreq` so the same buffer reads as a kick, snare, or hat depending on frequency; `context()` exposes the underlying `AudioContext` (or `null` pre-unlock) so `createSequencer` can schedule against its clock.

`src/engine/sequencer.ts` is the lookahead music scheduler. A `Song` is `{ bpm, channels: [Note[], Note[], Note[], Note[]], loop }` — two square leads, one triangle bass, one noise-drum track (`Note = [freq, beats]`, `freq = 0` is a rest; for the drum channel `freq` is the bandpass center). `songBeats(song)` and `scheduleWindow(song, fromSec, toSec)` are pure and headlessly tested: `scheduleWindow` expands a song (looped or not) into the `ScheduledNote`s whose start time falls in `[fromSec, toSec)`. `createSequencer(audio)` runs a `setInterval` (`TICK_MS = 25`) lookahead loop (`LOOKAHEAD_SEC = 0.12`, `SCHEDULE_LATENCY_SEC = 0.05`) that calls `scheduleWindow` each tick and schedules each note as an oscillator+gain pair (channels 0-2) or `audio.noise()` (channel 3); if the `AudioContext` isn't unlocked yet, `play()` polls until one exists before starting.

`src/game/sfx.ts` defines `SFX`, a `Record` of six named `BlipParams` presets tuned by ear: `shoot`, `hit`, `explode`, `pickup`, plus two UI blips, `select` (weapon-switch confirm) and `deny` (switching to an unowned slot).

`src/game/songs/title.ts` and `src/game/songs/level1.ts` are the two songs: `TITLE_SONG` (96 bpm, 8-bar minor-key action sting) and `LEVEL1_SONG` (128 bpm, 16-bar Caribbean calypso groove with offbeat stabs). Each channel array sums to the same beat count within a song.

## Entities (game)

`src/game/entities.ts` is the flat entity model over fixed pools (no ECS), world-space: a `World` holds five `Pool`s — `bullets` (64, `Bullet`), `enemyBullets` (64, plain `Entity`), `enemies` (16, `Enemy`), `pickups` (16, `Pickup`), `particles` (256, `Particle` with `size`/`color`/`life`) — plus the seeded `rng` used for every random draw in this module. Despawn bounds are camera-relative: an entity dies once it scrolls past `camY - CAM_MARGIN` (above) or `camY + HEIGHT + CAM_MARGIN` (below), `CAM_MARGIN = 32`.

- `Bullet` adds `dmg`, `splash` (triggers splash damage in `collideBulletsEnemies`), `homing`, `accel`, `trail`/`trailCount`. `Enemy` adds `enemyKind` (`'boat' | 'delta'`), `fireTimer` (boats' aimed-shot countdown), `baseX`/`hasFired` (deltas' weave/single-shot latch), `score`, `salvageChance`. `Pickup` adds `pickupKind` (`'minigun' | 'rockets' | 'crate' | 'salvage'`).
- `tickBullets(w, dt, camY)` steers `homing` bullets toward the nearest live enemy (turn rate capped at `HOMING_TURN_RATE = 3.5` rad/s, speed preserved), applies `accel` px/s² along the current velocity direction, integrates position, emits `spawnTrailSmoke` every `TRAIL_TICKS = 4` ticks when `trail` is set, then despawns on the camera band or `age > 2`. `tickEnemyBullets(w, dt, camY)` only integrates and despawns on the same band. `tickEnemies(w, dt, camY, player)` ages and moves each enemy: boats integrate straight-line velocity, count down `fireTimer`, and — once it elapses while the boat is inside the visible camera band — spawn one aimed `enemyBullets` shot at speed 140 toward `player` and reset `fireTimer = 2.0 + rng() * 0.8`; deltas overwrite `pos.x = baseX + sin(age * 2.2) * 28` every tick, integrate `pos.y`, and once (`hasFired` latches) fire a straight-down shot `vel (0, 200)` when `|player.y - pos.y| < 220`. Both despawn below the camera band. `tickPickups(w, dt, camY, player)` integrates, magnetizes toward the player at `MAGNET_SPEED = 220` once within `MAGNET_RADIUS = 56` px, and despawns below the band. `tickParticles` integrates, applies `PARTICLE_DRAG`, despawns at `age >= life`.
- `spawnBoat`/`spawnDelta`/`spawnPickup` are typed pool-spawn helpers: boats (hp 3, radius 10, score 100, 25% salvage chance), deltas (hp 2, radius 8, score 150, 40% salvage chance), pickups (radius/drift speed by `PickupKind`: minigun/rockets radius 14 speed 40, crate radius 8 speed 45, salvage radius 6 speed 30).
- `collideBulletsEnemies(w)` is O(bullets × enemies) using `circlesOverlap`: each hit kills the bullet, decrements enemy hp by `b.dmg`, and spawns a small particle burst. hp reaching 0 routes through the private `killEnemy(w, e, result)` helper: it marks the enemy dead, counts the kill, adds `e.score`, spawns a fire/smoke burst, and rolls `w.rng() < e.salvageChance` for a `salvage` pickup drop. When the hitting bullet has `splash` set, a second pass deals 1 damage to every other live enemy within `SPLASH_RADIUS = 24` px of the impact point. Returns the module-level reused `CollisionResult { hits, kills, score }`, reset each call.
- `collideEnemyBulletsPlayer`, `collideEnemiesPlayer`, `collidePickupsPlayer` mirror the same `circlesOverlap` + reused-object discipline for player-side collisions; the first two return `false` immediately when `invulnerable`, otherwise `true` on the first overlap found per call. `collidePickupsPlayer` is callback-style (`onCollect(pickup.pickupKind)`) to avoid allocation.
- `Muzzle { x, y, dir }` is a world-space fire point plus which side a shell ejects. `spawnShell`, `spawnSmoke`, `spawnTrailSmoke` are particle helpers shared by `weapons.ts` and the collision/death paths.

The interim milestone-4-6 `Spawner`/`createSpawner`/`tickSpawner` and `FireControl`/`tickFire` are gone: `waves.ts` now drives spawning and `weapons.ts` now owns all firing.

## Wave generation (`src/game/waves.ts`)

`SCROLL_SPEED = 60` px/s; `LEVEL_LENGTH = 11_280` px (`HEIGHT + 180s * 60px/s` — a 3-minute level). `generateWaveScript(rng, levelLength)` builds the entire level's spawn timeline up front from the seeded RNG, as a list of `SpawnEvent { atY, kind, x }` (`kind`: `'boat' | 'delta' | 'missileCrate' | 'minigunPickup' | 'rocketPickup'`) sorted by descending `atY` (spawn Y decreases as time increases, since the camera scrolls up through the level). Five time bands drive the script: warm-up boats every ~4s (0-40s) plus one minigun pickup at 40s; boat pairs every ~6s (40-80s) plus two missile crates; deltas (every ~7s) and boats (every ~8s) join at 80-120s plus one rocket pickup; combined-arms boat trios (~10s) and delta pairs (~9s) at 120-170s plus one missile crate; a breather at 170-180s. `createWaveRunner(script)` wraps the script with a `next` cursor; `tickWaves(w, runner, camY)` drains every event whose `atY >= camY - CAM_MARGIN`, spawning the corresponding entity/pickup each tick with zero allocation.

## Weapons (`src/game/weapons.ts`)

Four-slot arsenal: slot 1 (chain gun) is always owned; slots 2-4 (miniguns, rockets, missiles) are unlocked by pickups (`RunState.hasMiniguns`/`hasRockets`/`missileAmmo`, `src/game/run.ts`). `createWeaponState()` returns `WeaponState { cooldown, flashTicks, flashFrame, shotCount, salvoLeft, salvoTick, pylonSide }`. `tickWeapons(w, run, ws, mounts, held, dt)` ticks down `cooldown`/`flashTicks`, then: if a rocket salvo is running (`salvoLeft > 0`) it fires one rocket every `SALVO_TICK_GAP = 3` ticks regardless of `held`, starting `run.rocketCooldown` when the salvo empties; otherwise, while `held` and off cooldown and the selected slot is owned, it dispatches by `run.selected`:

- **1 — chain gun**: `CHAIN_INTERVAL = 0.5s` (120 rpm), `CHAIN_DMG = 0.75`, fires from `mounts.nose`, ejects an alternating-side shell casing.
- **2 — miniguns**: `MINIGUN_INTERVAL = 0.25s` (240 rpm/barrel), `MINIGUN_DMG = 1`, fires from both `podL` and `podR` each tick, each barrel with its own shell casing.
- **3 — rockets**: starts a `SALVO_SIZE = 10`-rocket salvo (gated by `ROCKET_COOLDOWN = 20s`); each rocket launches at `ROCKET_LAUNCH_SPEED = 120` px/s with `±ROCKET_SPREAD = 4°` of angle jitter, `ROCKET_ACCEL = 900` px/s² self-acceleration, `ROCKET_DMG = 2`, alternating pylons, with a smoke trail.
- **4 — missiles**: `MISSILE_INTERVAL = 0.5s`, consumes one `run.missileAmmo`, `MISSILE_DMG = 3`, `MISSILE_SPEED = 300` px/s, `homing: true` and `splash: true` (so it both steers toward the nearest enemy and deals `SPLASH_RADIUS` area damage on impact).

`FLASH_TICKS = 2` sizes the muzzle-flash visibility window; `Mounts` is the five named `Muzzle` points (`nose`, `podL`, `podR`, `pylonL`, `pylonR`) the scene recomputes every tick from the chopper's anchors and player position.

## Run state (`src/game/run.ts`)

Pure data plus pure mutators, no engine imports: `RunState { score, lives, hp, salvage, selected, hasMiniguns, hasRockets, missileAmmo, rocketCooldown, invulnTicks }`. `createRun()` starts at 3 lives, 3 hp, slot 1 selected, no miniguns/rockets, 0 missiles. `damagePlayer(r)` returns `'shrugged'` (already invulnerable), `'hit'` (hp drops, `INVULN_HIT = 90` ticks of mercy), `'death'` (hp hit 0 with lives left: lose a life, hp resets to 3, `INVULN_RESPAWN = 180` ticks), or `'gameover'` (hp hit 0, no lives left). `collectSalvage` adds 1 salvage and 25 score. `armMissiles` adds `MISSILES_PER_PICKUP = 3` missiles capped at `MISSILE_CAP = 9`. `grantWeapon(r, 'miniguns' | 'rockets')` unlocks the slot and auto-selects it. `ownsSlot`/`selectWeapon`/`cycleWeapon` gate/rotate the four slots (slot 1 always owned). `tickRun(r, dt)` counts down `invulnTicks` (per-tick) and `rocketCooldown` (per-second).

## HUD (`src/game/hud.ts`)

`createHud()` rasterizes the `LIVES_ICON` glyph once and returns `{ draw(ctx, run) }`, which allocates nothing per frame: score (`formatScore`, 6-digit zero-padded, capped at 999999) top-left; 3 HP pips; lives icons centered top; salvage count top-right; a 4-box weapon panel bottom-left showing owned/selected state per slot, a rocket-cooldown fill bar under slot 3, and a missile-count readout next to slot 4.

## Game wiring (`src/game/main.ts`)

`src/game/main.ts` is the shell seam (engine spec §9): it exposes `start(seed)` and `onGameOver(cb)`; the future arcade shell wraps the game and only touches these two exports. `start(seed)` builds the renderer, input, audio, sequencer, and water tilemap once, derives a per-run RNG factory (`makeRng`) from the boot seed, wires the title and TOP scenes together (title → TOP on `onStart`, TOP → title on `onExit`, forwarding to the registered `gameOverCb`), and drives everything from one `requestAnimationFrame` loop calling `loop.frame(now)`. `src/game/boot.ts` is the dev entry point used by `index.html`: it logs game-over events to the console and calls `start(0xc0ffee)` with a fixed seed.

## Testing

Tests are colocated with their source as `*.test.ts` and run with Vitest. 174 tests pass across 26 files. Pure logic (`computePresentation`, `parseGrid`, `layerOffsets`, the loop's accumulator math, input binding, `mulberry32`, `circlesOverlap`, `blipEnvelope`, `visibleRange`, `pickWaterTile`, `scheduleWindow`, `generateWaveScript`/`tickWaves`, every `run.ts`/`weapons.ts`/`hud.ts` function, every `entities.ts` system) is tested headlessly with fixed seeds, fixed inputs, and synthetic timestamps. Canvas-, Web Audio-, and `requestAnimationFrame`-dependent code (`rasterize`, `createRenderer`, `AudioContext` construction, the `main.ts` render loop) stays thin and is verified visually/audibly in the dev server rather than under test.

## TypeScript configuration

`tsconfig.json` targets ES2022 with `strict: true` and `lib: ["ES2022", "DOM"]`. `skipLibCheck: true` is set because Vitest's bundled `.d.ts` files reference DOM lifecycle APIs not present in this DOM-only lib configuration; without it, `tsc --noEmit` fails on library type-checking that has nothing to do with this project's own code.
