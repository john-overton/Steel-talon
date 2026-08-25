# Bank Frames Design

Date: 2026-08-25. Branch: `pass/bank-frames`. Base: `main` (terrain + title flyover merged).

Drawn bank/pitch poses for the player chopper and the delta drone: 8 directions (4 cardinal + 4 composite corners) at 2 lean intensities each, plus neutral — 17 frames per craft. Poses are generated procedurally by warping the existing neutral art, with a sparse override map so any single pose can later be replaced by hand-drawn art (hybrid approach). On the title screen, poses fully replace `ctx.rotate`: the chopper always draws nose-up and conveys motion through banking alone.

The 640x480 buffer, engine/game boundary, determinism rules, pixel-string asset format, and the assets-are-code rule are all unchanged. No engine changes: `SpriteDef`, `prepareLayered`, and `drawLayered` are untouched.

## 1. Pose model — `src/game/pose.ts` (pure, headless)

```ts
export type PoseDir =
  | 'neutral' | 'up' | 'down' | 'left' | 'right'
  | 'upleft' | 'upright' | 'downleft' | 'downright';
export type PoseIntensity = 0 | 1 | 2;   // 0 = neutral art, 1 = slight, 2 = full
```

- `poseDir(dx: number, dy: number): PoseDir` — maps a movement vector to a direction. Dead zone: an axis with `|component| < POSE_DEADZONE` (= 0.01) counts as zero. Both axes active → the composite corner. Both zero → `'neutral'`.
- `poseFromVelocity(vx, vy, slow, fast): { dir: PoseDir; intensity: PoseIntensity }` — stateless selection for smooth analytic movers (title chopper, deltas). `speed = max(|vx|, |vy|)` (after dead-zoning each axis against `slow`); intensity = 0 below `slow`, 1 in `[slow, fast)`, 2 at `≥ fast`. Direction from `poseDir(vx, vy)` with `slow` as the per-axis dead zone.
- `createPoseTracker(): PoseTracker` — ramping state for binary input (TOP player):

```ts
export interface PoseTracker {
  dir: PoseDir;
  step: number; // 0..POSE_RAMP_TICKS*2, integer tick counter
  tick(target: PoseDir): void;
  intensity(): PoseIntensity;
}
export const POSE_RAMP_TICKS = 6;
```

  `tick(target)`: if `target === dir`, `step` climbs by 1 up to `POSE_RAMP_TICKS * 2`. If `target !== dir`, `step` decays by 1; at 0 the tracker adopts `target` as its new `dir`. So direction changes decay through neutral-ish lean first, then ramp into the new pose — no snapping. `intensity()` = `step < POSE_RAMP_TICKS ? 0 : step < POSE_RAMP_TICKS * 2 ? 1 : 2` — except intensity 0 with `step > 0` still shows the *current* dir at intensity 0 (i.e. neutral art; dir is only latent state). Deterministic, integer state, no allocation.

- `poseFrameIndex(dir: PoseDir, intensity: PoseIntensity): number` — index into a 17-frame array. `neutral` or intensity 0 → 0. Otherwise `1 + dirOrdinal * 2 + (intensity - 1)` with `dirOrdinal` in the fixed order `up, down, left, right, upleft, upright, downleft, downright` (0-7). Total indices 0-16.

## 2. Pose art generation — `src/game/sprites/poses.ts`

Pure `PixelGrid → PixelGrid` warps. Output dimensions always equal input dimensions (the warp happens inside the fixed canvas); pixels pushed past an edge are clipped. All functions operate on `PixelGrid` rgba data directly (no palette re-parse).

- `bankGrid(grid, side: 'left' | 'right', intensity: 1 | 2): PixelGrid` — roll into a lateral bank:
  - Width squash toward the banking side: each row is resampled to `width - squash` pixels (nearest-neighbor), where `squash` = 2 (slight) or 4 (full), then anchored so the row's center shifts 1px (slight) / 2px (full) toward the banking side. The far wing visually shortens, the near side leads.
  - Per-row shear: rows shift horizontally toward the banking side by `round(shearMax * (y - h/2) / (h/2))` with `shearMax` = 1 (slight) / 2 (full) — nose leads the lean, tail trails, selling the roll.
- `pitchGrid(grid, dir: 'forward' | 'backward', intensity: 1 | 2): PixelGrid` — pitch:
  - Vertical compression by `crush` = 2 (slight) / 4 (full) rows total, nearest-neighbor resample of the sprite's occupied row span, re-anchored so content shifts toward the nose (forward: content packs toward the top; backward: toward the bottom). Forward = nose-down dash, backward = tail-down flare.
- Composites apply `bankGrid` then `pitchGrid`.
- `buildPoseFrames(neutral: PixelGrid, overrides?: Partial<Record<string, PixelGrid>>): PixelGrid[]` — returns the 17-frame array in `poseFrameIndex` order. Override keys are `` `${dir}-${intensity}` `` (e.g. `'left-2'`); when a key is present, that grid is used verbatim instead of the generated warp — the hybrid escape hatch. Ships with no overrides. An override grid must match the neutral grid's dimensions (throw otherwise).

Left and right banks are each generated directly from the neutral grid (no mirroring step), so the chopper's port-side tail rotor stays on its correct side in every pose by construction.

## 3. Sprite integration

- `CHOPPER_BODY.frames` and `DELTA_BODY.frames` grow from 1 grid to the 17-frame pose array via `buildPoseFrames`. Frame 0 remains the untouched neutral grid, so every existing test and draw path that assumes frame 0 is unchanged.
- **Cosmetic banking:** anchors stay per-def and are authored against the neutral frame. Weapon mounts, rotor hub, muzzle flashes, pylon missiles, and the delta jet all keep attaching at neutral positions regardless of pose. Gameplay positions (mounts, collision) never move with a visual lean; the ≤4px visual offset at full lean sits under the rotor disc / is imperceptible at speed.
- Pose selection writes `layers[BODY].frame = poseFrameIndex(dir, intensity)` — the same mechanism the rotor and jet layers already use for animation.

## 4. Consumers

- **TOP player** (`scenes/top.ts`): one `PoseTracker` in the scene closure. Each playing tick: `tracker.tick(poseDir(dx, dy))` with the input axes (the same dx/dy already computed for movement, before normalization); at draw, set the body layer frame. Paused/complete/gameover ticks don't advance the tracker (update-driven, so this falls out naturally).
- **Deltas** (`scenes/top.ts` draw loop): stateless — lateral velocity is analytic, `vx = cos(age * 2.2) * 2.2 * 56` (≈123 px/s peak), vy is the constant baseline 240. Pose input is `(vx, 0)` — vy is dead-zoned against the baseline so straight descent reads neutral, banks emerge during the weave. Thresholds: `slow = 40`, `fast = 90` px/s via `poseFromVelocity`. Forward/backward pitch art exists but is latent until a future behavior varies delta vertical speed. The shared `assets.delta` prepared sprite gets its body frame set per-entity before each `drawLayered` call (draw order already per-entity; no extra allocation).
- **Title flyover** (`scenes/title.ts`): `ctx.rotate`/`save`/`restore` around the chopper are removed; the chopper always draws nose-up. `attractChopper` keeps producing position but its heading no longer drives drawing; the analytic velocity feeds `poseFromVelocity` with thresholds scaled to the attract path speed (`slow = 15`, `fast = 45` px/s — tune in the dev server). The shadow ellipse stays. The rotor keeps spinning as today.

## 5. Testing (all headless)

- `poseDir`: full mapping table — 8 directions, dead zone → neutral, composites when both axes active.
- `PoseTracker`: ramp 0→1→2 at exactly `POSE_RAMP_TICKS` per step; decay on release; direction change decays to 0 before adopting the new dir; intensity never skips a step.
- `poseFromVelocity`: threshold boundaries, dead-zoned axes, composite dirs.
- `poseFrameIndex`: all 17 (dir, intensity) pairs map to distinct indices 0-16; neutral/intensity-0 → 0.
- Warp invariants: output dimensions equal input; neutral pass-through is identity; `bankGrid` left/right of a mirror-symmetric input are mirror images; opaque pixel count conserved within 25% (resampling loses some); override grid wins over the generated warp; dimension-mismatched override throws.
- Sprite integration: `CHOPPER_BODY.frames.length === 17`, `DELTA_BODY.frames.length === 17`, frame 0 identical to the pre-pass neutral grid.
- Scene integration: TOP holding left ramps the body layer frame through `poseFrameIndex('left', 1)` to `('left', 2)` and back on release (via the existing debug seams / a minimal new one if needed).

Shear/squash/crush amounts and the title/delta velocity thresholds are starting values — final tuning is a visual pass in the dev server.

## Out of scope

Hand-drawn pose overrides (the map ships empty), rotor disc tilt during banks, moving mounts/anchors with pose, SIDE/ROAM modes, enemy boat poses.
