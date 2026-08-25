# Target Leading & Auto-Aim Design

Date: 2026-08-25. Branch: `pass/target-leading`. Base: `main` (bank frames merged).

Three features, all TOP-scene gameplay: (1) boats fire 5-shot leading sprays through a visibly rotating turret; (2) the player's chain gun and miniguns auto-aim at enemies inside traverse cones, with target leading; (3) a targeting reticle marks the enemy the selected weapon is locked on. Rockets stay dumb and get no reticle.

The 640x480 contract, 60Hz determinism, engine/game boundary, pixel-string assets, and no-allocation-in-the-hot-loop rules are unchanged and binding. All new randomness (spray mode roll, spray spread) goes through the world's seeded RNG.

## 1. Aim math — new module `src/game/aim.ts`

Pure functions, no imports from scenes, headless-testable.

### `intercept(sx, sy, tx, ty, tvx, tvy, projSpeed): AimPoint`

Closed-form lead solution: the point where a projectile launched from `(sx, sy)` at scalar speed `projSpeed` meets a target at `(tx, ty)` moving at constant `(tvx, tvy)`.

Solve the quadratic in flight time `t`:

```
a = tvx² + tvy² − projSpeed²
b = 2·(rx·tvx + ry·tvy)        where rx = tx − sx, ry = ty − sy
c = rx² + ry²
a·t² + b·t + c = 0
```

- `|a| < 1e-6` (target speed ≈ projectile speed): degenerate linear case `t = −c/b` if `b < 0`, else no solution.
- Otherwise take the smallest positive root; no positive root → no solution.
- No solution or stationary target → fall back to aiming at `(tx, ty)` directly.
- Returns `{ x, y }` — the aim point — written into a **reused module-level result object** (callers read immediately, never retain; same convention as `poseFromVelocity` and `collisionResult`).

### `coneTarget(world, x, y, halfAngle): Enemy | undefined`

Nearest living enemy (by squared distance) whose bearing from `(x, y)` lies within `halfAngle` radians of **straight up** (`-Y`, the chopper's fixed nose direction). Bearing check: `angleOff = |atan2(dx, -dy)|` (0 = dead ahead) must be `<= halfAngle`. Enemies at or behind the shooter's y (i.e. `dy >= 0` when `halfAngle < π/2`) fall out naturally via the bearing test. Iterates `world.enemies.forEachAlive` — no allocation.

### `enemyVelocity(e): Vec2`

True velocity of an enemy, for leading:

- boat: `e.vel` as-is.
- delta: `{ x: cos(e.age · DELTA_WEAVE_FREQ) · DELTA_WEAVE_FREQ · DELTA_WEAVE_AMP, y: e.vel.y }` — the analytic derivative of the weave, imported constants from `entities.ts` (same expression the draw pass already uses for delta bank poses).

Returns into a second reused module-level result object.

### `reticleTarget(world, run, x, y): Enemy | undefined`

Which enemy the reticle marks, given the run's selected weapon:

- slot 1 (chain): `coneTarget(world, x, y, CHAIN_CONE)`.
- slot 2 (miniguns): `coneTarget(world, x, y, MINIGUN_CONE)`.
- slot 4 (missiles): nearest living enemy, no cone (what a launched missile's homing will chase).
- slot 3 (rockets) or no candidates: `undefined`.

### Constants (exported from `aim.ts`)

| Constant | Value | Meaning |
|---|---|---|
| `CHAIN_CONE` | `Math.PI / 4` | ±45° half-angle for the chain gun |
| `MINIGUN_CONE` | `(5 * Math.PI) / 180` | ±5° half-angle for the miniguns |

## 2. Player auto-aim (`src/game/weapons.ts`)

`tickWeapons` gains no new parameters — mounts already carry world-space fire points, and it already receives the `World` (enemies included).

- **Chain gun (slot 1):** each shot calls `coneTarget(w, mounts.nose.x, mounts.nose.y, CHAIN_CONE)`. With a target: aim point = `intercept(nose, target.pos, enemyVelocity(target), BULLET_SPEED)`; the bullet's velocity is the unit vector from the nose to the aim point times `BULLET_SPEED`. No target: `(0, −BULLET_SPEED)` exactly as today.
- **Miniguns (slot 2):** one `coneTarget` call per volley from the player midpoint between the pods (`(podL.x + podR.x)/2, podL.y`), ±5°. Both barrels solve their own intercept from their own muzzle to the shared target (slightly convergent fire). No target: both straight up.
- `fireBullet` gains an optional aim: `fireBullet(w, m, dmg, vx?, vy?)` — omitted means the current straight-up default. `fireBarrel` passes them through.
- Cadence, damage, mounts, flash/shell/smoke behavior, rockets, missiles: unchanged.

Off-screen enemies above the player are legal targets if in-cone (they'll be at most `CAM_MARGIN` above the viewport before despawn; not worth filtering).

## 3. Boat spray + rotating turret

### Spray state (`src/game/entities.ts`)

`Enemy` gains fields (initialized in `makeEnemy` and reset in `spawnBoat`/`spawnDelta`):

```ts
sprayLeft: number;   // shots remaining in the running spray (0 = idle)
sprayTick: number;   // tick counter inside the spray
sprayVX: number;     // cached aim direction (unit vector) for one-lead mode
sprayVY: number;
sprayLead: boolean;  // true = re-solve intercept before every shot (10% mode)
turretAngle: number; // radians, world frame; 0 = down-screen (+Y), the rest pose
```

### Spray behavior (in `tickEnemies`, boats only)

`tickEnemies` gains a `playerVel: Vec2` parameter (the TOP scene passes the player's per-tick velocity in px/s; zero when not moving).

- When `fireTimer` expires and the boat is on-screen (existing y-band check), start a spray: `sprayLeft = SPRAY_SIZE (5)`, `sprayTick = 0`, `sprayLead = w.rng() < SPRAY_LEAD_CHANCE (0.10)`. In one-lead mode, solve `intercept(boat, player, playerVel, BOAT_SHOT_SPEED)` once and cache the unit aim direction in `sprayVX/sprayVY`.
- While `sprayLeft > 0`: every `SPRAY_TICK_GAP (4)` ticks fire one shot. Re-lead mode re-solves the intercept per shot; one-lead mode uses the cached direction. Every shot adds a seeded angular jitter of ±`SPRAY_SPREAD (4°)`. Shot speed stays `BOAT_SHOT_SPEED (280)`, radius 4, spawned from the boat's **turret muzzle** (boat pos offset along the current turret angle by `TURRET_BARREL_LEN (16)` px).
- Spray ends → `fireTimer = SPRAY_INTERVAL_MIN (2.8) + rng() · SPRAY_INTERVAL_VAR (0.8)` (up from 2.0 + 0.8: five leading shots per burst is a real difficulty jump, so cadence slows to compensate).
- `intercept` degenerate cases (player stationary, no positive root) fall back to direct aim — a stationary player gets the current behavior, just 5 shots of it.
- Deltas: unchanged single dumb shot. The old single-shot boat block is replaced entirely by the spray.

RNG discipline: the spray consumes RNG draws (mode roll at spray start, one jitter per shot) in a fixed order — deterministic under a fixed seed.

### Turret slew

Each tick, every boat computes its desired turret angle: toward the cached/current aim point while spraying, toward the player otherwise. `turretAngle` moves toward it capped at `TURRET_SLEW_RATE (3.0 rad/s)`, taking the short way around (same wrap-to-±π logic as missile homing). Angle 0 = pointing down-screen (+Y, toward the bow); positive = clockwise. Shots fire along `turretAngle` — if the target moved faster than the turret can traverse, the shot goes where the barrel points, not where the math wants (the slew cap is a real gameplay limit, so the aim direction used for spawning is the turret's, clamped to the solved direction when within reach).

### Turret art (`src/game/sprites/boat.ts`)

`BOAT_TURRET.frames` becomes 16 frames: frame `i` is the base grid rotated by `i · 22.5°` about the mount point, generated at boot by inverse-mapped nearest-neighbor sampling (`rotateGridAny(grid, angle, cx, cy)` — new helper in `boat.ts`; the pickup art's 90°-only `rotateGrid` can't express 22.5°). Output dimensions equal input (12x12); pixels sampled from outside the source are transparent. `mount` anchor `[6, 4]` is the rotation center and stays valid for every frame. Frame selection: `Math.round(turretAngle / (π/8)) & 15`.

### Draw (`src/game/scenes/top.ts`)

Before each boat's `drawLayered`, set `assets.boat`'s turret layer frame from that boat's `turretAngle` — the same per-entity frame-poke pattern the delta pose uses. A `TURRET` layer-index constant is exported from `boat.ts` alongside `createBoat`.

## 4. Targeting reticle (`src/game/scenes/top.ts`)

- Each draw frame (state `'playing'` only), call `reticleTarget(w, run, playerPos.x, playerPos.y)`; if it returns an enemy, draw four corner brackets just outside the enemy radius (`r + 4` px box, 6 px arms, 2 px stroke) at the enemy's screen position, in HUD yellow (`PALETTE[8]`), blinking 2 ticks on / 2 ticks off.
- Draw-only: reticle computation happens in the draw pass and touches no game state, so pausing freezes it with everything else and determinism is untouched.
- No reticle when rockets are selected, when no enemy is in the relevant cone, or outside `'playing'`.

## 5. Testing

- `src/game/aim.test.ts` (new): intercept meets a constant-velocity target (simulate flight ticks, closing distance → ~0); stationary target → direct aim; unreachable target (faster than projectile) → fallback; degenerate equal-speed case; coneTarget picks nearest in-cone, ignores out-of-cone and behind; enemyVelocity for a delta matches finite-difference of its weave; reticleTarget per weapon slot including rockets → undefined.
- `src/game/entities.test.ts` (extend): spray fires exactly 5 shots at 4-tick gaps then re-arms `fireTimer` in `[2.8, 3.6)`; pinned-seed test showing both spray modes occur across many sprays at ~10% re-lead; one-lead shots against a moving player converge near the player's future position; turret slew is rate-capped and takes the short way around; shots spawn from the barrel offset.
- `src/game/weapons.test.ts` (extend): chain shot velocity points at the intercept of an in-cone moving enemy (magnitude still `BULLET_SPEED`); enemy 46° off-axis ignored by chain; enemy 4° off-axis tracked by miniguns but a 6° one is not; no enemies → straight up (all existing tests keep passing unmodified — they run with empty enemy pools).
- `src/game/sprites/boat.test.ts` (extend): 16 turret frames, all 12x12; frame 0 equals the unrotated base; mount anchor in bounds.
- Determinism: fixed-seed run of N ticks with scripted player input produces identical bullet positions across two runs.
- Dev-server visual pass at the end: turret slew readability, reticle legibility and blink, spray dodgeability, angled tracer readability.

## Out of scope

Delta AI changes, SIDE/ROAM modes, reticle sounds, lock-on SFX, difficulty curves per level, turret art redraw (base grid unchanged, only rotation frames), HUD changes.
