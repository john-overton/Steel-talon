# Steel Talon Pass 2 — Milestones 4–6 (Combat) Design

Scope: engine-spec build order milestones 4 (bullets + pooling), 5 (drone boat + collision + particles), 6 (blip() SFX). Branch: `pass/milestones-4-6`. Ends with: hold fire, twin tracer streams from the rocket pods, drone boats drifting down, hits and explosions with sound.

Out of scope (later milestones): enemy fire and player HP (8), scrolling water/camera and `waves.ts` (7), HUD (8), music/sequencer and title scene (9). Enemies are moving targets this pass — Level 1 TOP is a training lane per the beat sheet, and there is no player HP to damage yet.

## Architecture

New engine modules (game-agnostic, no `game/` imports):

- `src/engine/pool.ts` — generic fixed-size object pool
- `src/engine/rng.ts` — seeded mulberry32 PRNG (pulled forward from milestone 7: spawn randomness must be seeded from day one per the determinism invariant)
- `src/engine/collide.ts` — circle-vs-circle test
- `src/engine/audio.ts` — lazy AudioContext + `blip()` oscillator SFX

New game modules:

- `src/game/entities.ts` — flat `Entity` interface, bullet/particle/enemy pools, tick + collision pass
- `src/game/sprites/boat.ts` — layered drone-boat sprite (hull + turret)
- `src/game/sfx.ts` — named blip presets: `shoot`, `hit`, `explode`, `pickup`
- `src/game/main.ts` — extended sandbox wiring (scenes arrive in milestone 9)

## Milestone 4 — Bullets, pooling, fire rate

### engine/pool.ts

```ts
export interface Pool<T> {
  items: T[];                       // fixed length, allocated once
  spawn(): T | undefined;           // first dead item, marked alive; undefined if full
  forEachAlive(fn: (item: T) => void): void;
  countAlive(): number;
  reset(): void;                    // marks everything dead
}
export function createPool<T extends { alive: boolean }>(size: number, factory: () => T): Pool<T>;
```

Factory runs `size` times at creation; `spawn()` never allocates. Pure, headless-tested: reuse of dead slots, exhaustion returns undefined, reset.

### game/entities.ts

The spec's flat interface, with `Vec2 = { x: number; y: number }` inline:

```ts
export interface Entity {
  kind: 'player' | 'enemy' | 'bullet' | 'pickup' | 'particle';
  pos: Vec2; vel: Vec2;
  hp: number; radius: number;
  age: number; alive: boolean;
}
```

Entity ticks are plain functions over the entity (`tickBullet(e, dt)`, not methods) so pools hold uniform objects and tests stay trivial. Pools: bullets 64, particles 256, enemies 16.

### Firing

- Hold fire (Z/J) → twin streams from the chopper's `podL`/`podR` rocket-pod anchors, converted to world space from the chopper center via `layerOffsets`.
- Cooldown timer: 8 shots/sec (0.125 s), accumulated in update ticks — no wall-clock time.
- Bullet: vel (0, −420) px/s, radius 2, despawns when `pos.y < −8` or age > 2 s.
- Tracer sprite: 2x4 pixels (yellow `f` tip, gunmetal `m` tail) in `game/sprites/shots.ts`.

### Deferred minors folded in

- Diagonal movement normalized (× 1/√2 when two axes held).
- Input: `preventDefault()` on bound keys; clear all state on window `blur`.

## Milestone 5 — Drone boat, collision, particles

### engine/rng.ts

```ts
export function mulberry32(seed: number): () => number;  // deterministic [0,1)
```

Tested: same seed → identical sequence; known first values for a fixed seed.

### game/sprites/boat.ts

Layered sprite per the project convention: `BOAT_HULL` (~24x16, gray deck `p`/`m`, dark waterline `1`, wake hint) with anchors `{ turret: [cx, cy] }`; `BOAT_TURRET` (~6x6 gunmetal, `mount` anchor). `createBoat(): LayeredSprite` = hull + turret. Turret is static this pass; a later milestone rotates/animates it via its own layer frame.

### Spawning (interim)

`spawnTimer` in main: every 1.2–2.2 s (interval drawn from the seeded RNG), spawn a boat at `y = −16`, `x = 24 + rng() * (WIDTH − 48)`, vel (0, 60) px/s, hp 3, radius 10. Boats despawn below `HEIGHT + 16`. Milestone 7 replaces this block with `waves.ts`; the RNG plumbing is the part that survives.

### engine/collide.ts

```ts
export function circlesOverlap(ax, ay, ar, bx, by, br): boolean;  // (dx²+dy²) < (ar+br)² — strict, no sqrt
```

Collision pass in `entities.ts`: brute-force bullets × enemies. Hit → bullet dies, enemy hp−1, 3-particle spark; hp 0 → 12-particle explosion, enemy dies.

### Particles

Pool-driven, 1x1–2x2 pixels drawn as fillRect (no sprite rasterization): radial velocities from the seeded RNG (speed 40–140 px/s), lifetime 0.5 s, color from age (white → orange `e` → gray `o`), slight drag. Explosion = 12 particles from boat center; spark = 3 from impact point.

## Milestone 6 — blip() SFX

### engine/audio.ts

```ts
export interface BlipParams {
  type: OscillatorType;          // 'square' | 'sawtooth' | 'triangle' | 'sine'
  startFreq: number; endFreq: number;   // Hz, exponential sweep
  duration: number;              // seconds
  volume: number;                // 0–1 peak gain
}
export function createAudio(): {
  unlock(): void;                // create/resume AudioContext; call on first input
  blip(p: BlipParams): void;     // no-op until unlocked
};
```

One oscillator + gain node per blip: gain ramps 0 → volume in 5 ms, exponential decay to 0.001 by `duration`; frequency sweeps `startFreq` → `endFreq` exponentially. Nodes stop and disconnect at end. Param validation/derivation pure and tested (e.g. a `blipEnvelope(p)` helper returning the ramp points); the Web Audio call layer stays thin, verified by ear in the dev server.

### game/sfx.ts

Named presets (tuned by ear during the pass; starting values):

| name | type | startFreq | endFreq | duration | volume |
|---|---|---|---|---|---|
| shoot | square | 880 | 440 | 0.08 | 0.15 |
| hit | square | 220 | 110 | 0.10 | 0.2 |
| explode | sawtooth | 140 | 30 | 0.45 | 0.3 |
| pickup | triangle | 440 | 1320 | 0.15 | 0.2 |

`pickup` is defined now, wired in milestone 8. Audio unlock hooks into `input.onKey` first keydown — no title scene exists yet.

## Determinism

All gameplay randomness (spawn timing, spawn x, particle velocities) goes through one `mulberry32` instance seeded at boot (fixed seed constant for now; `start(seed)` arrives with the shell seam). No `Math.random`, `Date.now`, `performance.now` in update logic. Audio is output-only and exempt.

## Testing

Headless (Vitest, fixed seeds, simulated ticks): pool spawn/reuse/exhaustion/reset; mulberry32 sequences; circlesOverlap boundaries; bullet tick/despawn; fire-rate cooldown counts over N ticks; boat spawn positions for a fixed seed; hit → hp decrement → death → particle count; blip envelope math; boat sprite anchors/layers (same shape as player.test.ts). Canvas/Web Audio boundary code verified in the dev server (5173) by the user.

## Process

Same as pass 1: branch `pass/milestones-4-6`, subagent-driven development (opus-low routine, sonnet-medium harder), docs (architecture.md, README, spec checkmarks 4–6) finalized in one pass at the end.
