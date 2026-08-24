# Steel Talon Pass 3 — Milestones 7–10 (Level 1 TOP Vertical Slice) Design

Scope: engine-spec build order milestones 7 (scrolling water tilemap, camera, `waves.ts` seeded spawning), 8 (HP, weapons, pickups, HUD), 9 (sequencer + songs, title scene, INSERT COIN flow), 10 (Level 1 TOP segment playable start to finish). Branch: `pass/milestones-7-10`.

Ends with: boot → title screen (INSERT COIN blink, title theme, any key starts) → Level 1 TOP — scrolling Caribbean water, a seeded wave script of drone boats and delta target drones that shoot back, a four-slot weapon arsenal (chain gun, minigun and rocket pickups, homing missiles), salvage, HUD with weapon panel — ending in SEGMENT COMPLETE with a score tally → back to title. Death costs a life; three lives per run for now.

Out of scope (later passes): SIDE and ROAM modes, the quadcopter boss, cutscenes/briefings, the hangar upgrade screen, additional songs, gamepad input, the arcade shell itself.

## Decisions made during brainstorming

- **One pass covers milestones 7–10** (user chose one big pass over splitting).
- **Full training lane** for the slice: two enemy kinds, the weapon ladder below, salvage, scripted ~3-minute progression, SEGMENT COMPLETE flow, `gameover(score, salvage)` seam wired.
- **Lives:** 3 lives per run, 3 hits (HP) per life, respawn in place with invulnerability blink. (The beat sheet's death-ends-the-run roguelike rule arrives with the hangar screen; dropping to 1 life later is a constant change.)
- **Weapons (user-directed):** four selectable slots — 1: chain gun (owned from start, single barrel, 120 rpm, 3/4 minigun damage); 2: twin miniguns (pickup; the pass-2 twin-pod guns at 240 rpm per barrel); 3: twin rockets (pickup; dumb-fire salvos of 10 with growing spread, linear forward acceleration, smoke trails, 20 s reload); 4: homing missiles (armed by crates, limited ammo, splash). Keys 1–4 select directly; X/K cycles owned weapons; the fire button fires the selected weapon. Weapon pickups are chopper-sized rotating sprites with a pulsing glow accent.
- **Music:** two songs — a looping title/attract theme and the Level 1 gameplay track (sunny, steel-drum-flavored chiptune per the beat sheet).
- **Camera model:** real camera + world-space entities. All gameplay positions are world coordinates; draw at `pos − camera`. ROAM and SIDE reuse this unchanged.

## Architecture

New engine modules/changes (game-agnostic, no `game/` imports):

- `src/engine/renderer.ts` — add `camera: { x: number; y: number }` (mutable, owned by the active scene). The renderer does not apply it implicitly; game draw code subtracts it. Convention only, plus the field.
- `src/engine/tilemap.ts` — new: draw a repeating tile grid from rasterized tiles given a camera offset.
- `src/engine/scene.ts` — new: `Scene` interface + `SceneManager`.
- `src/engine/audio.ts` — add `noise()` (white-noise burst for percussion/SFX) and the lookahead sequencer.
- `src/engine/input.ts` — add bindings for weapon-select keys `1`–`4` and cycle key (X/K) to the input state.

New game modules:

- `src/game/sprites/tiles.ts` — animated water tiles.
- `src/game/sprites/delta.ts` — delta-wing target drone (layered).
- `src/game/sprites/pickups.ts` — weapon pickups (rotating, glowing), missile crate, salvage.
- `src/game/waves.ts` — seeded wave-script generation (replaces the interim spawner in `entities.ts`).
- `src/game/weapons.ts` — the four weapon definitions + firing logic (extends/absorbs pass-2 `tickFire`).
- `src/game/run.ts` — run state (score/lives/hp/salvage/weapons/ammo) + pure mutators.
- `src/game/hud.ts` — HUD drawing incl. the weapon panel.
- `src/game/songs/title.ts`, `src/game/songs/level1.ts` — note arrays.
- `src/game/scenes/title.ts`, `src/game/scenes/top.ts` — the two scenes.
- `src/game/main.ts` — shrinks to boot + scene registration + shell seam.

## Milestone 7 — Camera, water tilemap, waves.ts

### Camera and world space

- `renderer.camera = { x: 0, y: 0 }` — top-left of the visible world rect.
- TOP mode: the level is a vertical strip `WIDTH` wide and `LEVEL_LENGTH` tall. World y **decreases** as the chopper flies "up" the lane: camera starts at `y = LEVEL_LENGTH − HEIGHT` and scrolls toward 0 at `SCROLL_SPEED = 60` px/s. `LEVEL_LENGTH = 11_280` px (`HEIGHT + 180 s × 60 px/s`) — the camera reaches y = 0 at exactly 3:00, then the outro runs.
- All entities live in world coordinates. Draw at `pos.x − camera.x, pos.y − camera.y` (camera.x stays 0 in TOP; the code still subtracts it so SIDE/ROAM inherit the idiom).
- The chopper is clamped to the camera rect (screen-relative clamp converted to world space). Entities despawn when outside the camera rect by a 32 px margin (replaces the fixed-screen despawn bounds from pass 2). Exception: player rockets/bullets simply despawn off the top margin as before, camera-relative.

### engine/tilemap.ts

```ts
export interface Tilemap {
  tileSize: number;                    // px, square
  tiles: CanvasImageSource[];          // rasterized, indexed by pickTile
  pickTile(col: number, row: number, frame: number): number;  // pure — which tile index at this cell
}
export function drawTilemap(ctx, map: Tilemap, camX: number, camY: number, viewW: number, viewH: number): void;
export function visibleRange(cam: number, view: number, tileSize: number): [first: number, last: number];  // pure, tested
```

`drawTilemap` loops the visible cols/rows (from `visibleRange`) and `drawImage`s one tile per cell — no per-frame allocation. `pickTile` is deterministic from cell coordinates (hash of col/row picks among water variants; `frame` drives the animation), so the water pattern is stable as it scrolls, with no stored grid. The engine knows nothing about water; the game supplies tiles and `pickTile`.

### game/sprites/tiles.ts

Three 16x16 water tiles in DB32 blues (`g`/`h` deep blues, `i`/`j` highlights, `l` white foam flecks): calm, light chop, foam fleck. Each has 2 frames (flecks shimmer); animation advances every 30 ticks. `pickTile` hashes `(col, row)` with a small integer mix so ~80% calm / ~15% chop / ~5% foam. Boat wakes already exist on the boat sprite.

### game/waves.ts

The interim spawner block in `entities.ts` (`Spawner`, `createSpawner`, `tickSpawner`) is deleted. Replacement:

```ts
export type SpawnKind = 'boat' | 'delta' | 'missileCrate' | 'minigunPickup' | 'rocketPickup';
export interface SpawnEvent { atY: number; kind: SpawnKind; x: number; }
export function generateWaveScript(rng: () => number, levelLength: number): SpawnEvent[];  // sorted by atY descending
export interface WaveRunner { script: SpawnEvent[]; next: number; }
export function createWaveRunner(script: SpawnEvent[]): WaveRunner;
export function tickWaves(w: World, runner: WaveRunner, camY: number): void;  // spawns events whose atY ≥ camY − 32 (just above the view)
```

`generateWaveScript` builds Level 1's fixed structure with seeded jitter (positions ±, spacing ±):

1. **0:00–0:40 warm-up:** sparse single boats (~1 per 4 s); the **minigun pickup** drops at ~0:40.
2. **0:40–1:20 boat pairs:** staggered pairs, first two missile crates.
3. **1:20–2:00 deltas join:** delta singles weaving between boat groups; the **rocket pickup** drops at ~1:30.
4. **2:00–2:50 combined arms:** boat trios + delta pairs, one more crate.
5. **2:50–3:00 breather:** empty water; outro runs when the camera reaches y = 0 and all enemies are gone.

Roughly 55–70 events total. Structure (band boundaries, mix ratios, the two weapon-pickup drops) is fixed; the RNG jitters exact `atY` and `x`. Same seed → identical script (golden test).

## Milestone 8 — Enemies that shoot, weapons, pickups, run state, HUD

### Enemy fire

- New pool `enemyBullets` (64) on `World`. Enemy bullet: radius 2, drawn as a 2x2 orange (`5`) rect (no sprite).
- **Boat turret fires:** every 2.4 s (per-boat timer seeded at spawn with rng jitter ±0.4 s), a single aimed shot at the chopper's current position, speed 140 px/s. Turret layer stays static this pass (rotation later).
- **Delta drone** (`game/sprites/delta.ts`): layered sprite ~24x16 — delta body in orange/gray training livery (`5`/`p`/`m`), canopy glint (`j`), 2-frame jet flicker layer on a `tail` anchor. Flight: enters from top at fixed x, flies straight down at 120 px/s while weaving `x = baseX + sin(age × 2.2) × 28` — pure function of age, deterministic, tested. Fires one straight-down shot (speed 200) when its y first comes within 220 px of the chopper's y. hp 2, radius 8. Score 150 (boat: 100).
- `collideEnemyBulletsPlayer(w, player)` + `collideEnemiesPlayer(w, player)` (ramming): both respect invulnerability and return whether the player was hit this tick.

### Player weapons (`game/weapons.ts`)

Four slots. Player bullets carry `dmg: number`; enemy hp changes to match (boat hp 3, delta hp 2 — chain gun and minigun dmg tuned so time-to-kill feels right, see table).

| # | Weapon | Owned | Barrels | Rate | Damage | Projectile |
|---|---|---|---|---|---|---|
| 1 | Chain gun | from start | 1 (center, new `nose` anchor on the body) | 120 rpm (0.5 s interval) | 0.75 | pass-2 tracer, speed (0, −420) |
| 2 | Twin miniguns | minigun pickup | 2 (existing muzzles) | 240 rpm per barrel (0.25 s) | 1.0 | pass-2 tracer + flash/shell/smoke flavor |
| 3 | Twin rockets | rocket pickup | 2 (pylons) | salvo: 10 rockets, 1 per 3 ticks, alternating pylons; then 20 s cooldown | 2.0 | see below |
| 4 | Homing missiles | crates (ammo 3/crate, max 9) | pylons, alternating | 0.5 s interval, consumes 1 ammo | 3.0 + splash (24 px radius, 1 dmg) | see below |

- **Selection:** `selected: 1|2|3|4` in run state. Keys 1–4 select (only if owned/armed — selecting an unowned slot is a no-op with a low blip); X/K cycles through owned slots. Fire button fires the selected weapon only.
- **Chain gun:** single stream from a new `nose` anchor `[15, 10]` on `CHOPPER_BODY`; muzzle flash reuses one MUZZLE_FLASH layer (a 7th chopper layer on `nose`). Every shot ejects one shell; smoke every 3rd shot, matching pass-2 flavor at the slower cadence.
- **Miniguns:** exactly the pass-2 `tickFire` behavior with `FIRE_INTERVAL = 0.25` (240 rpm per barrel), both pods per shot, all existing flash/shell/smoke flavor.
- **Rockets:** each rocket launches from alternating pylons at speed (0, −120) and accelerates linearly at 900 px/s² straight "forward" (up-screen) until off-screen. Per-rocket seeded spread: launch angle jittered ±4°, so the salvo fans out the farther it flies. Radius 3, dmg 2, no splash. **Smoke trail:** every 4 ticks a rocket emits one small gray smoke particle (life 0.4 s) at its tail from the particle pool. Drawn as a 2x5 two-tone sprite (`ROCKET` in `shots.ts`: white tip, gunmetal body, orange exhaust pixel).
- **Missiles:** MISSILE sprite mounts on the pylons (layers visible iff `missileAmmo > 0`). Projectile speed 300 px/s with **homing**: steers toward the nearest live enemy at a capped turn rate of 3.5 rad/s (pure steering math over pos/vel, deterministic, tested); flies straight if no enemies live. Splash on impact: enemies within 24 px take 1. Emits the same smoke-trail cadence as rockets.
- All player projectiles come from the existing `bullets` pool; entries carry `dmg`, `splash: boolean`, `homing: boolean`, `accel: number`, and `trailTicks` counters. One pool, one tick function with per-flag behavior — no new machinery.

### Player damage and lives

`game/run.ts`:

```ts
export interface RunState {
  score: number; lives: number; hp: number;
  salvage: number;
  selected: 1 | 2 | 3 | 4;
  hasMiniguns: boolean; hasRockets: boolean;
  missileAmmo: number;                 // 0–9
  rocketCooldown: number;              // seconds remaining; 0 = ready
  rocketsLeftInSalvo: number;          // 10 → 0 while a salvo runs
  invulnTicks: number;                 // > 0 → invulnerable, chopper blinks
}
export function createRun(): RunState;         // lives 3, hp 3, selected 1, everything else 0/false
export function damagePlayer(r: RunState): 'hit' | 'death' | 'gameover' | 'shrugged';
export function addScore(r: RunState, points: number): void;
export function collectSalvage(r: RunState): void;   // salvage++, score += 25
export function armMissiles(r: RunState): void;      // missileAmmo = min(+3, 9)
export function grantWeapon(r: RunState, w: 'miniguns' | 'rockets'): void;  // sets flag + auto-selects
export function selectWeapon(r: RunState, slot: 1|2|3|4): boolean;          // false if unowned/unarmed
export function cycleWeapon(r: RunState): void;                             // next owned slot
export function tickRun(r: RunState, dt: number): void;                     // invulnTicks−−, rocketCooldown −= dt
```

Pure, fully unit-tested. `damagePlayer`: invulnerable → `'shrugged'`; hp−1 > 0 → `'hit'` + 90 invuln ticks (1.5 s); hp 0 with lives left → `'death'` (lives−1, hp restored to 3, 180 invuln ticks, respawn in place); hp 0 with no lives → `'gameover'`. The scene maps results to effects: hit → spark + hit SFX; death → big explosion + explode SFX + chopper blink; gameover → overlay flow. Slot 4 counts as owned iff `missileAmmo > 0`.

### Pickups

- New pool `pickups` (16) on `World`; kind `'pickup'`.
- **Weapon pickups** (minigun, rockets — from the wave script): 32x32 chopper-sized sprites in `game/sprites/pickups.ts`, 4 rotation frames advancing every 8 ticks, with a **pulsing glow accent** — a bright outline ring (yellow `8` ⇄ white `l`) baked into alternating frames so the pickup visibly throbs. Center glyph: crossed minigun barrels (gunmetal) / rocket pair (white tips). Drift down at 40 px/s. Collect (radius 14): `grantWeapon`, pickup SFX.
- **Missile crate:** 12x10 crate sprite (brass `6`, dark straps `1`, cyan `j` missile glyph), drifts down at 45 px/s. Collect (radius 8): `armMissiles`, pickup SFX (`SFX.pickup`, finally wired).
- **Salvage** (from kills): 25% seeded chance per boat kill, 40% per delta. 8x8 spinning canister (2 frames, gray/brass). Drifts down at 30 px/s; within 56 px of the chopper it magnetizes — velocity steers toward the chopper at 220 px/s (pure `tickPickups` math, tested). Collect: `collectSalvage`.

### game/hud.ts

`drawHud(ctx, run: RunState): void` — top strip, 10px monospace `fillText` + small rects (no bitmap font this pass):

- Top-left: `SCORE 000000` (6-digit zero-padded); HP pips below — 3 squares, filled green (`9`) per hp.
- Top-center: mini chopper icons ×lives — an 8x8 simplified chopper glyph defined as a small inline grid in `hud.ts`.
- Top-right: `SALVAGE ×N`.
- **Weapon panel** (bottom-left, 4 slots in a row): numbered boxes 1–4 with a tiny glyph each (chain gun / miniguns / rockets / missile). Selected slot: bright border (yellow `8`). Unowned: dimmed. Slot 3 shows the rocket cooldown as a draining bar under the box (full → empty over 20 s); slot 4 shows `×N` ammo. Pure layout constants; drawn last every frame. FPS counter moves under the HUD strip.

## Milestone 9 — Sequencer, songs, title scene

### engine/audio.ts additions

```ts
export function noise(durationSec: number, volume: number): void;   // white-noise burst through a bandpass — percussion + future explosion layering

export type Note = [freq: number, beats: number];   // freq 0 = rest
export interface Song {
  bpm: number;
  channels: [Note[], Note[], Note[], Note[]];  // square lead 1, square lead 2, triangle bass, noise drums (freq acts as noise pitch/color)
  loop: boolean;
}
export interface Sequencer { play(song: Song): void; stop(): void; }
export function createSequencer(audioCtxProvider): Sequencer;
```

Standard lookahead metronome: a 25 ms `setInterval` schedules every note whose start time falls within the next 120 ms, using the AudioContext clock. Pure, tested core: `scheduleWindow(song, songTimeSec, windowSec) → Array<{channel, freq, startBeat, beats}>` — which notes start inside a window, including loop wraparound. The Web Audio layer (one oscillator or noise burst per scheduled note, envelope like `blip`) stays thin and is verified by ear. The sequencer is engine code: songs are data passed in; no `game/` import.

Music is wall-clock (AudioContext time), exempt from determinism like all audio output.

### Songs

- `game/songs/title.ts` — TITLE_SONG: ~8-bar loop, 96 bpm, confident minor-key late-80s action sting.
- `game/songs/level1.ts` — LEVEL1_SONG: ~16-bar loop, 128 bpm, major-key sunny groove; triangle bass plays a calypso-ish pattern and lead 2 plays offbeat staccato stabs (the "steel drum under the chiptune" from the beat sheet — timbre is still square, the rhythm carries the flavor).

Both tuned by ear during the pass; note arrays are the deliverable, exact tunes are art.

### engine/scene.ts

```ts
export interface Scene { enter(): void; update(dt: number): void; draw(ctx: CanvasRenderingContext2D): void; }
export function createSceneManager(): { current: Scene | null; switchTo(s: Scene): void; update(dt): void; draw(ctx): void; };
```

`switchTo` calls `enter()` on the incoming scene. That's all — no stack, no transitions (YAGNI).

### game/scenes/title.ts

Dark water backdrop (same tilemap, slow auto-scroll), "STEEL TALON" in big palette-colored `fillText` + "OPERATION GREENFIRE" subtitle, "INSERT COIN — PRESS ANY KEY" blinking at 1 Hz, tiny seed readout (`SEED C0FFEE`). First keydown: `audio.unlock()` (moved here from `main.ts`), start TITLE_SONG. The keydown that finds audio already unlocked → switch to the top scene.

## Milestone 10 — The vertical slice (game/scenes/top.ts + main.ts)

`top.ts` owns what the sandbox `main.ts` owned, converted to world space, plus:

- `enter()`: reset world/pools/camera/run, `generateWaveScript(rng)` with a fresh RNG stream from the run seed, start LEVEL1_SONG.
- Update order: tickRun → scroll camera → move player (clamped to camera rect) → weapon select/cycle input → fire selected weapon → tickWaves → tickBullets/tickEnemyBullets → tickEnemies (boat/delta behaviors incl. turret fire) → tickPickups → tickParticles → collisions (bullets×enemies incl. splash, enemyBullets×player, enemies×player, pickups×player) → chopper layer states (flash/rotor/missile visibility).
- **Outro:** camera at y = 0 and no live enemies → SEGMENT COMPLETE overlay: "SEGMENT COMPLETE", score tally counting up (score + salvage × 25 bonus roll-up over ~2 s), "GOOD SHOOTING, TEX." — 5 s → emit `gameover(score, salvage)` → title.
- **Game over:** `damagePlayer` returns `'gameover'` → big explosion, chopper hidden, 1 s pause → "GAME OVER" + same tally → 5 s → `gameover(score, salvage)` → title.
- Overlays are states inside `top.ts` (`'playing' | 'complete' | 'gameover'` + a timer), not separate scenes.

`main.ts` becomes the shell seam:

```ts
export function start(seed: number): void;                       // boots engine, seeds RNG, switches to title
export function onGameOver(cb: (score: number, salvage: number) => void): void;
```

Module side effects (canvas lookup, listeners, RAF) move inside `start()`. The dev entry calls `start(0xc0ffee)` and registers a `console.log` gameover callback. The future arcade shell imports these two functions and nothing else.

## Determinism

Gameplay unchanged from pass 2's rule: one mulberry32 seeded at `start(seed)`; wave scripts, jitter, salvage drops, rocket spread angles, particle velocities all draw from it. Delta weave, turret timers, missile homing, and rocket acceleration are pure functions of entity age/state. The sequencer and all audio use the AudioContext clock (output-only, exempt). Overlay timers count ticks, not wall-clock.

## Testing

Headless (Vitest, fixed seeds, simulated ticks): `visibleRange`/`pickTile` distribution and stability; `generateWaveScript` golden test (event count, band ordering, weapon-pickup placement, first/last events for seed 0xc0ffee) and same-seed identity; `tickWaves` spawn-on-camera-pass and never-respawn; run-state mutators (full damage matrix, weapon grant/select/cycle rules incl. unowned no-ops and ammo-gated slot 4, rocket cooldown decay); salvage magnetism trajectory ticks; delta weave positions at known ages; boat fire cadence tick counts; per-weapon fire-rate counts over N ticks (chain 120 rpm, miniguns 240 rpm/barrel, salvo = exactly 10 rockets then cooldown); rocket acceleration/spread determinism for a fixed seed; missile homing turn-rate cap and nearest-target choice; splash damage radius; smoke-trail emission cadence; `scheduleWindow` (notes in window, loop wraparound, rests skipped); scene manager `enter()` on switch; camera-margin despawn. Canvas/tilemap rendering, songs, and game feel verified by John on the dev server (5173).

## Process

Same as pass 2: branch `pass/milestones-7-10`, subagent-driven development (opus for verbatim transcription tasks, sonnet for integration and reviews, opus final whole-branch review), docs (architecture.md, README, spec checkmarks 7–10) finalized in one pass at the end. Estimated 18–20 tasks.
