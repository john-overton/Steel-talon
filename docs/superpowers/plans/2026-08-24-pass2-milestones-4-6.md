# Steel Talon Pass 2 (Milestones 4–6, Combat) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bullets with pooling and fire rate, a drone-boat enemy with circle collision and particle explosions, and synthesized blip SFX — with muzzle flashes, ejected shells, and gun smoke for flavor.

**Architecture:** New game-agnostic engine modules (`pool`, `rng`, `collide`, `audio`) plus a small `Layer.visible` extension to the sprite system; game-side `entities.ts` holds the flat Entity model, pools, and pure tick/fire/collision systems; `main.ts` wires it into the existing sandbox. All gameplay randomness flows through one seeded mulberry32 instance.

**Tech Stack:** TypeScript strict, Canvas 2D, Web Audio, Vitest. Zero runtime dependencies.

## Global Constraints

- Nothing in `src/engine/` may import from `src/game/`.
- No `Math.random()`, `Date.now()`, or `performance.now()` in update logic — all gameplay randomness through the seeded mulberry32 instance.
- No allocation in the hot loop: bullets/particles/enemies come from fixed pools created at boot; `spawn()` never allocates.
- Fire rate exactly 8 shots/sec (`FIRE_INTERVAL = 0.125`); bullet vel (0, −420), radius 2, despawn at `pos.y < -8` or `age > 2`.
- Boat spawn: interval `1.2 + rng()` seconds, `x = 24 + rng() * (WIDTH - 48)`, `y = -16`, vel (0, 60), hp 3, radius 10; despawn below `HEIGHT + 16`.
- Pools: bullets 64, particles 256, enemies 16.
- Palette chars/indices: yellow `8`, orange `5`, brass `6`, white `l`(21), gunmetal `m`(22), smoke `o`(24)/`p`(25), dark `1`.
- TDD: write the failing test first. Run tests with `npx vitest run <file>`; full suite `npm test`; `npm run typecheck` must stay clean.
- Test style: follow the existing suites (`src/engine/*.test.ts`, `src/game/sprites/player.test.ts`).
- Commit after each green task with a `feat:`/`test:` conventional message.

---

### Task 1: Generic object pool (engine)

**Files:**
- Create: `src/engine/pool.ts`
- Test: `src/engine/pool.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `createPool<T extends { alive: boolean }>(size: number, factory: () => T): Pool<T>` where `Pool<T> = { items: readonly T[]; spawn(): T | undefined; forEachAlive(fn: (item: T) => void): void; countAlive(): number; reset(): void }`. Task 5 builds all entity pools on this.

- [ ] **Step 1: Write the failing test**

```ts
// src/engine/pool.test.ts
import { describe, expect, it } from 'vitest';
import { createPool } from './pool';

interface Thing { alive: boolean; n: number; }
const factory = (): Thing => ({ alive: false, n: 0 });

describe('createPool', () => {
  it('allocates size items up front, all dead', () => {
    const pool = createPool(4, factory);
    expect(pool.items).toHaveLength(4);
    expect(pool.countAlive()).toBe(0);
  });

  it('spawn marks an item alive and returns it', () => {
    const pool = createPool(2, factory);
    const a = pool.spawn();
    expect(a?.alive).toBe(true);
    expect(pool.countAlive()).toBe(1);
  });

  it('spawn returns undefined when exhausted', () => {
    const pool = createPool(2, factory);
    pool.spawn();
    pool.spawn();
    expect(pool.spawn()).toBeUndefined();
  });

  it('reuses dead slots without allocating', () => {
    const pool = createPool(2, factory);
    const a = pool.spawn()!;
    pool.spawn();
    a.alive = false;
    const c = pool.spawn();
    expect(c).toBe(a); // same object, recycled
    expect(pool.items).toHaveLength(2);
  });

  it('forEachAlive visits only living items', () => {
    const pool = createPool(3, factory);
    const a = pool.spawn()!;
    a.n = 7;
    const visited: number[] = [];
    pool.forEachAlive((t) => visited.push(t.n));
    expect(visited).toEqual([7]);
  });

  it('reset kills everything', () => {
    const pool = createPool(3, factory);
    pool.spawn();
    pool.spawn();
    pool.reset();
    expect(pool.countAlive()).toBe(0);
  });

  it('factory items are forced dead even if created alive', () => {
    const pool = createPool(2, () => ({ alive: true }));
    expect(pool.countAlive()).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/engine/pool.test.ts`
Expected: FAIL — cannot resolve `./pool`.

- [ ] **Step 3: Write the implementation**

```ts
// src/engine/pool.ts
// Fixed-size object pool (engine spec §7): everything is allocated at
// creation; spawn() recycles dead slots and never allocates.
export interface Pool<T extends { alive: boolean }> {
  items: readonly T[];
  spawn(): T | undefined;
  forEachAlive(fn: (item: T) => void): void;
  countAlive(): number;
  reset(): void;
}

export function createPool<T extends { alive: boolean }>(
  size: number,
  factory: () => T,
): Pool<T> {
  const items: T[] = Array.from({ length: size }, () => {
    const item = factory();
    item.alive = false;
    return item;
  });
  return {
    items,
    spawn() {
      for (const item of items) {
        if (!item.alive) {
          item.alive = true;
          return item;
        }
      }
      return undefined;
    },
    forEachAlive(fn) {
      for (const item of items) if (item.alive) fn(item);
    },
    countAlive() {
      let n = 0;
      for (const item of items) if (item.alive) n++;
      return n;
    },
    reset() {
      for (const item of items) item.alive = false;
    },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/engine/pool.test.ts` — PASS. Then `npm run typecheck` — clean.

- [ ] **Step 5: Commit**

```bash
git add src/engine/pool.ts src/engine/pool.test.ts
git commit -m "feat: generic fixed-size object pool"
```

---

### Task 2: Seeded RNG and circle collision (engine)

**Files:**
- Create: `src/engine/rng.ts`, `src/engine/collide.ts`
- Test: `src/engine/rng.test.ts`, `src/engine/collide.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `mulberry32(seed: number): () => number` (deterministic, [0,1)); `circlesOverlap(ax: number, ay: number, ar: number, bx: number, by: number, br: number): boolean` (strict inequality). Tasks 5–8 consume both.

- [ ] **Step 1: Write the failing tests**

```ts
// src/engine/rng.test.ts
import { describe, expect, it } from 'vitest';
import { mulberry32 } from './rng';

describe('mulberry32', () => {
  it('same seed yields an identical sequence', () => {
    const a = mulberry32(1234);
    const b = mulberry32(1234);
    const seqA = Array.from({ length: 100 }, () => a());
    const seqB = Array.from({ length: 100 }, () => b());
    expect(seqA).toEqual(seqB);
  });

  it('different seeds yield different sequences', () => {
    const a = mulberry32(1);
    const b = mulberry32(2);
    const seqA = Array.from({ length: 10 }, () => a());
    const seqB = Array.from({ length: 10 }, () => b());
    expect(seqA).not.toEqual(seqB);
  });

  it('outputs stay in [0, 1) and vary', () => {
    const rng = mulberry32(42);
    const seq = Array.from({ length: 1000 }, () => rng());
    for (const v of seq) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
    expect(new Set(seq).size).toBeGreaterThan(900);
  });
});
```

```ts
// src/engine/collide.test.ts
import { describe, expect, it } from 'vitest';
import { circlesOverlap } from './collide';

describe('circlesOverlap', () => {
  it('detects overlapping circles', () => {
    expect(circlesOverlap(0, 0, 5, 3, 0, 5)).toBe(true);
  });

  it('rejects distant circles', () => {
    expect(circlesOverlap(0, 0, 2, 100, 100, 2)).toBe(false);
  });

  it('treats exact touching as non-overlap (strict)', () => {
    expect(circlesOverlap(0, 0, 3, 5, 0, 2)).toBe(false); // distance 5 === 3+2
  });

  it('handles concentric circles', () => {
    expect(circlesOverlap(10, 10, 1, 10, 10, 8)).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/engine/rng.test.ts src/engine/collide.test.ts`
Expected: FAIL — cannot resolve modules.

- [ ] **Step 3: Write the implementations**

```ts
// src/engine/rng.ts
// mulberry32: the single seeded PRNG behind all gameplay randomness
// (engine spec §5). Deterministic: same seed, same run.
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
```

```ts
// src/engine/collide.ts
// Circle-vs-circle, squared distances, strict inequality — no sqrt
// (engine spec §7).
export function circlesOverlap(
  ax: number, ay: number, ar: number,
  bx: number, by: number, br: number,
): boolean {
  const dx = bx - ax;
  const dy = by - ay;
  const r = ar + br;
  return dx * dx + dy * dy < r * r;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/engine/rng.test.ts src/engine/collide.test.ts` — PASS. `npm run typecheck` — clean.

- [ ] **Step 5: Commit**

```bash
git add src/engine/rng.ts src/engine/rng.test.ts src/engine/collide.ts src/engine/collide.test.ts
git commit -m "feat: seeded mulberry32 RNG and circle collision"
```

---

### Task 3: Layer visibility flag (engine sprite extension)

**Files:**
- Modify: `src/engine/sprite.ts` (the `Layer` interface and `drawLayered`)
- Test: `src/engine/sprite.test.ts` (append)

**Interfaces:**
- Consumes: existing `Layer`, `drawLayered`, `PreparedLayered` in `src/engine/sprite.ts`.
- Produces: `Layer.visible?: boolean` — when `false`, `drawLayered` skips the layer; `undefined`/`true` draws. Task 4's muzzle-flash layers and Task 10's wiring rely on this.

- [ ] **Step 1: Write the failing test** (append to `src/engine/sprite.test.ts`; reuse the file's existing local test palette if one exists, else the inline one below)

```ts
describe('drawLayered visibility', () => {
  it('skips layers with visible: false', () => {
    const grid = parseGrid(['0'], ['#102030']);
    const def = { frames: [grid], anchors: { a: [0, 0] as const } };
    const sprite = {
      layers: [
        { def, frame: 0 },
        { def, frame: 0, attach: { to: 'a', by: 'a' }, visible: false },
        { def, frame: 0, attach: { to: 'a', by: 'a' }, visible: true },
      ],
    };
    const fake = {} as HTMLCanvasElement;
    const prepared = { sprite, canvases: [[fake], [fake], [fake]] };
    const calls: unknown[][] = [];
    const ctx = {
      drawImage: (...args: unknown[]) => { calls.push(args); },
    } as unknown as CanvasRenderingContext2D;
    drawLayered(ctx, prepared, 10, 10);
    expect(calls).toHaveLength(2); // base + visible:true; visible:false skipped
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/engine/sprite.test.ts`
Expected: FAIL — 3 drawImage calls recorded, or a type error on `visible`.

- [ ] **Step 3: Implement**

In `src/engine/sprite.ts`, add to the `Layer` interface:

```ts
export interface Layer {
  def: SpriteDef;
  frame: number;
  attach?: { to: string; by: string }; // base anchor name / own anchor name
  visible?: boolean; // false hides the layer; undefined/true draws
}
```

In `drawLayered`, skip hidden layers at the top of the forEach:

```ts
  sprite.layers.forEach((layer, i) => {
    if (layer.visible === false) return;
    const grid = layer.def.frames[layer.frame];
    // ... existing drawImage call unchanged
  });
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/engine/sprite.test.ts` — PASS. `npm run typecheck` — clean.

- [ ] **Step 5: Commit**

```bash
git add src/engine/sprite.ts src/engine/sprite.test.ts
git commit -m "feat: optional visible flag on sprite layers"
```

---

### Task 4: Tracer and muzzle-flash sprites; flash layers on the chopper

**Files:**
- Create: `src/game/sprites/shots.ts`
- Modify: `src/game/sprites/player.ts` (add `muzzleL`/`muzzleR` anchors; add two flash layers to `createChopper`)
- Test: `src/game/sprites/shots.test.ts`; modify `src/game/sprites/player.test.ts`

**Interfaces:**
- Consumes: `parseGrid`, `SpriteDef` from `src/engine/sprite.ts`; `PALETTE` from `src/game/palette.ts`; `Layer.visible` from Task 3.
- Produces: `TRACER: SpriteDef` (2x4, anchor `center: [1, 2]`); `MUZZLE_FLASH: SpriteDef` (two 5x5 frames, anchor `mount: [2, 2]`); `CHOPPER_BODY.anchors.muzzleL === [6, 13]`, `muzzleR === [25, 13]`; `createChopper()` returns **6** layers — body, podL, podR, rotor, flashL, flashR — with both flash layers `visible: false`, attached `{ to: 'muzzleL'|'muzzleR', by: 'mount' }`. Task 10 toggles `layers[4]`/`layers[5]`.

- [ ] **Step 1: Write the failing tests**

```ts
// src/game/sprites/shots.test.ts
import { describe, expect, it } from 'vitest';
import { MUZZLE_FLASH, TRACER } from './shots';

describe('shot sprites', () => {
  it('tracer is a single 2x4 frame with a center anchor', () => {
    expect(TRACER.frames).toHaveLength(1);
    expect(TRACER.frames[0].width).toBe(2);
    expect(TRACER.frames[0].height).toBe(4);
    expect(TRACER.anchors.center).toEqual([1, 2]);
  });

  it('muzzle flash has two 5x5 frames and a mount anchor', () => {
    expect(MUZZLE_FLASH.frames).toHaveLength(2);
    for (const f of MUZZLE_FLASH.frames) {
      expect(f.width).toBe(5);
      expect(f.height).toBe(5);
    }
    expect(MUZZLE_FLASH.anchors.mount).toEqual([2, 2]);
  });
});
```

In `src/game/sprites/player.test.ts`, update the layer-stack test and add flash coverage. Replace the body of `'createChopper stacks body, two rocket pods, then rotor on top'` with:

```ts
    const chopper = createChopper();
    expect(chopper.layers).toHaveLength(6);
    expect(chopper.layers[0].def).toBe(CHOPPER_BODY);
    expect(chopper.layers[1].def).toBe(ROCKET_POD);
    expect(chopper.layers[2].def).toBe(ROCKET_POD);
    expect(chopper.layers[3].def).toBe(CHOPPER_ROTOR);
    expect(chopper.layers[4].def).toBe(MUZZLE_FLASH);
    expect(chopper.layers[5].def).toBe(MUZZLE_FLASH);
```

(import `MUZZLE_FLASH` from `./shots` in the test) and add:

```ts
  it('muzzle flashes start hidden on the muzzle anchors', () => {
    const chopper = createChopper();
    expect(chopper.layers[4].visible).toBe(false);
    expect(chopper.layers[5].visible).toBe(false);
    expect(chopper.layers[4].attach).toEqual({ to: 'muzzleL', by: 'mount' });
    expect(chopper.layers[5].attach).toEqual({ to: 'muzzleR', by: 'mount' });
    expect(CHOPPER_BODY.anchors.muzzleL).toEqual([6, 13]);
    expect(CHOPPER_BODY.anchors.muzzleR).toEqual([25, 13]);
  });
```

Note: the existing test `'layer offsets keep every layer inside the 32x32 body footprint'` must keep passing — flash at muzzleL [6,13] minus mount [2,2] puts a 5x5 sprite at (4,11)–(8,15), inside the footprint; muzzleR at (23,11)–(27,15). No change needed there.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/game/sprites/shots.test.ts src/game/sprites/player.test.ts`
Expected: FAIL — shots module missing; chopper has 4 layers.

- [ ] **Step 3: Implement**

```ts
// src/game/sprites/shots.ts
// Projectile visuals. Palette: 8 = yellow, 5 = orange, l = white,
// m = gunmetal.
import { parseGrid, type SpriteDef } from '../../engine/sprite';
import { PALETTE } from '../palette';

// 2x4 tracer round: yellow tip, gunmetal tail.
export const TRACER: SpriteDef = {
  frames: [parseGrid(['88', '88', 'mm', 'mm'], PALETTE)],
  anchors: { center: [1, 2] },
};

// Two-frame muzzle flash: big white/yellow star, then a smaller orange
// cross. Shown for FLASH_TICKS after each shot, alternating frames.
export const MUZZLE_FLASH: SpriteDef = {
  frames: [
    parseGrid([
      '..8..',
      '.888.',
      '88l88',
      '.888.',
      '..8..',
    ], PALETTE),
    parseGrid([
      '..5..',
      '.....',
      '5.8.5',
      '.....',
      '..5..',
    ], PALETTE),
  ],
  anchors: { mount: [2, 2] },
};
```

In `src/game/sprites/player.ts`:
1. Add to `CHOPPER_BODY.anchors`: `muzzleL: [6, 13], muzzleR: [25, 13],` (just above each rocket pod, at the wing's leading edge).
2. Import `MUZZLE_FLASH` from `./shots` and extend `createChopper`:

```ts
export function createChopper(): LayeredSprite {
  return {
    layers: [
      { def: CHOPPER_BODY, frame: 0 },
      { def: ROCKET_POD, frame: 0, attach: { to: 'podL', by: 'mount' } },
      { def: ROCKET_POD, frame: 0, attach: { to: 'podR', by: 'mount' } },
      { def: CHOPPER_ROTOR, frame: 0, attach: { to: 'mast', by: 'hub' } },
      { def: MUZZLE_FLASH, frame: 0, attach: { to: 'muzzleL', by: 'mount' }, visible: false },
      { def: MUZZLE_FLASH, frame: 0, attach: { to: 'muzzleR', by: 'mount' }, visible: false },
    ],
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/game/sprites/shots.test.ts src/game/sprites/player.test.ts` — PASS. `npm run typecheck` — clean.

- [ ] **Step 5: Commit**

```bash
git add src/game/sprites/shots.ts src/game/sprites/shots.test.ts src/game/sprites/player.ts src/game/sprites/player.test.ts
git commit -m "feat: tracer and muzzle-flash sprites, flash layers on chopper"
```

---

### Task 5: Entity model, world pools, movement ticks

**Files:**
- Create: `src/game/entities.ts`
- Test: `src/game/entities.test.ts`

**Interfaces:**
- Consumes: `createPool`, `Pool` from `src/engine/pool.ts`; `HEIGHT` from `src/engine/renderer.ts`; `PALETTE` from `./palette`.
- Produces (Tasks 6, 8, 10 rely on these exact names):

```ts
export interface Vec2 { x: number; y: number; }
export interface Entity {
  kind: 'player' | 'enemy' | 'bullet' | 'pickup' | 'particle';
  pos: Vec2; vel: Vec2;
  hp: number; radius: number;
  age: number; alive: boolean;
}
export interface Particle extends Entity {
  kind: 'particle';
  size: number;   // px square
  color: string;  // canvas fillStyle
  life: number;   // seconds until despawn
}
export interface World {
  bullets: Pool<Entity>;   // 64
  enemies: Pool<Entity>;   // 16
  particles: Pool<Particle>; // 256
  rng: () => number;
}
export function createWorld(rng: () => number): World;
export function tickBullets(w: World, dt: number): void;
export function tickParticles(w: World, dt: number): void;
export function tickEnemies(w: World, dt: number): void;
```

- [ ] **Step 1: Write the failing tests**

```ts
// src/game/entities.test.ts
import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../engine/rng';
import { createWorld, tickBullets, tickEnemies, tickParticles } from './entities';

const DT = 1 / 60;

describe('world', () => {
  it('creates pools of the specified sizes, all dead', () => {
    const w = createWorld(mulberry32(1));
    expect(w.bullets.items).toHaveLength(64);
    expect(w.enemies.items).toHaveLength(16);
    expect(w.particles.items).toHaveLength(256);
    expect(w.bullets.countAlive()).toBe(0);
  });
});

describe('tickBullets', () => {
  it('moves bullets by velocity and ages them', () => {
    const w = createWorld(mulberry32(1));
    const b = w.bullets.spawn()!;
    b.pos.x = 100; b.pos.y = 100; b.vel.x = 0; b.vel.y = -420; b.age = 0;
    tickBullets(w, DT);
    expect(b.pos.y).toBeCloseTo(100 - 420 * DT);
    expect(b.age).toBeCloseTo(DT);
  });

  it('despawns bullets above the screen', () => {
    const w = createWorld(mulberry32(1));
    const b = w.bullets.spawn()!;
    b.pos.y = -9; b.vel.y = 0;
    tickBullets(w, DT);
    expect(b.alive).toBe(false);
  });

  it('despawns bullets older than 2 seconds', () => {
    const w = createWorld(mulberry32(1));
    const b = w.bullets.spawn()!;
    b.pos.y = 200; b.vel.y = 0; b.age = 2.01;
    tickBullets(w, DT);
    expect(b.alive).toBe(false);
  });
});

describe('tickParticles', () => {
  it('moves, drags, and expires particles at end of life', () => {
    const w = createWorld(mulberry32(1));
    const p = w.particles.spawn()!;
    p.pos.x = 50; p.pos.y = 50; p.vel.x = 60; p.vel.y = 0; p.life = 0.1; p.age = 0;
    tickParticles(w, DT);
    expect(p.pos.x).toBeCloseTo(50 + 60 * DT);
    expect(p.vel.x).toBeLessThan(60); // drag
    expect(p.alive).toBe(true);
    for (let i = 0; i < 6; i++) tickParticles(w, DT); // past 0.1s
    expect(p.alive).toBe(false);
  });
});

describe('tickEnemies', () => {
  it('moves enemies and despawns them below the screen', () => {
    const w = createWorld(mulberry32(1));
    const e = w.enemies.spawn()!;
    e.pos.x = 320; e.pos.y = 100; e.vel.y = 60;
    tickEnemies(w, DT);
    expect(e.pos.y).toBeCloseTo(100 + 60 * DT);
    e.pos.y = 497; // HEIGHT (480) + 16 = 496 threshold
    tickEnemies(w, DT);
    expect(e.alive).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/game/entities.test.ts`
Expected: FAIL — cannot resolve `./entities`.

- [ ] **Step 3: Implement**

```ts
// src/game/entities.ts
// Flat entity model over fixed pools (engine spec §7): no ECS, no
// allocation in the hot loop. Systems are plain functions over a World.
import { createPool, type Pool } from '../engine/pool';
import { HEIGHT } from '../engine/renderer';
import { PALETTE } from './palette';

export interface Vec2 { x: number; y: number; }

export interface Entity {
  kind: 'player' | 'enemy' | 'bullet' | 'pickup' | 'particle';
  pos: Vec2; vel: Vec2;
  hp: number; radius: number;
  age: number; alive: boolean;
}

// Particles carry their own draw data so the render pass is one
// fillRect per particle, no sprite rasterization.
export interface Particle extends Entity {
  kind: 'particle';
  size: number;   // px square
  color: string;  // canvas fillStyle
  life: number;   // seconds until despawn
}

const BULLET_MAX_AGE = 2;
const PARTICLE_DRAG = 2; // fraction of velocity shed per second

function makeEntity(kind: Entity['kind']): Entity {
  return {
    kind,
    pos: { x: 0, y: 0 }, vel: { x: 0, y: 0 },
    hp: 0, radius: 0, age: 0, alive: false,
  };
}

function makeParticle(): Particle {
  return { ...makeEntity('particle'), kind: 'particle', size: 1, color: PALETTE[21], life: 0 };
}

export interface World {
  bullets: Pool<Entity>;
  enemies: Pool<Entity>;
  particles: Pool<Particle>;
  rng: () => number;
}

export function createWorld(rng: () => number): World {
  return {
    bullets: createPool(64, () => makeEntity('bullet')),
    enemies: createPool(16, () => makeEntity('enemy')),
    particles: createPool(256, makeParticle),
    rng,
  };
}

export function tickBullets(w: World, dt: number): void {
  w.bullets.forEachAlive((b) => {
    b.pos.x += b.vel.x * dt;
    b.pos.y += b.vel.y * dt;
    b.age += dt;
    if (b.pos.y < -8 || b.age > BULLET_MAX_AGE) b.alive = false;
  });
}

export function tickParticles(w: World, dt: number): void {
  w.particles.forEachAlive((p) => {
    p.pos.x += p.vel.x * dt;
    p.pos.y += p.vel.y * dt;
    p.vel.x *= 1 - PARTICLE_DRAG * dt;
    p.vel.y *= 1 - PARTICLE_DRAG * dt;
    p.age += dt;
    if (p.age >= p.life) p.alive = false;
  });
}

export function tickEnemies(w: World, dt: number): void {
  w.enemies.forEachAlive((e) => {
    e.pos.x += e.vel.x * dt;
    e.pos.y += e.vel.y * dt;
    e.age += dt;
    if (e.pos.y > HEIGHT + 16) e.alive = false;
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/game/entities.test.ts` — PASS. `npm run typecheck` — clean.

- [ ] **Step 5: Commit**

```bash
git add src/game/entities.ts src/game/entities.test.ts
git commit -m "feat: entity model, world pools, movement ticks"
```

---

### Task 6: Fire control — bullets, shells, smoke, flash state

**Files:**
- Modify: `src/game/entities.ts` (append)
- Test: `src/game/entities.test.ts` (append)

**Interfaces:**
- Consumes: Task 5's `World`, `Particle`; `PALETTE`.
- Produces (Task 10 relies on these):

```ts
export const FIRE_INTERVAL = 0.125; // 8 shots/sec
export const FLASH_TICKS = 2;
export interface Muzzle { x: number; y: number; dir: -1 | 1; } // dir = shell ejection side
export interface FireControl { cooldown: number; flashTicks: number; flashFrame: number; shotCount: number; }
export function createFireControl(): FireControl;
export function tickFire(w: World, fc: FireControl, muzzles: Muzzle[], held: boolean, dt: number): boolean; // true if a shot fired this tick
export function spawnSmoke(w: World, x: number, y: number, life: number): void;
```

- [ ] **Step 1: Write the failing tests** (append to `src/game/entities.test.ts`)

```ts
import {
  createFireControl, FIRE_INTERVAL, FLASH_TICKS, spawnSmoke, tickFire, type Muzzle,
} from './entities';

const MUZZLES: Muzzle[] = [
  { x: 100, y: 200, dir: -1 },
  { x: 120, y: 200, dir: 1 },
];

describe('tickFire', () => {
  it('fires one bullet per muzzle when held and off cooldown', () => {
    const w = createWorld(mulberry32(1));
    const fc = createFireControl();
    expect(tickFire(w, fc, MUZZLES, true, DT)).toBe(true);
    expect(w.bullets.countAlive()).toBe(2);
    const spawned: number[] = [];
    w.bullets.forEachAlive((b) => spawned.push(b.pos.x));
    expect(spawned.sort((a, b) => a - b)).toEqual([100, 120]);
    w.bullets.forEachAlive((b) => {
      expect(b.vel.y).toBe(-420);
      expect(b.radius).toBe(2);
    });
  });

  it('does not fire when not held', () => {
    const w = createWorld(mulberry32(1));
    const fc = createFireControl();
    expect(tickFire(w, fc, MUZZLES, false, DT)).toBe(false);
    expect(w.bullets.countAlive()).toBe(0);
  });

  it('respects the 8/sec cooldown over simulated ticks', () => {
    const w = createWorld(mulberry32(1));
    const fc = createFireControl();
    let shots = 0;
    for (let i = 0; i < 60; i++) if (tickFire(w, fc, MUZZLES, true, DT)) shots++;
    expect(shots).toBe(8); // 8 shots/sec over one simulated second
  });

  it('ejects one shell particle per muzzle per shot, kicked outward', () => {
    const w = createWorld(mulberry32(1));
    const fc = createFireControl();
    tickFire(w, fc, MUZZLES, true, DT);
    const shells: Array<{ x: number; vx: number }> = [];
    w.particles.forEachAlive((p) => shells.push({ x: p.pos.x, vx: p.vel.x }));
    expect(shells.length).toBeGreaterThanOrEqual(2);
    const left = shells.find((s) => s.x === 100)!;
    const right = shells.find((s) => s.x === 120)!;
    expect(left.vx).toBeLessThan(0);   // dir -1 ejects left
    expect(right.vx).toBeGreaterThan(0); // dir +1 ejects right
  });

  it('emits smoke on every third shot', () => {
    const w = createWorld(mulberry32(1));
    const fc = createFireControl();
    const counts: number[] = [];
    for (let shot = 0; shot < 3; shot++) {
      // run ticks until the next shot lands
      let fired = false;
      while (!fired) fired = tickFire(w, fc, MUZZLES, true, DT);
      counts.push(w.particles.countAlive());
    }
    // shots 1 and 2: 2 shells each (some may have expired: DT is small, life 0.4 — none expire)
    // shot 3: 2 shells + 2 smoke
    expect(counts[0]).toBe(2);
    expect(counts[1]).toBe(4);
    expect(counts[2]).toBe(8); // 6 shells + 2 smoke
  });

  it('raises the muzzle flash for FLASH_TICKS and alternates frames', () => {
    const w = createWorld(mulberry32(1));
    const fc = createFireControl();
    tickFire(w, fc, MUZZLES, true, DT);
    expect(fc.flashTicks).toBe(FLASH_TICKS);
    const firstFrame = fc.flashFrame;
    tickFire(w, fc, MUZZLES, false, DT);
    tickFire(w, fc, MUZZLES, false, DT);
    expect(fc.flashTicks).toBe(0);
    // next shot alternates the frame
    let fired = false;
    while (!fired) fired = tickFire(w, fc, MUZZLES, true, DT);
    expect(fc.flashFrame).toBe(firstFrame ^ 1);
  });
});

describe('spawnSmoke', () => {
  it('spawns a 2x2 gray particle with the given lifetime', () => {
    const w = createWorld(mulberry32(1));
    spawnSmoke(w, 10, 20, 0.8);
    expect(w.particles.countAlive()).toBe(1);
    w.particles.forEachAlive((p) => {
      expect(p.size).toBe(2);
      expect(p.life).toBe(0.8);
      expect(p.pos.x).toBe(10);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/game/entities.test.ts`
Expected: FAIL — `tickFire` not exported.

- [ ] **Step 3: Implement** (append to `src/game/entities.ts`)

```ts
export const FIRE_INTERVAL = 0.125; // 8 shots/sec
export const FLASH_TICKS = 2;
const BULLET_SPEED = 420;

// A muzzle is a world-space fire point; dir is which side shells eject.
export interface Muzzle { x: number; y: number; dir: -1 | 1; }

export interface FireControl {
  cooldown: number;   // seconds until next shot allowed
  flashTicks: number; // update ticks the muzzle flash stays visible
  flashFrame: number; // 0 | 1, alternates per shot
  shotCount: number;  // every 3rd shot puffs smoke
}

export function createFireControl(): FireControl {
  return { cooldown: 0, flashTicks: 0, flashFrame: 0, shotCount: 0 };
}

export function tickFire(
  w: World, fc: FireControl, muzzles: Muzzle[], held: boolean, dt: number,
): boolean {
  fc.cooldown = Math.max(0, fc.cooldown - dt);
  if (fc.flashTicks > 0) fc.flashTicks--;
  if (!held || fc.cooldown > 0) return false;
  fc.cooldown = FIRE_INTERVAL;
  fc.flashTicks = FLASH_TICKS;
  fc.flashFrame ^= 1;
  fc.shotCount++;
  for (const m of muzzles) {
    const b = w.bullets.spawn();
    if (b) {
      b.pos.x = m.x; b.pos.y = m.y;
      b.vel.x = 0; b.vel.y = -BULLET_SPEED;
      b.hp = 1; b.radius = 2; b.age = 0;
    }
    spawnShell(w, m);
    if (fc.shotCount % 3 === 0) spawnSmoke(w, m.x, m.y + 4, 0.8);
  }
  return true;
}

function spawnShell(w: World, m: Muzzle): void {
  const p = w.particles.spawn();
  if (!p) return;
  p.pos.x = m.x; p.pos.y = m.y;
  p.vel.x = m.dir * (30 + w.rng() * 30); // kicked outward
  p.vel.y = 40 + w.rng() * 40;           // falls down-screen
  p.size = 1; p.color = PALETTE[6]; p.life = 0.4; p.age = 0;
}

export function spawnSmoke(w: World, x: number, y: number, life: number): void {
  const p = w.particles.spawn();
  if (!p) return;
  p.pos.x = x; p.pos.y = y;
  p.vel.x = w.rng() * 10 - 5;
  p.vel.y = 30 + w.rng() * 20; // drifts behind (down-screen)
  p.size = 2;
  p.color = w.rng() < 0.5 ? PALETTE[24] : PALETTE[25];
  p.life = life; p.age = 0;
}
```

Note on the cooldown test: 60 ticks of 1/60 s with `cooldown = 0.125` fires on tick 0 then every ceil(0.125/DT) = 8 ticks: ticks 0, 8, 16, 24, 32, 40, 48, 56 → 8 shots. If the implementation instead accumulates exactly (fires 0, 8, 15, 23…), the count may differ — the test's expectation `8` is the contract; make the implementation match it (the `Math.max(0, …)` floor + fixed reset above yields ticks 0, 8, 16, … = 8 shots).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/game/entities.test.ts` — PASS. `npm run typecheck` — clean.

- [ ] **Step 5: Commit**

```bash
git add src/game/entities.ts src/game/entities.test.ts
git commit -m "feat: fire control with shells, smoke, and muzzle-flash state"
```

---

### Task 7: Drone-boat layered sprite

**Files:**
- Create: `src/game/sprites/boat.ts`
- Test: `src/game/sprites/boat.test.ts`

**Interfaces:**
- Consumes: `parseGrid`, `SpriteDef`, `LayeredSprite` from `src/engine/sprite.ts`; `PALETTE`.
- Produces: `BOAT_HULL: SpriteDef` (24x16, anchor `turret: [11, 7]`); `BOAT_TURRET: SpriteDef` (6x6, anchor `mount: [2, 2]`); `createBoat(): LayeredSprite` (hull + turret). Task 10 draws it at enemy positions.

- [ ] **Step 1: Write the failing test**

```ts
// src/game/sprites/boat.test.ts
import { describe, expect, it } from 'vitest';
import { layerOffsets } from '../../engine/sprite';
import { BOAT_HULL, BOAT_TURRET, createBoat } from './boat';

describe('drone boat sprite', () => {
  it('hull is a single 24x16 frame', () => {
    expect(BOAT_HULL.frames).toHaveLength(1);
    expect(BOAT_HULL.frames[0].width).toBe(24);
    expect(BOAT_HULL.frames[0].height).toBe(16);
  });

  it('every anchor lies inside its sprite bounds', () => {
    for (const def of [BOAT_HULL, BOAT_TURRET]) {
      const { width, height } = def.frames[0];
      for (const [x, y] of Object.values(def.anchors)) {
        expect(x).toBeGreaterThanOrEqual(0);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThan(width);
        expect(y).toBeLessThan(height);
      }
    }
  });

  it('createBoat stacks hull then turret', () => {
    const boat = createBoat();
    expect(boat.layers).toHaveLength(2);
    expect(boat.layers[0].def).toBe(BOAT_HULL);
    expect(boat.layers[1].def).toBe(BOAT_TURRET);
  });

  it('turret sits fully inside the hull footprint', () => {
    const boat = createBoat();
    const offsets = layerOffsets(boat);
    const { width, height } = BOAT_TURRET.frames[0];
    expect(offsets[1].x).toBeGreaterThanOrEqual(0);
    expect(offsets[1].y).toBeGreaterThanOrEqual(0);
    expect(offsets[1].x + width).toBeLessThanOrEqual(24);
    expect(offsets[1].y + height).toBeLessThanOrEqual(16);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/game/sprites/boat.test.ts`
Expected: FAIL — cannot resolve `./boat`.

- [ ] **Step 3: Implement**

```ts
// src/game/sprites/boat.ts
// Drone boat as a layered sprite: hull base + turret layer on the deck
// anchor. Turret is static this pass; a later milestone animates it.
// Points down-screen (it drives toward the player). Palette: p/m = deck
// grays, 1 = dark waterline, j = cyan wake.
import { parseGrid, type LayeredSprite, type SpriteDef } from '../../engine/sprite';
import { PALETTE } from '../palette';

// 24x16 hull, bow at the bottom, wake sparkle at the stern (top).
const HULL_ROWS = [
  '........jj..jj..........',
  '....1111111111111111....',
  '....1pppppppppppppp1....',
  '....1pmmmmmmmmmmmmp1....',
  '....1pmmmmmmmmmmmmp1....',
  '....1pmmppppppppmmp1....',
  '....1pmmppppppppmmp1....',
  '....1pmmppppppppmmp1....',
  '....1pmmmmmmmmmmmmp1....',
  '....1pmmmmmmmmmmmmp1....',
  '.....1pmmmmmmmmmmp1.....',
  '.....1ppmmmmmmmmpp1.....',
  '......1ppmmmmmmpp1......',
  '.......1ppmmmmpp1.......',
  '.........1pppp1.........',
  '...........11...........',
];

export const BOAT_HULL: SpriteDef = {
  frames: [parseGrid(HULL_ROWS, PALETTE)],
  anchors: { turret: [11, 7] },
};

// 6x6 turret: gunmetal box, barrel pointing down toward the bow.
export const BOAT_TURRET: SpriteDef = {
  frames: [parseGrid([
    '.pppp.',
    'pmmmmp',
    'pmmmmp',
    '.pppp.',
    '..mm..',
    '..mm..',
  ], PALETTE)],
  anchors: { mount: [2, 2] },
};

export function createBoat(): LayeredSprite {
  return {
    layers: [
      { def: BOAT_HULL, frame: 0 },
      { def: BOAT_TURRET, frame: 0, attach: { to: 'turret', by: 'mount' } },
    ],
  };
}
```

Every `HULL_ROWS` string is exactly 24 characters; `parseGrid` throws on ragged rows and the tests enforce the 24x16 dimensions, so any transcription slip fails loudly.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/game/sprites/boat.test.ts` — PASS. `npm run typecheck` — clean.

- [ ] **Step 5: Commit**

```bash
git add src/game/sprites/boat.ts src/game/sprites/boat.test.ts
git commit -m "feat: layered drone-boat sprite (hull + turret)"
```

---

### Task 8: Spawner and bullet-enemy collision with bursts

**Files:**
- Modify: `src/game/entities.ts` (append)
- Test: `src/game/entities.test.ts` (append)

**Interfaces:**
- Consumes: Task 5's `World`; `circlesOverlap` from `src/engine/collide.ts`; `WIDTH` from `src/engine/renderer.ts`; `spawnSmoke` from Task 6.
- Produces (Task 10 relies on these):

```ts
export interface Spawner { timer: number; }
export function createSpawner(rng: () => number): Spawner;
export function tickSpawner(w: World, s: Spawner, dt: number): void;
export interface CollisionResult { hits: number; kills: number; }
export function collideBulletsEnemies(w: World): CollisionResult;
```

- [ ] **Step 1: Write the failing tests** (append to `src/game/entities.test.ts`)

```ts
import {
  collideBulletsEnemies, createSpawner, tickSpawner,
} from './entities';

describe('spawner', () => {
  it('spawns boats deterministically for a fixed seed', () => {
    const rng = mulberry32(7);
    const w = createWorld(rng);
    const s = createSpawner(rng);
    expect(s.timer).toBeGreaterThanOrEqual(1.2);
    expect(s.timer).toBeLessThan(2.2);
    for (let i = 0; i < 60 * 10; i++) tickSpawner(w, s, DT); // 10 simulated seconds
    const alive = w.enemies.countAlive();
    expect(alive).toBeGreaterThanOrEqual(4); // 10s / 2.2s max interval
    expect(alive).toBeLessThanOrEqual(9);    // 10s / 1.2s min interval
    w.enemies.forEachAlive((e) => {
      expect(e.hp).toBe(3);
      expect(e.radius).toBe(10);
      expect(e.vel.y).toBe(60);
      expect(e.pos.x).toBeGreaterThanOrEqual(24);
      expect(e.pos.x).toBeLessThanOrEqual(640 - 24);
    });
  });

  it('two spawners with the same seed produce identical positions', () => {
    const runA: number[] = [];
    const runB: number[] = [];
    for (const out of [runA, runB]) {
      const rng = mulberry32(99);
      const w = createWorld(rng);
      const s = createSpawner(rng);
      for (let i = 0; i < 60 * 5; i++) tickSpawner(w, s, DT);
      w.enemies.forEachAlive((e) => out.push(e.pos.x));
    }
    expect(runA).toEqual(runB);
  });
});

describe('collideBulletsEnemies', () => {
  function place(w: ReturnType<typeof createWorld>, hp: number) {
    const e = w.enemies.spawn()!;
    e.pos.x = 100; e.pos.y = 100; e.hp = hp; e.radius = 10;
    const b = w.bullets.spawn()!;
    b.pos.x = 100; b.pos.y = 105; b.radius = 2;
    return { e, b };
  }

  it('hit kills the bullet, decrements hp, sparks 3 particles', () => {
    const w = createWorld(mulberry32(1));
    const { e, b } = place(w, 3);
    const res = collideBulletsEnemies(w);
    expect(res).toEqual({ hits: 1, kills: 0 });
    expect(b.alive).toBe(false);
    expect(e.alive).toBe(true);
    expect(e.hp).toBe(2);
    expect(w.particles.countAlive()).toBe(3);
  });

  it('killing blow explodes: 12 fire + 4 smoke particles', () => {
    const w = createWorld(mulberry32(1));
    const { e } = place(w, 1);
    const res = collideBulletsEnemies(w);
    expect(res).toEqual({ hits: 1, kills: 1 });
    expect(e.alive).toBe(false);
    expect(w.particles.countAlive()).toBe(3 + 12 + 4); // spark + fire + smoke
  });

  it('misses touch nothing', () => {
    const w = createWorld(mulberry32(1));
    const e = w.enemies.spawn()!;
    e.pos.x = 100; e.pos.y = 100; e.hp = 3; e.radius = 10;
    const b = w.bullets.spawn()!;
    b.pos.x = 300; b.pos.y = 300; b.radius = 2;
    const res = collideBulletsEnemies(w);
    expect(res).toEqual({ hits: 0, kills: 0 });
    expect(b.alive).toBe(true);
    expect(e.hp).toBe(3);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/game/entities.test.ts`
Expected: FAIL — `createSpawner` not exported.

- [ ] **Step 3: Implement** (append to `src/game/entities.ts`; add `circlesOverlap` and `WIDTH` to the imports at the top)

```ts
// Interim spawner (milestone 7's waves.ts replaces this): boats drop in
// from above on a seeded 1.2–2.2 s cadence.
export interface Spawner { timer: number; }

export function createSpawner(rng: () => number): Spawner {
  return { timer: 1.2 + rng() };
}

export function tickSpawner(w: World, s: Spawner, dt: number): void {
  s.timer -= dt;
  if (s.timer > 0) return;
  s.timer = 1.2 + w.rng();
  const e = w.enemies.spawn();
  if (!e) return;
  e.pos.x = 24 + w.rng() * (WIDTH - 48);
  e.pos.y = -16;
  e.vel.x = 0; e.vel.y = 60;
  e.hp = 3; e.radius = 10; e.age = 0;
}

export interface CollisionResult { hits: number; kills: number; }

export function collideBulletsEnemies(w: World): CollisionResult {
  const result: CollisionResult = { hits: 0, kills: 0 };
  w.bullets.forEachAlive((b) => {
    w.enemies.forEachAlive((e) => {
      if (!b.alive) return; // bullet spent earlier in this pass
      if (!circlesOverlap(b.pos.x, b.pos.y, b.radius, e.pos.x, e.pos.y, e.radius)) return;
      b.alive = false;
      e.hp--;
      result.hits++;
      spawnBurst(w, b.pos.x, b.pos.y, 3, 0.3);
      if (e.hp <= 0) {
        e.alive = false;
        result.kills++;
        spawnBurst(w, e.pos.x, e.pos.y, 12, 0.5);
        for (let i = 0; i < 4; i++) spawnSmoke(w, e.pos.x, e.pos.y, 1.2);
      }
    });
  });
  return result;
}

const FIRE_COLORS = [PALETTE[21], PALETTE[8], PALETTE[5]]; // white, yellow, orange

function spawnBurst(w: World, x: number, y: number, count: number, life: number): void {
  for (let i = 0; i < count; i++) {
    const p = w.particles.spawn();
    if (!p) return;
    const angle = w.rng() * Math.PI * 2;
    const speed = 40 + w.rng() * 100;
    p.pos.x = x; p.pos.y = y;
    p.vel.x = Math.cos(angle) * speed;
    p.vel.y = Math.sin(angle) * speed;
    p.size = w.rng() < 0.5 ? 1 : 2;
    p.color = FIRE_COLORS[Math.floor(w.rng() * FIRE_COLORS.length)];
    p.life = life; p.age = 0;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/game/entities.test.ts` — PASS. `npm run typecheck` — clean.

- [ ] **Step 5: Commit**

```bash
git add src/game/entities.ts src/game/entities.test.ts
git commit -m "feat: seeded boat spawner and bullet-enemy collision with bursts"
```

---

### Task 9: Audio engine and SFX presets

**Files:**
- Create: `src/engine/audio.ts`, `src/game/sfx.ts`
- Test: `src/engine/audio.test.ts`, `src/game/sfx.test.ts`

**Interfaces:**
- Consumes: nothing (engine); `BlipParams` (game).
- Produces (Task 10 relies on these):

```ts
// engine/audio.ts
export interface BlipParams {
  type: OscillatorType;
  startFreq: number; endFreq: number; // Hz
  duration: number;                   // seconds
  volume: number;                     // 0–1 peak gain
}
export interface BlipEnvelope {
  attackEnd: number; decayEnd: number; peak: number; floor: number;
  startFreq: number; endFreq: number;
}
export function blipEnvelope(p: BlipParams): BlipEnvelope; // pure, clamps
export interface AudioSystem { unlock(): void; blip(p: BlipParams): void; }
export function createAudio(): AudioSystem;
// game/sfx.ts
export const SFX: Record<'shoot' | 'hit' | 'explode' | 'pickup', BlipParams>;
```

- [ ] **Step 1: Write the failing tests**

```ts
// src/engine/audio.test.ts
import { describe, expect, it } from 'vitest';
import { blipEnvelope } from './audio';

describe('blipEnvelope', () => {
  it('passes well-formed params through', () => {
    const env = blipEnvelope({ type: 'square', startFreq: 880, endFreq: 440, duration: 0.08, volume: 0.15 });
    expect(env).toEqual({
      attackEnd: 0.005, decayEnd: 0.08, peak: 0.15, floor: 0.001,
      startFreq: 880, endFreq: 440,
    });
  });

  it('clamps volume into (0, 1]', () => {
    expect(blipEnvelope({ type: 'sine', startFreq: 440, endFreq: 440, duration: 0.1, volume: 3 }).peak).toBe(1);
    expect(blipEnvelope({ type: 'sine', startFreq: 440, endFreq: 440, duration: 0.1, volume: -1 }).peak).toBe(0.001);
  });

  it('enforces a minimum duration and positive frequencies', () => {
    const env = blipEnvelope({ type: 'sine', startFreq: 0, endFreq: -5, duration: 0, volume: 0.5 });
    expect(env.decayEnd).toBe(0.01);
    expect(env.startFreq).toBe(1);
    expect(env.endFreq).toBe(1);
  });

  it('keeps the attack inside very short blips', () => {
    const env = blipEnvelope({ type: 'sine', startFreq: 440, endFreq: 440, duration: 0.006, volume: 0.5 });
    expect(env.attackEnd).toBeLessThan(env.decayEnd);
  });
});
```

```ts
// src/game/sfx.test.ts
import { describe, expect, it } from 'vitest';
import { blipEnvelope } from '../engine/audio';
import { SFX } from './sfx';

describe('SFX presets', () => {
  it('defines all four combat sounds', () => {
    expect(Object.keys(SFX).sort()).toEqual(['explode', 'hit', 'pickup', 'shoot']);
  });

  it('every preset is already within valid ranges (no clamping needed)', () => {
    for (const p of Object.values(SFX)) {
      const env = blipEnvelope(p);
      expect(env.peak).toBe(p.volume);
      expect(env.decayEnd).toBe(p.duration);
      expect(env.startFreq).toBe(p.startFreq);
      expect(env.endFreq).toBe(p.endFreq);
    }
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/engine/audio.test.ts src/game/sfx.test.ts`
Expected: FAIL — modules missing.

- [ ] **Step 3: Implement**

```ts
// src/engine/audio.ts
// Synthesized SFX (engine spec §5): one oscillator + gain envelope per
// blip, no sample files. The envelope math is pure and tested; the Web
// Audio calls stay thin and are verified by ear in the dev server.
export interface BlipParams {
  type: OscillatorType;
  startFreq: number; endFreq: number; // Hz, exponential sweep
  duration: number;                   // seconds
  volume: number;                     // 0–1 peak gain
}

export interface BlipEnvelope {
  attackEnd: number; // seconds: gain reaches peak
  decayEnd: number;  // seconds: gain reaches floor, oscillator stops
  peak: number;
  floor: number;
  startFreq: number;
  endFreq: number;
}

export function blipEnvelope(p: BlipParams): BlipEnvelope {
  const decayEnd = Math.max(0.01, p.duration);
  return {
    attackEnd: Math.min(0.005, decayEnd / 2),
    decayEnd,
    peak: Math.min(1, Math.max(0.001, p.volume)),
    floor: 0.001,
    startFreq: Math.max(1, p.startFreq),
    endFreq: Math.max(1, p.endFreq),
  };
}

export interface AudioSystem {
  unlock(): void;           // create/resume the AudioContext; call on a user gesture
  blip(p: BlipParams): void; // no-op until unlocked
}

export function createAudio(): AudioSystem {
  let ctx: AudioContext | null = null;
  return {
    unlock() {
      if (!ctx) ctx = new AudioContext();
      if (ctx.state === 'suspended') void ctx.resume();
    },
    blip(p) {
      if (!ctx) return;
      const env = blipEnvelope(p);
      const t0 = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = p.type;
      osc.frequency.setValueAtTime(env.startFreq, t0);
      osc.frequency.exponentialRampToValueAtTime(env.endFreq, t0 + env.decayEnd);
      gain.gain.setValueAtTime(env.floor, t0);
      gain.gain.exponentialRampToValueAtTime(env.peak, t0 + env.attackEnd);
      gain.gain.exponentialRampToValueAtTime(env.floor, t0 + env.decayEnd);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + env.decayEnd + 0.02);
      osc.onended = () => {
        osc.disconnect();
        gain.disconnect();
      };
    },
  };
}
```

```ts
// src/game/sfx.ts
// Named blip presets, tuned by ear in the dev server. pickup is wired
// in milestone 8.
import type { BlipParams } from '../engine/audio';

export const SFX: Record<'shoot' | 'hit' | 'explode' | 'pickup', BlipParams> = {
  shoot:   { type: 'square',   startFreq: 880, endFreq: 440,  duration: 0.08, volume: 0.15 },
  hit:     { type: 'square',   startFreq: 220, endFreq: 110,  duration: 0.1,  volume: 0.2 },
  explode: { type: 'sawtooth', startFreq: 140, endFreq: 30,   duration: 0.45, volume: 0.3 },
  pickup:  { type: 'triangle', startFreq: 440, endFreq: 1320, duration: 0.15, volume: 0.2 },
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/engine/audio.test.ts src/game/sfx.test.ts` — PASS. `npm run typecheck` — clean.

- [ ] **Step 5: Commit**

```bash
git add src/engine/audio.ts src/engine/audio.test.ts src/game/sfx.ts src/game/sfx.test.ts
git commit -m "feat: blip audio synthesis and combat SFX presets"
```

---

### Task 10: Input polish and main.ts integration

**Files:**
- Modify: `src/engine/input.ts` (attach: preventDefault + blur clear)
- Modify: `src/game/main.ts` (full combat wiring)

**Interfaces:**
- Consumes: everything above — exact names: `createWorld`, `tickBullets`, `tickParticles`, `tickEnemies`, `tickFire`, `tickSpawner`, `collideBulletsEnemies`, `createFireControl`, `createSpawner`, `FIRE_INTERVAL` (unused here), `Muzzle`, `mulberry32`, `createAudio`, `SFX`, `TRACER`, `createBoat`, `createChopper` (6 layers), `CHOPPER_BODY.anchors.muzzleL/muzzleR`, `rasterize`, `prepareLayered`, `drawLayered`.
- Produces: the playable sandbox. No new exports.

This task has no new headless tests — it is the thin Canvas/Web Audio boundary, verified in the dev server (project policy). The full suite and typecheck must stay green.

- [ ] **Step 1: Input polish** (modify `attach` in `src/engine/input.ts`; `BINDINGS` stays module-level)

```ts
    attach(target) {
      target.addEventListener('keydown', (e) => {
        const ke = e as KeyboardEvent;
        if (BINDINGS[ke.code]) ke.preventDefault(); // arrows must not scroll the page
        onKey(ke.code, true);
      });
      target.addEventListener('keyup', (e) => onKey((e as KeyboardEvent).code, false));
      // Alt-tab with a key held would leave it stuck down: clear on blur.
      target.addEventListener('blur', () => {
        for (const key of Object.keys(state) as Array<keyof Input>) state[key] = false;
      });
    },
```

- [ ] **Step 2: Rewrite `src/game/main.ts`**

```ts
// Combat sandbox (milestones 4-6): fly, shoot boats, hear it.
import { createAudio } from '../engine/audio';
import { createInput } from '../engine/input';
import { createLoop } from '../engine/loop';
import { createRenderer, HEIGHT, WIDTH } from '../engine/renderer';
import { mulberry32 } from '../engine/rng';
import { drawLayered, prepareLayered, rasterize } from '../engine/sprite';
import {
  collideBulletsEnemies, createFireControl, createSpawner, createWorld,
  tickBullets, tickEnemies, tickFire, tickParticles, tickSpawner, type Muzzle,
} from './entities';
import { SFX } from './sfx';
import { createBoat } from './sprites/boat';
import { CHOPPER_BODY, createChopper } from './sprites/player';
import { TRACER } from './sprites/shots';

const SEED = 0xc0ffee; // fixed until start(seed) arrives with the shell seam

const screen = document.getElementById('screen') as HTMLCanvasElement;
const renderer = createRenderer(screen);
renderer.resize();
window.addEventListener('resize', () => renderer.resize());

const input = createInput();
input.attach(window);

const audio = createAudio();
window.addEventListener('keydown', () => audio.unlock(), { once: true });

const rng = mulberry32(SEED);
const world = createWorld(rng);
const fire = createFireControl();
const spawner = createSpawner(rng);

const SPEED = 180; // pixels per second
const CHOPPER_SCALE = 1;
const chopperSprite = createChopper();
const chopperPrepared = prepareLayered(chopperSprite);
const rotorLayer = chopperSprite.layers[3];
const flashLayers = [chopperSprite.layers[4], chopperSprite.layers[5]];
const boatPrepared = prepareLayered(createBoat());
const tracerCanvas = rasterize(TRACER.frames[0]);

const chopper = {
  x: WIDTH / 2,
  y: HEIGHT - 80,
  w: CHOPPER_BODY.frames[0].width * CHOPPER_SCALE,
  h: CHOPPER_BODY.frames[0].height * CHOPPER_SCALE,
};
let ticks = 0;

function muzzles(): Muzzle[] {
  const half = 16 * CHOPPER_SCALE;
  const [lx, ly] = CHOPPER_BODY.anchors.muzzleL;
  const [rx, ry] = CHOPPER_BODY.anchors.muzzleR;
  return [
    { x: chopper.x - half + lx * CHOPPER_SCALE, y: chopper.y - half + ly * CHOPPER_SCALE, dir: -1 },
    { x: chopper.x - half + rx * CHOPPER_SCALE, y: chopper.y - half + ry * CHOPPER_SCALE, dir: 1 },
  ];
}

function update(dt: number): void {
  ticks++;
  let dx = (input.state.right ? 1 : 0) - (input.state.left ? 1 : 0);
  let dy = (input.state.down ? 1 : 0) - (input.state.up ? 1 : 0);
  if (dx !== 0 && dy !== 0) {
    dx *= Math.SQRT1_2;
    dy *= Math.SQRT1_2;
  }
  chopper.x += dx * SPEED * dt;
  chopper.y += dy * SPEED * dt;
  chopper.x = Math.min(Math.max(chopper.x, chopper.w / 2), WIDTH - chopper.w / 2);
  chopper.y = Math.min(Math.max(chopper.y, chopper.h / 2), HEIGHT - chopper.h / 2);

  if (tickFire(world, fire, muzzles(), input.state.fire, dt)) audio.blip(SFX.shoot);
  tickSpawner(world, spawner, dt);
  tickBullets(world, dt);
  tickEnemies(world, dt);
  tickParticles(world, dt);

  const hits = collideBulletsEnemies(world);
  if (hits.kills > 0) audio.blip(SFX.explode);
  else if (hits.hits > 0) audio.blip(SFX.hit);

  for (const layer of flashLayers) {
    layer.visible = fire.flashTicks > 0;
    layer.frame = fire.flashFrame;
  }
  rotorLayer.frame = Math.floor(ticks / 4) % rotorLayer.def.frames.length;
}

let frames = 0;
let fps = 0;
let fpsWindowStart = 0;

function render(): void {
  const { ctx } = renderer;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  world.enemies.forEachAlive((e) => {
    drawLayered(ctx, boatPrepared, e.pos.x, e.pos.y);
  });
  world.bullets.forEachAlive((b) => {
    ctx.drawImage(tracerCanvas, Math.round(b.pos.x - 1), Math.round(b.pos.y - 2));
  });
  drawLayered(ctx, chopperPrepared, chopper.x, chopper.y, CHOPPER_SCALE);
  world.particles.forEachAlive((p) => {
    ctx.fillStyle = p.color;
    ctx.fillRect(Math.round(p.pos.x), Math.round(p.pos.y), p.size, p.size);
  });

  ctx.fillStyle = '#9badb7';
  ctx.font = '10px monospace';
  ctx.fillText(`FPS ${fps}`, 4, 12);
  renderer.present();
}

const loop = createLoop(update, render);

function frame(now: number): void {
  frames++;
  if (now - fpsWindowStart >= 1000) {
    fps = frames;
    frames = 0;
    fpsWindowStart = now;
  }
  loop.frame(now);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
```

- [ ] **Step 3: Full verification**

Run: `npm test` — all suites PASS. `npm run typecheck` — clean. `npm run build` — succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/engine/input.ts src/game/main.ts
git commit -m "feat: wire combat into the sandbox - firing, boats, explosions, SFX"
```

---

### Task 11: Docs pass (end of branch)

**Files:**
- Modify: `docs/architecture.md`, `README.md`, `docs/steel-talon-engine-spec.md` (build-order rows 4–6 → ✅)

Per CLAUDE.md documentation discipline, run this once at the end of the pass:

- [ ] **Step 1:** Update `docs/architecture.md` to describe the current state: new engine modules (`pool`, `rng`, `collide`, `audio`, `Layer.visible`), `game/entities.ts` systems (world/pools/ticks/fire/spawner/collision), `game/sprites/boat.ts` + `shots.ts`, the 6-layer chopper, main.ts combat wiring, and the new test counts (run `npm test` and count). Style: technical, concise, present tense, real file paths. No plans or history.
- [ ] **Step 2:** Update `README.md` status line (milestones 1–6 complete; combat sandbox: fly, shoot, boats explode with sound).
- [ ] **Step 3:** Mark build-order rows 4, 5, 6 with ✅ in `docs/steel-talon-engine-spec.md`.
- [ ] **Step 4: Commit**

```bash
git add docs/architecture.md README.md docs/steel-talon-engine-spec.md
git commit -m "docs: architecture, README, and build-order for milestones 4-6"
```
