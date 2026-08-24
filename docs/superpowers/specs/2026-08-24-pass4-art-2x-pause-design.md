# Pass 4 Design: 2x World Scale + Pause Menu

Date: 2026-08-24. Branch: `pass/art-2x-pause`. Base: `main` (pass 3 merged, milestones 1-10 complete).

Two goals: (1) double all game art with genuinely added detail and scale the world uniformly so gameplay feel is unchanged; (2) Escape pauses the TOP scene with a CONTINUE / ABANDON RUN menu, where abandoning forfeits the credit.

The 640x480 buffer, sharp-bilinear presentation, engine/game boundary, determinism rules, and pixel-string asset format are all unchanged.

## 1. Uniform 2x world scale

One rule: **every gameplay length doubles** — sprite dimensions, anchor coordinates, collision radii, speeds, accelerations, amplitudes, margins, and distances. Times, damage, HP, scores, angles, and rates stay as they are. The game plays identically; the camera is effectively twice as close, restoring the classic 320x240 proportion (chopper = 1/10 of screen width).

Do **not** introduce a `WORLD_SCALE` constant threaded through the code. Rewrite each constant at its new value. A scale factor everywhere would be permanent complexity for a one-time change.

Exact before → after values:

| Constant | File | Old | New |
|---|---|---|---|
| `SCROLL_SPEED` | waves.ts | 60 | 120 |
| `LEVEL_LENGTH` | waves.ts | 11_280 | 22_080 (see note below — HEIGHT does not double) |
| `LANE_MIN` / `LANE_MAX` | waves.ts | 24 / WIDTH−24 | 48 / WIDTH−48 |
| `CAM_MARGIN` | entities.ts | 32 | 64 |
| `MAGNET_RADIUS` / `MAGNET_SPEED` | entities.ts | 56 / 220 | 112 / 440 |
| `BOAT_SHOT_SPEED` | entities.ts | 140 | 280 |
| `DELTA_SHOT_RANGE` | entities.ts | 220 | 440 |
| Delta weave amplitude (`* 28`) | entities.ts | 28 | 56 |
| Delta shot velocity (0, 200) | entities.ts | 200 | 400 |
| Boat spawn: radius / vel.y | entities.ts | 10 / 40 | 20 / 80 |
| Delta spawn: radius / vel.y | entities.ts | 8 / 120 | 16 / 240 |
| Enemy bullet radius | entities.ts (both spawn blocks) | 2 | 4 |
| `PICKUP_RADIUS` | entities.ts | 14/14/8/6 | 28/28/16/12 |
| `PICKUP_VY` | entities.ts | 40/40/45/30 | 80/80/90/60 |
| `SPLASH_RADIUS` | entities.ts | 24 | 48 |
| `BULLET_SPEED` | weapons.ts | 420 | 840 |
| `MISSILE_SPEED` | weapons.ts | 300 | 600 |
| `ROCKET_LAUNCH_SPEED` / `ROCKET_ACCEL` | weapons.ts | 120 / 900 | 240 / 1800 |
| `SPEED` (player) | scenes/top.ts | 180 | 360 |
| `PLAYER_RADIUS` | scenes/top.ts | 10 | 20 |
| `CHOPPER_HALF` | scenes/top.ts | 16 | 32 |
| Water `tileSize` | sprites/tiles.ts | 16 | 32 |

Unchanged (not lengths): `HOMING_TURN_RATE` (rad/s), `ROCKET_SPREAD` (angle), all fire intervals, damages, HP, `BULLET_MAX_AGE`, `TRAIL_TICKS`, salvage odds, scores, invulnerability tick counts, `WATER_FRAME_TICKS`, song data.

**`LEVEL_LENGTH` note:** the old value 11_280 was HEIGHT + 180 s × 60 px/s = 480 + 10_800. The doubled play distance is 21_600, so the new value is **22_080** (480 + 21_600), not a blind 2×11_280 — HEIGHT does not double. Run time stays 3:00.

**Wave golden pin:** `generateWaveScript` is unchanged in structure; its output distances shift because `LEVEL_LENGTH`, `SCROLL_SPEED`, `LANE_MIN/MAX`, and `CAM_MARGIN` change. Regenerate the golden expectation at seed `0xc0ffee` once and re-pin (still 5 bands; event count may stay 66 — pin whatever the regenerated script produces after eyeballing it for sanity). Time-anchored events (minigun pickup t=40, rockets t=90, 3 crates) keep their times.

**Mount plumbing:** `MOUNTS` in scenes/top.ts is derived from `CHOPPER_HALF` + body anchors, so it scales automatically once the anchors and `CHOPPER_HALF` are updated. Muzzle flash / shell / smoke offsets hard-coded in weapons.ts or entities.ts (if any small pixel nudges exist) double too.

## 2. Redrawn sprites — real detail, not scaled pixels

Every pixel grid is redrawn by hand at double size. Nearest-neighbor upscaling of the old art is a plan failure — the point is added detail. DB32 palette (base-32 chars into `PALETTE`), pixel-string grids, `SpriteDef` frames/anchors format, and the 9-layer chopper structure all survive. Anchor *names* are stable; coordinates are re-placed on the new art (roughly 2× the old, adjusted to sit correctly on the redrawn pixels).

| Sprite | File | Old | New | Added detail |
|---|---|---|---|---|
| `CHOPPER_BODY` | player.ts | 32x32 | 64x64 | panel lines, canopy frames, tail boom + tail rotor, engine exhaust, 2-3 shading bands |
| `CHOPPER_ROTOR` (2f) | player.ts | ~30 wide | ~60 wide | hub detail, distinct blur per frame |
| `ROCKET_POD` | player.ts | small | 2x | visible tube openings |
| `MISSILE` | player.ts | small | 2x | fins, nose tip |
| `MUZZLE_FLASH` | shots.ts | small | 2x | brighter core |
| `BOAT` | boat.ts | 24x16 | 48x32 | deck structure, gun mount, hull shading, wake foam rows |
| `DELTA_BODY` + `DELTA_JET` (2f) | delta.ts | 24x16 | 48x32 | cockpit canopy, wing markings, jet flicker frames |
| `MINIGUN_PICKUP` / `ROCKET_PICKUP` (4f) | pickups.ts | 32x32 | 64x64 | pulsing ring radius 28 (was 14), chunkier weapon silhouettes; `rotateGrid` unchanged |
| `CRATE` | pickups.ts | 12x10 | 24x20 | strapping, stencil mark |
| `SALVAGE` (2f) | pickups.ts | 8x8 | 16x16 | glint frames |
| `WATER_TILES` (6) | tiles.ts | 16x16 | 32x32 | more fleck variety per tile; `pickWaterTile` hash and 80/15/5 weights unchanged |
| `TRACER` | shots.ts | 2x4 | 4x8 | bright core + dimmer sheath |
| `ROCKET` | shots.ts | 2x5 | 4x10 | visible exhaust pixel |
| `LIVES_ICON` | hud.ts | 8x8 | 16x16 | recognizable mini-chopper |

HUD layout (score text, pips, weapon panel boxes) may need pixel nudges to fit the 16x16 lives icons; text stays canvas `fillText` monospace at current sizes — no bitmap font work.

**Anchor consequences:** `nose` [15,10] → ~[31,20]; `muzzleL/R` [6,13]/[25,13] → ~[12,26]/[51,26]; `mast`, `podL/R`, `pylonL/R`, rotor `hub`, delta tail anchor — all re-placed on the new art. The existing player.test.ts shape checks (anchors in bounds, layers inside body footprint, hub centered on mast) keep their logic with updated numbers (footprint 32 → 64).

**Projectile re-judgment (closes the deferred "bullets read as single pixels" item):** after all art and scaling land, take screenshots in Chrome at real presentation scale and judge tracer / enemy shot / rocket readability. Enemy shots are currently bare circles — if they read poorly at radius 4, give them a small 2-frame shot sprite (e.g. 6x6 pulsing orb) in shots.ts drawn at the bullet position. This is an explicit judgment step in the plan, not an afterthought.

## 3. Escape pause (TOP scene)

New overlay state `'paused'` alongside `'playing' | 'complete' | 'gameover'`.

**Input:** `Input` gains a `pause` action bound to `Escape`. Confirm reuses the existing `start` action (already bound to `Enter`), gaining a `NumpadEnter` binding. Menu navigation reuses the existing up/down movement bindings (arrows + W/S). All menu keys are edge-detected in the scene (same pressed-last-frame pattern used for weapon selection).

**Behavior:**
- Escape during `'playing'` → `'paused'`. The world freezes: `update()` runs only the pause-menu logic — no entity/wave/weapon/timer ticks, no RNG consultation, so determinism is untouched (paused ticks simply never happen). SFX stop with gameplay; **music keeps looping** (no sequencer changes).
- Draw renders the frozen gameplay frame, then a dimming overlay (`rgba(0,0,0,0.6)`) with:

```
        P A U S E D
      > CONTINUE
        ABANDON RUN
   ABANDONING FORFEITS YOUR CREDIT
```

- Up/Down moves the cursor between the two items (select blip SFX); Enter confirms; Escape resumes directly (acts as CONTINUE).
- **CONTINUE** → back to `'playing'`, exactly where it left off.
- **ABANDON RUN** → stop music, return to the title scene **without** firing the gameover callback — the run is forfeited, no score submission. Escape during `'complete'`/`'gameover'` overlays does nothing.

**Seams:** `createTopScene` deps gain `onAbandon: () => void`. In main.ts, `onAbandon` switches to the title scene with a forfeit flag. `createTitleScene` gains a way to show a transient flashing line on entry: `CREDIT FORFEITED — GOOD PILOTS FINISH THE MISSION.` (blinks for ~4 seconds, then the normal INSERT COIN idle). Concept copy only — credits become real with the Gnarcade shell; nothing else about the shell seam changes.

**Pure menu module:** the pause menu state machine lives in `src/game/pausemenu.ts` — `{cursor, tick(input-edges) → 'continue' | 'abandon' | null}` — headlessly tested; only the overlay drawing stays in the scene.

## 4. Testing

- **Sprite tests:** regenerated per sprite — dimensions, anchors-in-bounds, layer offsets within the 64x64 footprint, hub-on-mast, frame-count/dimension invariants. Same shapes, new numbers.
- **Geometry tests:** entities/weapons/waves tests updated to the doubled constants; wave golden re-pinned at seed `0xc0ffee` (regenerate once, sanity-check band structure, pin).
- **New tests:** pause menu module (cursor wrap, confirm routing, escape-resume); top scene pause integration (Escape edge → paused; world tick counters frozen while paused; resume continues exactly — same entity state; abandon calls `onAbandon` and never the exit/gameover path); input `pause`/`confirm` bindings; title forfeit-message state (shows on forfeit entry, expires).
- **Live Chrome pass at the end:** art review screenshots of every redrawn sprite in-game, projectile readability judgment (section 2), and a full pause flow walkthrough (pause → navigate → continue; pause → abandon → forfeit message on title → insert coin still works).

## Out of scope

SIDE/ROAM modes, real credit/coin system, sequencer pause/resume, `start()`/`stop()` teardown seam, pushing to origin.
