# Steel Talon Pass 3 — Milestones 7–10 (Level 1 TOP Vertical Slice) Design

Scope: engine-spec build order milestones 7 (scrolling water tilemap, camera, `waves.ts` seeded spawning), 8 (HP, salvage pickups, HUD), 9 (sequencer + songs, title scene, INSERT COIN flow), 10 (Level 1 TOP segment playable start to finish). Branch: `pass/milestones-7-10`.

Ends with: boot → title screen (INSERT COIN blink, title theme, any key starts) → Level 1 TOP — scrolling Caribbean water, a seeded wave script of drone boats and delta target drones that shoot back, missile and salvage pickups, HUD — ending in SEGMENT COMPLETE with a score tally → back to title. Death costs a life; three lives per run for now.

Out of scope (later passes): SIDE and ROAM modes, the quadcopter boss, cutscenes/briefings, the hangar upgrade screen, additional songs, gamepad input, the arcade shell itself.

## Decisions made during brainstorming

- **One pass covers milestones 7–10** (user chose one big pass over splitting).
- **Full training lane** for the slice: two enemy kinds, missile pickups, salvage, scripted ~3-minute progression, SEGMENT COMPLETE flow, `gameover(score, salvage)` seam wired.
- **Lives:** 3 lives per run, 3 hits (HP) per life, respawn in place with invulnerability blink. (The beat sheet's death-ends-the-run roguelike rule arrives with the hangar screen; the HUD and run state are built so dropping to 1 life later is a constant change.)
- **Music:** two songs — a looping title/attract theme and the Level 1 gameplay track (sunny, steel-drum-flavored chiptune per the beat sheet).
- **Camera model:** real camera + world-space entities (approach A). All gameplay positions are world coordinates; draw at `pos − camera`. ROAM and SIDE reuse this unchanged.

## Architecture

New engine modules/changes (game-agnostic, no `game/` imports):

- `src/engine/renderer.ts` — add `camera: { x: number; y: number }` (mutable, owned by the active scene). The renderer does not apply it implicitly; game draw code subtracts it. Convention only, plus the field.
- `src/engine/tilemap.ts` — new: draw a repeating tile grid from rasterized tiles given a camera offset.
- `src/engine/scene.ts` — new: `Scene` interface + `SceneManager`.
- `src/engine/audio.ts` — add `noise()` (white-noise burst for percussion/SFX) and the lookahead sequencer.

New game modules:

- `src/game/sprites/tiles.ts` — animated water tiles.
- `src/game/sprites/delta.ts` — delta-wing target drone (layered).
- `src/game/sprites/pickups.ts` — missile crate + salvage sprites.
- `src/game/waves.ts` — seeded wave-script generation (replaces the interim spawner in `entities.ts`).
- `src/game/run.ts` — run state (score/lives/hp/salvage/missiles) + pure mutators.
- `src/game/hud.ts` — HUD drawing.
- `src/game/songs/title.ts`, `src/game/songs/level1.ts` — note arrays.
- `src/game/scenes/title.ts`, `src/game/scenes/top.ts` — the two scenes.
- `src/game/main.ts` — shrinks to boot + scene registration + shell seam.

## Milestone 7 — Camera, water tilemap, waves.ts

### Camera and world space

- `renderer.camera = { x: 0, y: 0 }` — top-left of the visible world rect.
- TOP mode: the level is a vertical strip `WIDTH` wide and `LEVEL_LENGTH` tall. World y **decreases** as the chopper flies "up" the lane: camera starts at `y = LEVEL_LENGTH − HEIGHT` and scrolls toward 0 at `SCROLL_SPEED = 60` px/s. `LEVEL_LENGTH = 11_280` px (`HEIGHT + 180 s × 60 px/s`) — the camera reaches y = 0 at exactly 3:00, then the outro runs.
- All entities live in world coordinates. Draw at `pos.x − camera.x, pos.y − camera.y` (camera.x stays 0 in TOP; the code still subtracts it so SIDE/ROAM inherit the idiom).
- The chopper is clamped to the camera rect (screen-relative clamp converted to world space). Entities despawn when outside the camera rect by a 32 px margin (replaces the fixed-screen despawn bounds from pass 2).

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
export type SpawnKind = 'boat' | 'delta' | 'missileCrate';
export interface SpawnEvent { atY: number; kind: SpawnKind; x: number; }
export function generateWaveScript(rng: () => number, levelLength: number): SpawnEvent[];  // sorted by atY descending
export interface WaveRunner { script: SpawnEvent[]; next: number; }
export function createWaveRunner(script: SpawnEvent[]): WaveRunner;
export function tickWaves(w: World, runner: WaveRunner, camY: number): void;  // spawns events whose atY ≥ camY − 32 (just above the view)
```

`generateWaveScript` builds Level 1's fixed structure with seeded jitter (positions ±, spacing ±):

1. **0:00–0:40 warm-up:** sparse single boats (~1 per 4 s).
2. **0:40–1:20 boat pairs:** staggered pairs, first two missile crates.
3. **1:20–2:00 deltas join:** delta singles weaving between boat groups.
4. **2:00–2:50 combined arms:** boat trios + delta pairs, one more crate.
5. **2:50–3:00 breather:** empty water; outro runs when the camera reaches y = 0 and all enemies are gone.

Roughly 55–70 events total. Structure (band boundaries, mix ratios) is fixed; the RNG jitters exact `atY` and `x`. Same seed → identical script (golden test).

## Milestone 8 — Enemies that shoot, pickups, run state, HUD

### Enemy fire

- New pool `enemyBullets` (64) on `World`. Enemy bullet: radius 2, drawn as a 2x2 orange (`5`) rect (no sprite).
- **Boat turret fires:** every 2.4 s (per-boat timer seeded at spawn with rng jitter ±0.4 s), a single aimed shot at the chopper's current position, speed 140 px/s. Turret layer stays static this pass (rotation later).
- **Delta drone** (`game/sprites/delta.ts`): layered sprite ~24x16 — delta body in orange/gray training livery (`5`/`p`/`m`), canopy glint (`j`), 2-frame jet flicker layer on a `tail` anchor. Flight: enters from top at fixed x, flies straight down at 120 px/s while weaving `x = baseX + sin(age × 2.2) × 28` — pure function of age, deterministic, tested. Fires one straight-down shot (speed 200) when its y first comes within 220 px of the chopper's y. hp 2, radius 8. Score 150 (boat: 100).
- `collideEnemyBulletsPlayer(w, player)` + `collideEnemiesPlayer(w, player)` (ramming): both respect invulnerability and return whether the player was hit this tick.

### Player damage and lives

`game/run.ts`:

```ts
export interface RunState {
  score: number; lives: number; hp: number;
  salvage: number; missiles: number;
  invulnTicks: number;                 // > 0 → invulnerable, chopper blinks
}
export function createRun(): RunState;         // lives 3, hp 3, rest 0
export function damagePlayer(r: RunState): 'hit' | 'death' | 'gameover' | 'shrugged';
export function addScore(r: RunState, points: number): void;
export function collectSalvage(r: RunState): void;   // salvage++, score += 25
export function armMissiles(r: RunState): void;      // missiles = min(missiles + 3, 9)
export function tickRun(r: RunState): void;          // decrements invulnTicks
```

Pure, fully unit-tested. `damagePlayer`: invulnerable → `'shrugged'`; hp−1 > 0 → `'hit'` + 90 invuln ticks (1.5 s); hp 0 with lives left → `'death'` (lives−1, hp restored to 3, 180 invuln ticks, respawn in place); hp 0 with no lives → `'gameover'`. The scene maps results to effects: hit → spark + hit SFX; death → big explosion + explode SFX + chopper blink; gameover → overlay flow.

### Pickups

- Entities of kind `'pickup'`, sharing the enemies pool sizing pattern: new pool `pickups` (16) on `World`.
- **Missile crate** (from wave script): 12x10 crate sprite (brass `6`, dark straps `1`, cyan `j` missile glyph), drifts down at 45 px/s. Collect (circle overlap with chopper, radius 8): `armMissiles`, pickup SFX (`SFX.pickup`, finally wired).
- **Salvage** (from kills): 25% seeded chance per boat kill, 40% per delta. 8x8 spinning canister (2 frames, gray/brass). Drifts down at 30 px/s; within 56 px of the chopper it magnetizes — velocity steers toward the chopper at 220 px/s (pure `tickPickups` math, tested). Collect: `collectSalvage`.
- **Missiles (player weapon):** while `missiles > 0`, the fire button also launches one missile per 0.5 s from alternating pylons (existing `pylonL`/`pylonR` anchors — the MISSILE sprite finally mounts, visible only while ammo remains on that side's rack logic kept simple: sprite visible iff `missiles > 0`). Missile projectile: speed (0, −300), radius 4, damage 3, splash: on impact also damages enemies within 24 px by 1. Drawn from the bullets pool with a `kind`-style flag — concretely: bullets carry `dmg: number` and missiles are bullets with dmg 3 + splash flag; one pool, no new machinery.

### game/hud.ts

`drawHud(ctx, run: RunState): void` — top strip, 10px monospace `fillText` + small rects (no bitmap font this pass):

- Top-left: `SCORE 000000` (6-digit zero-padded).
- Below it: HP pips — 3 squares, filled green (`9`) per hp.
- Top-right: `SALVAGE ×N` and `MISSILES ×N` stacked.
- Top-center: mini chopper icons ×lives — an 8x8 simplified chopper glyph defined as a small inline grid in `hud.ts` (pickups.ts stays pickups-only).

Pure layout constants, drawn last every frame (over particles). FPS counter moves under the HUD strip.

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

Dark water backdrop (same tilemap, slow auto-scroll), "STEEL TALON" in big palette-colored `fillText` + "OPERATION GREENFIRE" subtitle, "INSERT COIN — PRESS ANY KEY" blinking at 1 Hz, tiny seed readout (`SEED C0FFEE`). First keydown: `audio.unlock()` (moved here from `main.ts`), start TITLE_SONG. Next keydown (or same one after unlock — concretely: the keydown that finds audio already unlocked) → switch to the top scene. Attract mode beyond the scrolling water: none this pass.

## Milestone 10 — The vertical slice (game/scenes/top.ts + main.ts)

`top.ts` owns what the sandbox `main.ts` owned, converted to world space, plus:

- `enter()`: reset world/pools/camera/run, `generateWaveScript(rng)` with a fresh RNG stream from the run seed, start LEVEL1_SONG.
- Update order: tickRun → scroll camera → move player (clamped to camera rect) → tickFire (+ missiles) → tickWaves → tickBullets/tickEnemyBullets → tickEnemies (boat/delta behaviors) → tickPickups → tickParticles → collisions (bullets×enemies, enemyBullets×player, enemies×player, pickups×player) → HUD state.
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

Gameplay unchanged from pass 2's rule: one mulberry32 seeded at `start(seed)`; wave scripts, jitter, salvage drops, particle velocities all draw from it. Delta weave and turret timers are pure functions of entity age/state. The sequencer and all audio use the AudioContext clock (output-only, exempt). Overlay timers count ticks, not wall-clock.

## Testing

Headless (Vitest, fixed seeds, simulated ticks): `visibleRange`/`pickTile` distribution and stability; `generateWaveScript` golden test (event count, band ordering, first/last events for seed 0xc0ffee) and same-seed identity; `tickWaves` spawn-on-camera-pass and never-respawn; run-state mutators (full damage matrix: shrugged/hit/death/gameover, invuln decay, respawn values); salvage magnetism trajectory ticks; delta weave positions at known ages; boat fire cadence tick counts; missile splash damage radius; `scheduleWindow` (notes in window, loop wraparound, rests skipped); scene manager `enter()` on switch; camera-margin despawn. Canvas/tilemap rendering, songs, and game feel verified by John on the dev server (5173).

## Process

Same as pass 2: branch `pass/milestones-7-10`, subagent-driven development (opus for verbatim transcription tasks, sonnet for integration and reviews, opus final whole-branch review), docs (architecture.md, README, spec checkmarks 7–10) finalized in one pass at the end. Estimated 16–18 tasks.
