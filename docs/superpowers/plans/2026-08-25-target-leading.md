# Target Leading & Auto-Aim Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Boats fire 5-shot leading sprays through a rotating turret; the player's chain gun (±45°) and miniguns (±5°) auto-aim with target leading; a blinking reticle marks the locked enemy (rockets excluded).

**Architecture:** A new pure module `src/game/aim.ts` holds the intercept solver, cone target selection, and reticle target choice (type-only runtime deps — no import cycle). `entities.ts` gains `enemyVelocity`, boat spray state/logic, and turret slew, importing `intercept` from aim. `weapons.ts` bends chain/minigun bullet velocities toward intercepts. `boat.ts` grows 16 pre-rotated turret frames. `top.ts` wires player velocity in, turret frames and the reticle out.

**Tech Stack:** TypeScript strict, Vitest, Canvas 2D. Zero runtime dependencies.

Spec: `docs/superpowers/specs/2026-08-25-target-leading-design.md`.

## Global Constraints

- Determinism: all gameplay randomness through the world's seeded RNG (`w.rng()`); never `Math.random`/`Date.now`/`performance.now` in update logic.
- No allocation in the hot loop: per-tick results go through reused module-level objects (existing convention: `poseFromVelocity`, `collisionResult`). Callers read immediately, never retain.
- `engine/` never imports from `game/`.
- TypeScript strict; no `any`. `npm run typecheck` must pass.
- TDD: failing test first, then implementation. `npm test` green at every commit.
- Constants (exact values): `CHAIN_CONE = Math.PI / 4`, `MINIGUN_CONE = (5 * Math.PI) / 180`, `SPRAY_SIZE = 5`, `SPRAY_TICK_GAP = 4`, `SPRAY_LEAD_CHANCE = 0.10`, `SPRAY_SPREAD = (4 * Math.PI) / 180`, `SPRAY_INTERVAL_MIN = 2.8`, `SPRAY_INTERVAL_VAR = 0.8`, `TURRET_SLEW_RATE = 3.0` rad/s, `TURRET_BARREL_LEN = 16` px, 16 turret frames at 22.5° steps.
- Angle convention (turret): `turretAngle` in radians, direction vector = `(sin θ, cos θ)`; θ=0 points down-screen (+Y, the boat's bow), θ=+π/2 points screen-right (+X).
- Docs discipline: `docs/architecture.md` updated in the final task; a change is not done while a doc describes a state that no longer exists.

---

### Task 1: Aim math module (`aim.ts`) + `enemyVelocity`

**Files:**
- Create: `src/game/aim.ts`
- Create: `src/game/aim.test.ts`
- Modify: `src/game/entities.ts` (add `enemyVelocity` export near `nearestEnemy`)

**Interfaces:**
- Consumes: `Enemy`, `Vec2`, `World`, `DELTA_WEAVE_FREQ`, `DELTA_WEAVE_AMP` from `./entities`; `RunState` from `./run` (has `selected: number`).
- Produces (later tasks rely on these exact signatures):
  - `intercept(sx: number, sy: number, tx: number, ty: number, tvx: number, tvy: number, projSpeed: number): AimPoint` where `AimPoint = { x: number; y: number }` — REUSED result object.
  - `coneTarget(w: World, x: number, y: number, halfAngle: number): Enemy | undefined`
  - `reticleTarget(w: World, run: RunState, x: number, y: number): Enemy | undefined`
  - `CHAIN_CONE`, `MINIGUN_CONE` constants.
  - From `entities.ts`: `enemyVelocity(e: Enemy): Vec2` — REUSED result object.

- [ ] **Step 1: Write the failing tests** — `src/game/aim.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../engine/rng';
import { CHAIN_CONE, MINIGUN_CONE, coneTarget, intercept, reticleTarget } from './aim';
import { DELTA_WEAVE_AMP, DELTA_WEAVE_FREQ, createWorld, enemyVelocity, spawnBoat, spawnDelta } from './entities';
import { createRun, grantWeapon, armMissiles, selectWeapon } from './run';

describe('intercept', () => {
  it('meets a constant-velocity target', () => {
    // Shooter at origin, target at (100, 0) moving +y at 50, projectile 200.
    const p = intercept(0, 0, 100, 0, 0, 50, 200);
    // Simulate: projectile flies straight at p; verify it passes within 1px
    // of the target's position at the intercept time.
    const d = Math.hypot(p.x, p.y);
    const t = d / 200;
    const tx = 100;
    const ty = 50 * t;
    expect(p.x).toBeCloseTo(tx, 5);
    expect(p.y).toBeCloseTo(ty, 5);
  });

  it('degenerates to direct aim for a stationary target', () => {
    const p = intercept(10, 20, 300, 400, 0, 0, 840);
    expect(p.x).toBe(300);
    expect(p.y).toBe(400);
  });

  it('falls back to direct aim when the target outruns the projectile', () => {
    // Target fleeing along +x faster than the projectile can fly.
    const p = intercept(0, 0, 100, 0, 500, 0, 200);
    expect(p.x).toBe(100);
    expect(p.y).toBe(0);
  });

  it('handles the equal-speed degenerate case (linear solution)', () => {
    // Target approaching head-on at projectile speed: b < 0, t = -c/b.
    const p = intercept(0, 0, 200, 0, -200, 0, 200);
    const t = 0.5; // meets halfway: 200 - 200t = 200t
    expect(p.x).toBeCloseTo(200 - 200 * t, 5);
    expect(p.y).toBeCloseTo(0, 5);
  });

  it('reuses its result object (no per-call allocation)', () => {
    const a = intercept(0, 0, 10, 10, 0, 0, 100);
    const b = intercept(0, 0, 20, 20, 0, 0, 100);
    expect(a).toBe(b);
  });
});

describe('coneTarget', () => {
  it('picks the nearest enemy inside the cone, ignores outside', () => {
    const w = createWorld(mulberry32(1));
    // Shooter at (320, 400) firing up. In-cone (dead ahead, far):
    const far = spawnBoat(w, 320, 100)!;
    // In-cone (10° off, near):
    const near = spawnBoat(w, 320 + Math.sin(0.174) * 150, 400 - Math.cos(0.174) * 150)!;
    // Out of cone (90° off — level with the shooter):
    spawnBoat(w, 500, 400);
    const t = coneTarget(w, 320, 400, CHAIN_CONE);
    expect(t).toBe(near);
    expect(t).not.toBe(far);
  });

  it('rejects enemies just outside the half-angle and behind', () => {
    const w = createWorld(mulberry32(1));
    // 46° off-axis: outside CHAIN_CONE (45°).
    const a = (46 * Math.PI) / 180;
    spawnBoat(w, 320 + Math.sin(a) * 200, 400 - Math.cos(a) * 200);
    // Directly behind (below) the shooter.
    spawnBoat(w, 320, 500);
    expect(coneTarget(w, 320, 400, CHAIN_CONE)).toBeUndefined();
  });

  it('minigun cone accepts 4° but rejects 6°', () => {
    const w = createWorld(mulberry32(1));
    const a6 = (6 * Math.PI) / 180;
    spawnBoat(w, 320 + Math.sin(a6) * 200, 400 - Math.cos(a6) * 200);
    expect(coneTarget(w, 320, 400, MINIGUN_CONE)).toBeUndefined();
    const a4 = (4 * Math.PI) / 180;
    const good = spawnBoat(w, 320 + Math.sin(a4) * 200, 400 - Math.cos(a4) * 200)!;
    expect(coneTarget(w, 320, 400, MINIGUN_CONE)).toBe(good);
  });
});

describe('enemyVelocity', () => {
  it('returns a boat velocity verbatim', () => {
    const w = createWorld(mulberry32(1));
    const e = spawnBoat(w, 100, 100)!;
    const v = enemyVelocity(e);
    expect(v.x).toBe(0);
    expect(v.y).toBe(80);
  });

  it('delta velocity matches the finite difference of its weave', () => {
    const w = createWorld(mulberry32(1));
    const e = spawnDelta(w, 300, 100)!;
    e.age = 0.8;
    const v = enemyVelocity(e);
    const eps = 1e-4;
    const x0 = 300 + Math.sin((e.age - eps) * DELTA_WEAVE_FREQ) * DELTA_WEAVE_AMP;
    const x1 = 300 + Math.sin((e.age + eps) * DELTA_WEAVE_FREQ) * DELTA_WEAVE_AMP;
    expect(v.x).toBeCloseTo((x1 - x0) / (2 * eps), 2);
    expect(v.y).toBe(240);
  });
});

describe('reticleTarget', () => {
  it('follows the selected weapon: chain cone, minigun cone, missile nearest, rockets none', () => {
    const w = createWorld(mulberry32(1));
    const r = createRun();
    // 30° off-axis at range 200: inside CHAIN_CONE, outside MINIGUN_CONE.
    const a = (30 * Math.PI) / 180;
    const e = spawnBoat(w, 320 + Math.sin(a) * 200, 400 - Math.cos(a) * 200)!;
    expect(reticleTarget(w, r, 320, 400)).toBe(e);       // slot 1 default
    grantWeapon(r, 'miniguns');
    selectWeapon(r, 2);
    expect(reticleTarget(w, r, 320, 400)).toBeUndefined(); // outside ±5°
    grantWeapon(r, 'rockets');
    selectWeapon(r, 3);
    expect(reticleTarget(w, r, 320, 400)).toBeUndefined(); // rockets: never
    armMissiles(r);
    selectWeapon(r, 4);
    expect(reticleTarget(w, r, 320, 400)).toBe(e);         // nearest, no cone
  });

  it('missiles lock the nearest enemy even behind the player', () => {
    const w = createWorld(mulberry32(1));
    const r = createRun();
    armMissiles(r);
    selectWeapon(r, 4);
    const behind = spawnBoat(w, 320, 450)!;
    spawnBoat(w, 320, 100);
    expect(reticleTarget(w, r, 320, 400)).toBe(behind);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/game/aim.test.ts`
Expected: FAIL — module `./aim` not found / `enemyVelocity` not exported.

- [ ] **Step 3: Implement** — create `src/game/aim.ts`:

```ts
// Aim math for auto-aim and AI target leading (target-leading spec §1).
// Pure functions; runtime-dependency-free (type-only imports), so
// entities.ts can import intercept() without a cycle.
import type { Enemy, World } from './entities';
import type { RunState } from './run';

export const CHAIN_CONE = Math.PI / 4;          // ±45° chain gun traverse
export const MINIGUN_CONE = (5 * Math.PI) / 180; // ±5° minigun traverse

export interface AimPoint { x: number; y: number; }

// Reused across calls to avoid a per-shot allocation; callers must not
// retain the returned reference past their next call to this function.
const aimResult: AimPoint = { x: 0, y: 0 };

// Where to aim from (sx, sy) so a projectile at projSpeed meets a target
// at (tx, ty) moving at constant (tvx, tvy). Closed-form quadratic in
// flight time t; no positive solution (target outrunning the projectile,
// or stationary) falls back to the target's current position.
export function intercept(
  sx: number, sy: number, tx: number, ty: number,
  tvx: number, tvy: number, projSpeed: number,
): AimPoint {
  const rx = tx - sx;
  const ry = ty - sy;
  const a = tvx * tvx + tvy * tvy - projSpeed * projSpeed;
  const b = 2 * (rx * tvx + ry * tvy);
  const c = rx * rx + ry * ry;
  let t = -1;
  if (Math.abs(a) < 1e-6) {
    // Target speed ≈ projectile speed: at² drops out, t = -c/b if closing.
    if (b < 0) t = -c / b;
  } else {
    const disc = b * b - 4 * a * c;
    if (disc >= 0) {
      const sq = Math.sqrt(disc);
      const t1 = (-b - sq) / (2 * a);
      const t2 = (-b + sq) / (2 * a);
      const lo = Math.min(t1, t2);
      const hi = Math.max(t1, t2);
      t = lo > 0 ? lo : hi > 0 ? hi : -1;
    }
  }
  if (t > 0) {
    aimResult.x = tx + tvx * t;
    aimResult.y = ty + tvy * t;
  } else {
    aimResult.x = tx;
    aimResult.y = ty;
  }
  return aimResult;
}

// Nearest living enemy whose bearing from (x, y) lies within halfAngle of
// straight up (-Y, the chopper's fixed nose direction). atan2(dx, -dy) is
// 0 dead ahead, ±π directly behind, so the bearing test alone also culls
// everything behind the shooter. halfAngle = Math.PI degrades to a plain
// nearest-enemy scan (used by missile reticles).
export function coneTarget(w: World, x: number, y: number, halfAngle: number): Enemy | undefined {
  let best: Enemy | undefined;
  let bestDistSq = Infinity;
  w.enemies.forEachAlive((e) => {
    const dx = e.pos.x - x;
    const dy = e.pos.y - y;
    if (Math.abs(Math.atan2(dx, -dy)) > halfAngle) return;
    const distSq = dx * dx + dy * dy;
    if (distSq < bestDistSq) {
      bestDistSq = distSq;
      best = e;
    }
  });
  return best;
}

// Which enemy the HUD reticle marks: the selected weapon's current lock.
// Rockets are dumb — no reticle. Missiles home on the nearest enemy with
// no cone limit, so that is what they show.
export function reticleTarget(w: World, run: RunState, x: number, y: number): Enemy | undefined {
  switch (run.selected) {
    case 1: return coneTarget(w, x, y, CHAIN_CONE);
    case 2: return coneTarget(w, x, y, MINIGUN_CONE);
    case 4: return coneTarget(w, x, y, Math.PI);
    default: return undefined;
  }
}
```

Then in `src/game/entities.ts`, directly below `nearestEnemy`, add:

```ts
// Reused across calls to avoid a per-shot allocation; callers must not
// retain the returned reference past their next call to this function.
const enemyVelResult: Vec2 = { x: 0, y: 0 };

// True velocity for target leading. Deltas position analytically
// (pos.x = baseX + sin(age·FREQ)·AMP in tickEnemies), so their x velocity
// is the weave derivative, not the (zero) vel.x field.
export function enemyVelocity(e: Enemy): Vec2 {
  if (e.enemyKind === 'delta') {
    enemyVelResult.x = Math.cos(e.age * DELTA_WEAVE_FREQ) * DELTA_WEAVE_FREQ * DELTA_WEAVE_AMP;
    enemyVelResult.y = e.vel.y;
  } else {
    enemyVelResult.x = e.vel.x;
    enemyVelResult.y = e.vel.y;
  }
  return enemyVelResult;
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/game/aim.test.ts` → PASS. Then `npm test` and `npm run typecheck` → all green.

- [ ] **Step 5: Commit**

```bash
git add src/game/aim.ts src/game/aim.test.ts src/game/entities.ts
git commit -m "feat: aim math — intercept solver, cone targeting, reticle selection"
```

---

### Task 2: 16-frame rotating turret art

**Files:**
- Modify: `src/game/sprites/boat.ts`
- Test: `src/game/sprites/boat.test.ts`

**Interfaces:**
- Consumes: existing `BOAT_TURRET` grid (12x12, mount `[6, 4]`), `PixelGrid`/`parseGrid` from `engine/sprite`.
- Produces: `BOAT_TURRET.frames` length 16 (frame `i` = base rotated so the barrel points along direction `(sin(i·π/8), cos(i·π/8))`); `export const TURRET_LAYER = 1;`; `export function turretFrame(angle: number): number` mapping a radian angle to the nearest of the 16 frames.

- [ ] **Step 1: Write the failing tests** — in `src/game/sprites/boat.test.ts`, REPLACE the `'turret is a single 12x12 frame mounted at its rotation centre'` test with:

```ts
  it('turret has 16 rotation frames, all 12x12, mounted at the rotation centre', () => {
    expect(BOAT_TURRET.frames).toHaveLength(16);
    for (const f of BOAT_TURRET.frames) {
      expect(f.width).toBe(12);
      expect(f.height).toBe(12);
    }
    expect(BOAT_TURRET.anchors.mount).toEqual([6, 4]);
  });

  it('frame 0 points the barrel down, frame 4 points it right', () => {
    const alphaAt = (f: number, x: number, y: number) =>
      BOAT_TURRET.frames[f].rgba[(y * 12 + x) * 4 + 3];
    // Base art: barrel pixels below the mount (6,10 opaque), nothing at (11,4).
    expect(alphaAt(0, 6, 10)).toBe(255);
    expect(alphaAt(0, 11, 4)).toBe(0);
    // Rotated +90° (frame 4): barrel extends right of the mount.
    expect(alphaAt(4, 11, 4)).toBe(255);
  });

  it('turretFrame quantizes angles to the nearest of 16 steps, wrapping', () => {
    expect(turretFrame(0)).toBe(0);
    expect(turretFrame(Math.PI / 2)).toBe(4);
    expect(turretFrame(-Math.PI / 2)).toBe(12);
    expect(turretFrame(Math.PI)).toBe(8);
    expect(turretFrame(0.1)).toBe(0);          // < half a step
    expect(turretFrame(Math.PI / 8)).toBe(1);  // exactly one step
  });

  it('exports the turret layer index', () => {
    expect(TURRET_LAYER).toBe(1);
    expect(createBoat().layers[TURRET_LAYER].def).toBe(BOAT_TURRET);
  });
```

Update the file's import line to `import { BOAT_HULL, BOAT_TURRET, TURRET_LAYER, createBoat, turretFrame } from './boat';`. The `'every anchor lies inside its sprite bounds'` test uses `def.frames[0]` — it still passes.

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/game/sprites/boat.test.ts`
Expected: FAIL — frames length 1, `turretFrame`/`TURRET_LAYER` not exported.

- [ ] **Step 3: Implement** — in `src/game/sprites/boat.ts`, replace the `BOAT_TURRET` definition with:

```ts
// 12x12 turret base grid, barrel pointing down toward the bow (the
// turretAngle = 0 rest pose). Rotation frames are generated from it below.
const TURRET_BASE = parseGrid([
  '....1111....',
  '...1mmmm1...',
  '..1mmmmmm1..',
  '.1mmnnnnmm1.',
  '.1mmn11nmm1.',
  '.1mmnnnnmm1.',
  '.1mmmmmmmm1.',
  '.1oommmmoo1.',
  '..1o1nn1o1..',
  '....1nn1....',
  '....1nn1....',
  '....1111....',
], PALETTE);

export const TURRET_STEPS = 16;
const TURRET_STEP = (Math.PI * 2) / TURRET_STEPS;

// Arbitrary-angle rotation about (cx, cy): inverse-mapped nearest-neighbor
// sampling (the pickup art's rotateGrid only does 90° steps). Angle follows
// the turret convention — a point below the pivot moves to direction
// (sin θ, cos θ). Output dimensions equal input; out-of-source samples
// stay transparent, so the mount anchor is valid for every frame.
function rotateGridAny(grid: PixelGrid, angle: number, cx: number, cy: number): PixelGrid {
  const out: PixelGrid = {
    width: grid.width,
    height: grid.height,
    rgba: new Uint8ClampedArray(grid.width * grid.height * 4),
  };
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const sx = Math.round(cx + dx * cos - dy * sin);
      const sy = Math.round(cy + dx * sin + dy * cos);
      if (sx < 0 || sx >= grid.width || sy < 0 || sy >= grid.height) continue;
      const s = (sy * grid.width + sx) * 4;
      const d = (y * grid.width + x) * 4;
      out.rgba[d] = grid.rgba[s];
      out.rgba[d + 1] = grid.rgba[s + 1];
      out.rgba[d + 2] = grid.rgba[s + 2];
      out.rgba[d + 3] = grid.rgba[s + 3];
    }
  }
  return out;
}

export const BOAT_TURRET: SpriteDef = {
  frames: Array.from({ length: TURRET_STEPS }, (_, i) =>
    i === 0 ? TURRET_BASE : rotateGridAny(TURRET_BASE, i * TURRET_STEP, 6, 4),
  ),
  anchors: { mount: [6, 4] },
};

// Nearest rotation frame for a turret angle (radians, 0 = down-screen,
// +π/2 = screen right; see entities.ts turret slew).
export function turretFrame(angle: number): number {
  return ((Math.round(angle / TURRET_STEP) % TURRET_STEPS) + TURRET_STEPS) % TURRET_STEPS;
}

// Index of the turret layer in createBoat()'s layer array.
export const TURRET_LAYER = 1;
```

Add `PixelGrid` to the engine/sprite import. Keep `createBoat` unchanged.

Note on the inverse map: the forward transform sends a source offset `(0, r)` (below the pivot) to `(r·sinθ, r·cosθ)`; the code above is its inverse. If the barrel test asserts the wrong direction, the sign of `sin` is flipped — fix the map, not the test: frame 4 MUST point the barrel screen-right.

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/game/sprites/boat.test.ts` → PASS. Then `npm test` and `npm run typecheck` → green (the explorer dev screen reads `frames[0]` only and keeps working).

- [ ] **Step 5: Commit**

```bash
git add src/game/sprites/boat.ts src/game/sprites/boat.test.ts
git commit -m "feat: 16-frame rotating boat turret with angle-to-frame mapping"
```

---

### Task 3: Boat spray + turret slew (`entities.ts`)

**Files:**
- Modify: `src/game/entities.ts`
- Test: `src/game/entities.test.ts`

**Interfaces:**
- Consumes: `intercept` from `./aim` (Task 1). `import { intercept } from './aim';` is runtime-safe: aim.ts has type-only imports, no cycle.
- Produces: `Enemy` fields `sprayLeft, sprayTick, sprayVX, sprayVY: number`, `sprayLead: boolean`, `turretAngle: number`; `tickEnemies(w, dt, camY, player, playerVel?)` (5th param defaults to a zero vector — existing 4-arg callers compile unchanged); exported constants `SPRAY_SIZE`, `SPRAY_TICK_GAP`, `SPRAY_LEAD_CHANCE`, `SPRAY_SPREAD`, `SPRAY_INTERVAL_MIN`, `SPRAY_INTERVAL_VAR`, `TURRET_SLEW_RATE`, `TURRET_BARREL_LEN`, `BOAT_SHOT_SPEED` (now exported).

- [ ] **Step 1: Write the failing tests** — in `src/game/entities.test.ts`, inside `describe('enemy behaviors', ...)`, REPLACE the two boat tests (`'boat fires an aimed shot when timer elapses on-screen'` and `'boat holds fire while off-screen'`) with:

```ts
  function tickBoat(w: ReturnType<typeof createWorld>, n: number, player = { x: 200, y: 300 }, vel = { x: 0, y: 0 }) {
    for (let i = 0; i < n; i++) tickEnemies(w, 1 / 60, 0, player, vel);
  }

  it('boat fires a 5-shot spray at 4-tick gaps, then re-arms in [2.8, 3.6)', () => {
    const w = createWorld(mulberry32(7));
    const e = spawnBoat(w, 320, 100)!;
    e.vel.y = 0;
    e.fireTimer = 0.01;
    // 30 ticks: the spray (ticks 0..16) is done and no shot has yet left
    // the despawn band (280 px/s from y≈116 stays well inside 480+64).
    const counts: number[] = [];
    for (let i = 0; i < 30; i++) {
      tickEnemies(w, 1 / 60, 0, { x: 200, y: 300 }, { x: 0, y: 0 });
      counts.push(w.enemyBullets.countAlive());
    }
    expect(w.enemyBullets.countAlive()).toBe(SPRAY_SIZE);
    // Shots land one per SPRAY_TICK_GAP ticks: find the ticks where the
    // count increments and check consecutive gaps.
    const shotTicks = counts
      .map((c, i) => (c > (counts[i - 1] ?? 0) ? i : -1))
      .filter((i) => i >= 0);
    expect(shotTicks).toHaveLength(SPRAY_SIZE);
    for (let i = 1; i < shotTicks.length; i++) {
      expect(shotTicks[i] - shotTicks[i - 1]).toBe(SPRAY_TICK_GAP);
    }
    expect(e.sprayLeft).toBe(0);
    expect(e.fireTimer).toBeGreaterThanOrEqual(SPRAY_INTERVAL_MIN);
    expect(e.fireTimer).toBeLessThan(SPRAY_INTERVAL_MIN + SPRAY_INTERVAL_VAR);
  });

  it('boat holds fire while off-screen', () => {
    const w = createWorld(mulberry32(1));
    const e = spawnBoat(w, 320, -CAM_MARGIN)!;
    e.vel.y = 0;
    e.fireTimer = 0.01;
    tickBoat(w, 10);
    expect(w.enemyBullets.countAlive()).toBe(0);
  });

  it('re-lead sprays occur at roughly the 10% seeded rate', () => {
    const w = createWorld(mulberry32(42));
    const e = spawnBoat(w, 320, 100)!;
    e.vel.y = 0;
    let leads = 0;
    for (let s = 0; s < 200; s++) {
      e.fireTimer = 0.001;
      e.sprayLeft = 0;
      tickBoat(w, 1);
      if (e.sprayLead) leads++;
      e.sprayLeft = 0; // abort the spray; we only sample the mode roll
    }
    expect(leads).toBeGreaterThan(5);
    expect(leads).toBeLessThan(45);
  });

  it('one-lead spray converges near a straight-moving player', () => {
    const w = createWorld(mulberry32(3)); // seed 3: first rng() >= 0.10 → one-lead
    const e = spawnBoat(w, 320, 100)!;
    e.vel.y = 0;
    e.turretAngle = Math.atan2(200 - 320, 300 - 100); // pre-aimed near the solution
    e.fireTimer = 0.001;
    const player = { x: 200, y: 300 };
    const vel = { x: 180, y: 0 };
    // Advance world and player together for 2 seconds.
    let minDist = Infinity;
    for (let i = 0; i < 120; i++) {
      tickEnemies(w, 1 / 60, 0, player, vel);
      tickEnemyBullets(w, 1 / 60, 0);
      player.x += vel.x / 60;
      w.enemyBullets.forEachAlive((b) => {
        minDist = Math.min(minDist, Math.hypot(b.pos.x - player.x, b.pos.y - player.y));
      });
    }
    // Leading + ±4° jitter + slew: at least one shot passes close.
    expect(minDist).toBeLessThan(30);
  });

  it('turret slews toward the player at the capped rate, short way around', () => {
    const w = createWorld(mulberry32(1));
    const e = spawnBoat(w, 320, 100)!;
    e.vel.y = 0;
    e.fireTimer = 999; // never spray; just track
    e.turretAngle = 0;
    // Player up-left of the boat: desired angle is far from 0.
    tickBoat(w, 1, { x: 100, y: -100 }, { x: 0, y: 0 });
    expect(Math.abs(e.turretAngle)).toBeCloseTo(TURRET_SLEW_RATE / 60, 5);
    const before = e.turretAngle;
    tickBoat(w, 60, { x: 100, y: -100 }, { x: 0, y: 0 });
    const desired = Math.atan2(100 - 320, -100 - 100);
    // After a second it has converged (|desired| < π so no wrap needed here;
    // the step-cap assertion above proves the rate limit).
    expect(e.turretAngle).toBeCloseTo(desired, 3);
    expect(Math.abs(e.turretAngle - before)).toBeLessThanOrEqual(TURRET_SLEW_RATE + 1e-9);
  });

  it('spray shots spawn from the barrel tip along the turret angle', () => {
    const w = createWorld(mulberry32(1));
    const e = spawnBoat(w, 320, 100)!;
    e.vel.y = 0;
    e.fireTimer = 0.001;
    // Player straight below: turret rests at 0 already.
    tickBoat(w, 2, { x: 320, y: 400 });
    let checked = false;
    w.enemyBullets.forEachAlive((b) => {
      expect(Math.abs(b.pos.x - 320)).toBeLessThan(2); // ±4° jitter over 16px
      expect(b.pos.y).toBeGreaterThan(100 + TURRET_BARREL_LEN - 2);
      expect(b.vel.y).toBeGreaterThan(0); // flying down toward the player
      expect(Math.hypot(b.vel.x, b.vel.y)).toBeCloseTo(BOAT_SHOT_SPEED, 5);
      checked = true;
    });
    expect(checked).toBe(true);
  });

  it('sprays are deterministic under a fixed seed', () => {
    const run = (seed: number) => {
      const w = createWorld(mulberry32(seed));
      const e = spawnBoat(w, 320, 100)!;
      e.vel.y = 0;
      e.fireTimer = 0.001;
      for (let i = 0; i < 60; i++) tickEnemies(w, 1 / 60, 0, { x: 250, y: 350 }, { x: 90, y: 0 });
      const out: number[] = [];
      w.enemyBullets.forEachAlive((b) => out.push(b.pos.x, b.pos.y, b.vel.x, b.vel.y));
      return out;
    };
    expect(run(9)).toEqual(run(9));
  });
```

Add to the test file's imports from `./entities`: `SPRAY_SIZE, SPRAY_TICK_GAP, SPRAY_INTERVAL_MIN, SPRAY_INTERVAL_VAR, TURRET_SLEW_RATE, TURRET_BARREL_LEN, BOAT_SHOT_SPEED`. Also extend the `'spawnBoat fills boat fields'` test with:

```ts
    expect(e.sprayLeft).toBe(0);
    expect(e.turretAngle).toBe(0);
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/game/entities.test.ts`
Expected: FAIL — missing exports and fields.

- [ ] **Step 3: Implement** — in `src/game/entities.ts`:

Add to the `Enemy` interface (after `hasFired`):

```ts
  sprayLeft: number;    // boats: shots remaining in the running spray (0 = idle)
  sprayTick: number;    // boats: tick counter inside the spray
  sprayVX: number;      // boats: cached unit aim direction (one-lead mode)
  sprayVY: number;
  sprayLead: boolean;   // boats: true = re-solve the intercept every shot
  turretAngle: number;  // boats: radians; direction (sin θ, cos θ), 0 = down-screen
```

Initialize in `makeEnemy`: `sprayLeft: 0, sprayTick: 0, sprayVX: 0, sprayVY: 1, sprayLead: false, turretAngle: 0,`. Reset in `spawnBoat` and `spawnDelta`: `e.sprayLeft = 0; e.sprayTick = 0; e.sprayVX = 0; e.sprayVY = 1; e.sprayLead = false; e.turretAngle = 0;`.

Add `import { intercept } from './aim';` and the constants (replace `const BOAT_SHOT_SPEED` with an export):

```ts
export const BOAT_SHOT_SPEED = 280;
export const SPRAY_SIZE = 5;
export const SPRAY_TICK_GAP = 4;
export const SPRAY_LEAD_CHANCE = 0.10;
export const SPRAY_SPREAD = (4 * Math.PI) / 180;
export const SPRAY_INTERVAL_MIN = 2.8;
export const SPRAY_INTERVAL_VAR = 0.8;
export const TURRET_SLEW_RATE = 3.0;   // rad/s
export const TURRET_BARREL_LEN = 16;   // px from boat center to muzzle

const ZERO_VEL: Vec2 = { x: 0, y: 0 };
```

Change the signature to `export function tickEnemies(w: World, dt: number, camY: number, player: Vec2, playerVel: Vec2 = ZERO_VEL): void` and replace the entire `if (e.enemyKind === 'boat') { ... }` fire block with:

```ts
    if (e.enemyKind === 'boat') {
      // Aim direction (unit): the cached solution mid-spray in one-lead
      // mode, a live intercept of the player otherwise (tracking while
      // idle, re-solving per tick in re-lead mode).
      let aimX: number;
      let aimY: number;
      if (e.sprayLeft > 0 && !e.sprayLead) {
        aimX = e.sprayVX;
        aimY = e.sprayVY;
      } else {
        const p = intercept(e.pos.x, e.pos.y, player.x, player.y, playerVel.x, playerVel.y, BOAT_SHOT_SPEED);
        const dx = p.x - e.pos.x;
        const dy = p.y - e.pos.y;
        const d = Math.hypot(dx, dy) || 1;
        aimX = dx / d;
        aimY = dy / d;
      }

      // Start a spray when the timer expires on-screen; the mode roll and
      // aim cache happen once, at spray start.
      if (e.sprayLeft === 0) {
        e.fireTimer -= dt;
        if (e.fireTimer <= 0 && e.pos.y >= camY && e.pos.y <= camY + HEIGHT) {
          e.sprayLeft = SPRAY_SIZE;
          e.sprayTick = 0;
          e.sprayLead = w.rng() < SPRAY_LEAD_CHANCE;
          e.sprayVX = aimX;
          e.sprayVY = aimY;
        }
      }

      // Slew the turret toward the aim, rate-capped, short way around.
      // Shots leave along the barrel: if the target outruns the traverse,
      // they go where the turret points, not where the math wants.
      const desired = Math.atan2(aimX, aimY);
      let diff = desired - e.turretAngle;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      const maxTurn = TURRET_SLEW_RATE * dt;
      e.turretAngle += Math.max(-maxTurn, Math.min(maxTurn, diff));
      while (e.turretAngle > Math.PI) e.turretAngle -= Math.PI * 2;
      while (e.turretAngle < -Math.PI) e.turretAngle += Math.PI * 2;

      if (e.sprayLeft > 0) {
        if (e.sprayTick % SPRAY_TICK_GAP === 0) {
          const b = w.enemyBullets.spawn();
          if (b) {
            const a = e.turretAngle + (w.rng() * 2 - 1) * SPRAY_SPREAD;
            b.pos.x = e.pos.x + Math.sin(a) * TURRET_BARREL_LEN;
            b.pos.y = e.pos.y + Math.cos(a) * TURRET_BARREL_LEN;
            b.age = 0;
            b.radius = 4;
            b.vel.x = Math.sin(a) * BOAT_SHOT_SPEED;
            b.vel.y = Math.cos(a) * BOAT_SHOT_SPEED;
          }
          e.sprayLeft--;
          if (e.sprayLeft === 0) {
            e.fireTimer = SPRAY_INTERVAL_MIN + w.rng() * SPRAY_INTERVAL_VAR;
          }
        }
        e.sprayTick++;
      }
    } else if (e.enemyKind === 'delta') {
```

(The delta branch is unchanged.)

RNG draw order per spray, fixed and documented by the determinism test: 1 mode roll at start, 1 jitter per shot (5), 1 interval roll at end.

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/game/entities.test.ts` → PASS. Then `npm test` and `npm run typecheck`. The `top.ts` call site still passes 4 args (playerVel defaults to zero) — Task 5 wires the real velocity.

If the seed chosen for `'one-lead spray converges...'` happens to roll re-lead mode (rng < 0.10), pick the next seed that rolls one-lead and update the comment — the test's intent is the cached-solution path.

- [ ] **Step 5: Commit**

```bash
git add src/game/entities.ts src/game/entities.test.ts
git commit -m "feat: boat 5-shot leading sprays with slewing turret"
```

---

### Task 4: Player gun auto-aim (`weapons.ts`)

**Files:**
- Modify: `src/game/weapons.ts`
- Test: `src/game/weapons.test.ts`

**Interfaces:**
- Consumes: `coneTarget`, `intercept`, `CHAIN_CONE`, `MINIGUN_CONE` from `./aim`; `enemyVelocity`, `type Enemy` from `./entities` (Task 1).
- Produces: no signature changes — `tickWeapons` behavior only. `fireBullet` gains optional trailing params `vx`, `vy` (internal).

- [ ] **Step 1: Write the failing tests** — append to `src/game/weapons.test.ts`:

```ts
describe('auto-aim', () => {
  // Nose mount sits at (320, 390); mounts() above.
  const DEG = Math.PI / 180;

  function placeEnemy(w: ReturnType<typeof createWorld>, angleDeg: number, dist: number) {
    const e = spawnBoat(w, 320 + Math.sin(angleDeg * DEG) * dist, 390 - Math.cos(angleDeg * DEG) * dist)!;
    e.vel.x = 0; e.vel.y = 0; // stationary: intercept == position
    return e;
  }

  it('chain gun bends toward an in-cone enemy at full bullet speed', () => {
    const w = createWorld(mulberry32(1));
    const r = createRun();
    const e = placeEnemy(w, 30, 200);
    const ws = createWeaponState();
    tickWeapons(w, r, ws, mounts(), true, DT);
    const b = w.bullets.items.find((x) => x.alive)!;
    const speed = Math.hypot(b.vel.x, b.vel.y);
    expect(speed).toBeCloseTo(840, 5);
    // Velocity points from the nose at the (stationary) enemy.
    const want = Math.atan2(e.pos.x - 320, -(e.pos.y - 390));
    expect(Math.atan2(b.vel.x, -b.vel.y)).toBeCloseTo(want, 5);
  });

  it('chain gun ignores an enemy 46° off-axis and fires straight up', () => {
    const w = createWorld(mulberry32(1));
    const r = createRun();
    placeEnemy(w, 46, 200);
    const ws = createWeaponState();
    tickWeapons(w, r, ws, mounts(), true, DT);
    const b = w.bullets.items.find((x) => x.alive)!;
    expect(b.vel.x).toBe(0);
    expect(b.vel.y).toBe(-840);
  });

  it('chain gun leads a moving enemy (aims ahead of it)', () => {
    const w = createWorld(mulberry32(1));
    const r = createRun();
    const e = placeEnemy(w, 0, 300);
    e.vel.x = 200; // strafing right
    const ws = createWeaponState();
    tickWeapons(w, r, ws, mounts(), true, DT);
    const b = w.bullets.items.find((x) => x.alive)!;
    expect(b.vel.x).toBeGreaterThan(0); // bent toward where the boat will be
  });

  it('miniguns track a 4° enemy but not a 6° one', () => {
    const w = createWorld(mulberry32(1));
    const r = createRun();
    grantWeapon(r, 'miniguns');
    placeEnemy(w, 6, 200);
    let ws = createWeaponState();
    tickWeapons(w, r, ws, mounts(), true, DT);
    w.bullets.forEachAlive((b) => {
      expect(b.vel.x).toBe(0); // 6° is outside ±5°: straight up
    });
    const w2 = createWorld(mulberry32(1));
    placeEnemy(w2, 4, 200);
    ws = createWeaponState();
    tickWeapons(w2, r, ws, mounts(), true, DT);
    let bent = 0;
    w2.bullets.forEachAlive((b) => {
      if (b.vel.x !== 0) bent++;
      expect(Math.hypot(b.vel.x, b.vel.y)).toBeCloseTo(840, 5);
    });
    expect(bent).toBe(2); // both pods converge on the shared target
  });
});
```

Add `spawnBoat` to the test file's `./entities` import and `mounts`/existing helpers are already in scope (the new describe lives in the same file).

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/game/weapons.test.ts`
Expected: new tests FAIL (bullets fire straight up regardless); existing tests PASS (their worlds have no enemies).

- [ ] **Step 3: Implement** — in `src/game/weapons.ts`:

```ts
import { CHAIN_CONE, MINIGUN_CONE, coneTarget, intercept } from './aim';
import { enemyVelocity, spawnShell, spawnSmoke, type Enemy, type Muzzle, type World } from './entities';
```

Extend `fireBullet` with an aimed velocity (default straight up, so `fireBarrel` and any unaimed call keep today's behavior):

```ts
function fireBullet(w: World, m: Muzzle, dmg: number, vx = 0, vy = -BULLET_SPEED): void {
  const b = w.bullets.spawn();
  if (b) {
    b.pos.x = m.x; b.pos.y = m.y; b.age = 0;
    b.vel.x = vx; b.vel.y = vy;
    b.hp = 1; b.radius = 4;
    b.dmg = dmg;
    b.splash = false; b.homing = false; b.accel = 0; b.trail = false; b.trailCount = 0;
  }
}

// Fire from m at the target's intercept point (lead solution), or straight
// up with no target. Each barrel solves from its own muzzle, so paired
// miniguns converge slightly on a shared target.
function aimedFire(w: World, m: Muzzle, dmg: number, target: Enemy | undefined): void {
  if (!target) {
    fireBullet(w, m, dmg);
    return;
  }
  const v = enemyVelocity(target);
  const p = intercept(m.x, m.y, target.pos.x, target.pos.y, v.x, v.y, BULLET_SPEED);
  const dx = p.x - m.x;
  const dy = p.y - m.y;
  const d = Math.hypot(dx, dy) || 1;
  fireBullet(w, m, dmg, (dx / d) * BULLET_SPEED, (dy / d) * BULLET_SPEED);
}
```

Change `fireBarrel` to accept and forward a target: `function fireBarrel(w: World, m: Muzzle, dmg: number, target: Enemy | undefined): void { aimedFire(w, m, dmg, target); spawnShell(w, m); }`.

In `tickWeapons` case 1, replace `fireBullet(w, mounts.nose, CHAIN_DMG);` with:

```ts
      aimedFire(w, mounts.nose, CHAIN_DMG,
        coneTarget(w, mounts.nose.x, mounts.nose.y, CHAIN_CONE));
```

In case 2, replace the pod loop with:

```ts
      const target = coneTarget(
        w, (mounts.podL.x + mounts.podR.x) / 2, mounts.podL.y, MINIGUN_CONE,
      );
      for (const m of [mounts.podL, mounts.podR]) {
        fireBarrel(w, m, MINIGUN_DMG, target);
        if (ws.shotCount % 3 === 0) spawnSmoke(w, m.x, m.y + 8, 0.8);
      }
```

Rockets (case 3) and missiles (case 4) untouched.

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/game/weapons.test.ts` → PASS (all existing tests unmodified). Then `npm test` and `npm run typecheck` → green.

- [ ] **Step 5: Commit**

```bash
git add src/game/weapons.ts src/game/weapons.test.ts
git commit -m "feat: chain gun and minigun cone auto-aim with target leading"
```

---

### Task 5: Scene integration — player velocity, turret frames, reticle, docs

**Files:**
- Modify: `src/game/scenes/top.ts`
- Modify: `docs/architecture.md`
- Test: existing suites (no new headless surface: reticle/turret drawing is draw-pass only; the selection logic was tested in Tasks 1-3)

**Interfaces:**
- Consumes: `reticleTarget` from `../aim`; `TURRET_LAYER`, `turretFrame` from `../sprites/boat`; `tickEnemies` 5th param (Task 3); `PALETTE[8]` HUD yellow.
- Produces: nothing downstream; final task.

- [ ] **Step 1: Wire the player's velocity into `tickEnemies`**

In `createTopScene`'s closure (near `playerPos`), add a reused vector:

```ts
  const playerVel: Vec2 = { x: 0, y: 0 };
```

(`Vec2` is already imported from `../entities` — if only as a type elsewhere, add it to that import.) In the movement block, after the diagonal normalization and BEFORE the position clamps, record the commanded velocity in px/s:

```ts
        playerVel.x = dx * SPEED;
        playerVel.y = dy * SPEED;
```

Change the tick call to `tickEnemies(world, dt, camera.y, playerPos, playerVel);`. Reset `playerVel.x = 0; playerVel.y = 0;` in `enter()` alongside the other state resets.

- [ ] **Step 2: Per-boat turret frame in the draw pass**

Import `TURRET_LAYER, turretFrame` alongside `createBoat` from `../sprites/boat`. In the enemies draw loop, replace the boat branch:

```ts
        } else {
          assets.boat.sprite.layers[TURRET_LAYER].frame = turretFrame(e.turretAngle);
          drawLayered(ctx, assets.boat, x, y);
        }
```

(Same per-entity frame-poke pattern as the delta pose lines directly above it.)

- [ ] **Step 3: Reticle drawing**

Import `reticleTarget` from `../aim`. Add a module-level helper in `top.ts` (below the other file-local helpers):

```ts
// Four corner brackets just outside the target's radius, HUD yellow.
// Draw-only: computed in the draw pass, so it never touches game state.
function drawReticle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.fillStyle = PALETTE[8];
  const s = r + 4;  // half-size of the bracket box
  const arm = 6;    // bracket arm length
  const t = 2;      // stroke thickness
  const l = Math.round(x - s);
  const rt = Math.round(x + s);
  const tp = Math.round(y - s);
  const bt = Math.round(y + s);
  ctx.fillRect(l, tp, arm, t);            ctx.fillRect(l, tp, t, arm);
  ctx.fillRect(rt - arm, tp, arm, t);     ctx.fillRect(rt - t, tp, t, arm);
  ctx.fillRect(l, bt - t, arm, t);        ctx.fillRect(l, bt - arm, t, arm);
  ctx.fillRect(rt - arm, bt - t, arm, t); ctx.fillRect(rt - t, bt - arm, t, arm);
}
```

In `draw()`, after the chopper draw and before the particles, add:

```ts
      // Targeting reticle on the selected weapon's lock (blink 2 on / 2 off).
      if (overlay === 'playing' && Math.floor(ticks / 2) % 2 === 0) {
        const lock = reticleTarget(world, run, playerPos.x, playerPos.y);
        if (lock) drawReticle(ctx, lock.pos.x - camera.x, lock.pos.y - camera.y, lock.radius);
      }
```

(Use the actual overlay-state variable name in the file — it is `overlay` today; the guard means no reticle on pause/complete/gameover frames.)

- [ ] **Step 4: Full suite + typecheck**

Run: `npm test` and `npm run typecheck` → all green. Then `npm run dev` and eyeball TOP mode briefly: turret traverses toward the chopper, boats fire 5-shot bursts, chain shots angle toward boats, reticle blinks on the tracked enemy. (The thorough visual pass happens after merge per the spec.)

- [ ] **Step 5: Update `docs/architecture.md`**

In the module map, add `src/game/aim.ts` — "intercept solver, cone target selection, reticle target choice; pure, type-only runtime imports." Update the descriptions of `entities.ts` (boat sprays: 5 shots at 4-tick gaps, one-lead vs 10% re-lead, turret slew at 3 rad/s, `tickEnemies` playerVel param), `weapons.ts` (chain ±45° / minigun ±5° cone auto-aim with leading; straight-up fallback), `sprites/boat.ts` (16 pre-rotated turret frames, `turretFrame`), and the TOP scene section (per-boat turret frame poke, blinking corner-bracket reticle for slots 1/2/4). Keep it current-state only — no history.

- [ ] **Step 6: Commit**

```bash
git add src/game/scenes/top.ts docs/architecture.md
git commit -m "feat: wire auto-aim into TOP — player velocity, turret frames, reticle"
```

---

## Self-Review Notes

- Spec §1 `enemyVelocity` is implemented in `entities.ts` (not `aim.ts`) so `aim.ts` stays runtime-import-free and `entities.ts → aim.ts` is acyclic; the spec was amended to match.
- Spec §4 reticle blink "2 ticks on / 2 off" = `Math.floor(ticks / 2) % 2 === 0`.
- Missile-slot reticle uses `coneTarget(w, x, y, Math.PI)` — bearing test always passes, degrading to nearest-enemy, so no extra import of `nearestEnemy`.
- Existing weapons tests run with empty enemy pools → `coneTarget` returns undefined → straight-up fire → all pass unmodified. Existing entities boat tests DO change (Task 3 replaces two and extends one).
