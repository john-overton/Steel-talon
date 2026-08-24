# STEEL TALON, Technical Spec v0.1
### Scope: the game only. No accounts, no payments, no arcade shell. Runs from a static folder.

---

## 1. Core Decisions

| Decision | Choice | Why |
|---|---|---|
| Engine | **None. Hand-rolled.** | A 2D shmup is ~90% loop, sprites, collision, and input. Engines like Phaser (~1MB) abstract exactly the parts you want to understand. Everything below is plain TypeScript you can read. |
| Language | **TypeScript** | Plain text, compiles to plain JS, types are documentation. |
| Rendering | **Canvas 2D API** | Built into every browser. WebGL is overkill until we're pushing thousands of sprites. Canvas 2D handles a 640x480 shmup at 60fps with huge headroom. |
| Audio | **Web Audio API, synthesized** | No sound files. Oscillators, noise, and envelopes generated in code. This IS the lo-fi chiptune sound, natively. |
| Sprites | **Pixel arrays in source code** | Sprites defined as string grids in .ts files, compiled to offscreen canvases at boot. No image files, no asset pipeline, diffable in git. |
| Build tool | **Vite** | One dev dependency. `npm run dev` gives hot reload, `npm run build` outputs a static folder. Zero runtime dependencies. |
| Total payload target | **< 200KB** | The whole game, code and "assets," smaller than one PNG on most sites. |

---

## 2. Rendering: The 640x480 Contract

One rule everything obeys: **the game only ever draws to a 640x480 offscreen buffer.** The visible canvas scales that buffer up by the largest integer that fits the window, with smoothing off, so pixels stay square and crisp.

```
Game code → backBuffer (640x480, fixed forever)
                → screen canvas (integer scaled: x1, x2, x3..., letterboxed)
```

```ts
// renderer.ts, the whole idea
const buf = new OffscreenCanvas(640, 480);
const bctx = buf.getContext('2d')!;
bctx.imageSmoothingEnabled = false;

function present(screen: CanvasRenderingContext2D) {
  const scale = Math.max(1, Math.floor(Math.min(
    screen.canvas.width / 640, screen.canvas.height / 480)));
  const x = (screen.canvas.width - 640 * scale) / 2;
  const y = (screen.canvas.height - 480 * scale) / 2;
  screen.imageSmoothingEnabled = false;
  screen.drawImage(buf, x, y, 640 * scale, 480 * scale);
}
```

- Fullscreen "maximize" is free: same buffer, bigger integer scale, black bars.
- The arcade-cabinet bezel later is just DOM around the canvas. The game never knows.
- Optional CRT scanline pass is one extra drawImage of a pre-generated overlay. Deferred.

**Palette:** one exported constant of 32 colors max, DB32-style. Every sprite and effect indexes into it. This is what makes procedural art look coherent instead of programmer-art.

---

## 3. Game Loop: Fixed Timestep

Update logic runs at a locked 60Hz regardless of display refresh, so gameplay is deterministic and identical on a 60Hz laptop and a 144Hz monitor. Render runs whenever the browser paints.

```ts
// loop.ts, complete
const STEP = 1000 / 60;
let acc = 0, last = performance.now();

function frame(now: number) {
  acc += Math.min(now - last, 250); // clamp so a bg tab doesn't spiral
  last = now;
  while (acc >= STEP) { update(STEP / 1000); acc -= STEP; }
  render();
  requestAnimationFrame(frame);
}
```

Deterministic updates also mean a seeded RNG gives reproducible roguelike runs, and someday, replays. Use one seedable PRNG (mulberry32, 4 lines) everywhere; never Math.random in gameplay code.

---

## 4. Sprites: Pixel Arrays as Source Code

Every sprite is a string grid where each character indexes the palette. At boot, each grid is rasterized once to a tiny offscreen canvas, then drawn with drawImage forever after (fast path).

```ts
// sprites/player.ts
export const CHOPPER = sprite([
  '....77....',
  '.77777777.',   // 7 = gunmetal
  '77733377..',   // 3 = olive
  '.7733377..',
  '..77.77...',
  '...1..1...',   // 1 = dark
], PALETTE);
```

- `sprite()` is ~20 lines: parse grid, putImageData to an OffscreenCanvas, return it.
- Rotation variants and palette swaps (enemy = same chopper, red channel) are generated at boot, not hand-drawn.
- Animation = array of grids, index by `Math.floor(t * fps) % frames.length`.
- Explosions, muzzle flashes, water, and smoke are pure particles: filled rects and circles from the palette. No sprites needed.
- Terrain for TOP and SIDE modes: tile grids of 16x16 procedural tiles (water, sand, jungle, bunker), same technique.

This satisfies "assets coded at the pixel level" literally: the entire art directory is .ts files.

---

## 5. Audio: Synthesized Chiptune

No samples anywhere. Two layers, both plain code:

**SFX** are short envelope-shaped oscillator bursts, NES-style. One helper, many presets:

```ts
// audio/sfx.ts, the core primitive
function blip(type: OscillatorType, f0: number, f1: number,
              dur: number, vol = 0.3) {
  const t = ctx.currentTime;
  const osc = ctx.createOscillator(), g = ctx.createGain();
  osc.type = type;                       // 'square' | 'sawtooth' | 'triangle'
  osc.frequency.setValueAtTime(f0, t);
  osc.frequency.exponentialRampToValueAtTime(f1, t + dur); // pitch sweep
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);     // decay envelope
  osc.connect(g).connect(master); osc.start(t); osc.stop(t + dur);
}
// shoot: blip('square', 880, 110, 0.08)
// explosion: same idea with a noise buffer instead of an oscillator
// pickup: blip('triangle', 440, 880, 0.15)
```

**Music** is a tiny sequencer: a lookahead scheduler (the standard Web Audio metronome pattern) reading note arrays. Songs are data: `[[noteFreq, beats], ...]` per channel, 2 square leads, 1 triangle bass, 1 noise drum track. That is literally the NES sound chip layout, which is why it will sound authentically 8-bit rather than "MIDI file in a browser."

One rule: `ctx.resume()` on first click or keypress, because browsers block audio until a user gesture. The "INSERT COIN / PRESS START" screen exists partly to solve this.

---

## 6. Input

Small module polling once per update into a single state object. Keyboard (arrows + WASD, Z/X or J/K fire, Enter start) and Gamepad API behind the same interface:

```ts
interface Input { up: boolean; down: boolean; left: boolean; right: boolean;
                  fire: boolean; special: boolean; start: boolean; }
```

Game code reads `input.fire`, never event listeners. Touch is out of scope for v0.

---

## 7. Architecture

```
src/
  engine/          # game-agnostic, ~600 lines total, reusable for every future cabinet
    loop.ts        # fixed timestep
    renderer.ts    # 640x480 buffer, present(), camera
    sprite.ts      # pixel-grid rasterizer, palette
    audio.ts       # ctx, master gain, blip(), noise(), sequencer
    input.ts       # keyboard + gamepad
    rng.ts         # mulberry32 seeded PRNG
    math.ts        # vec2, aabb, clamp, lerp
  game/
    palette.ts     # the 32 colors
    sprites/       # pixel grids: player, enemies, tiles, ui
    songs/         # note arrays
    entities.ts    # entity type + pools
    scenes/
      title.ts     # INSERT COIN, audio unlock
      top.ts       # vertical shmup mode
      side.ts      # side scroll mode      (later)
      roam.ts      # free roam mode        (later)
    waves.ts       # procedural wave generation (seeded)
    main.ts        # wires it together
```

**Entities:** no ECS framework. One plain interface, one flat array, object pools for bullets and particles so the GC never hiccups:

```ts
interface Entity {
  kind: 'player' | 'enemy' | 'bullet' | 'pickup' | 'particle';
  pos: Vec2; vel: Vec2; hp: number; radius: number;
  sprite: Sprite; age: number; alive: boolean;
  tick(dt: number): void;
}
```

**Collision:** circle vs circle for everything (bullets, ships, pickups). At a few hundred entities on a 640x480 field, brute-force pair checks per kind are microseconds. No spatial partitioning until profiling says otherwise.

**Scenes/modes:** each mode is `{ enter(), update(dt), draw(ctx) }`. TOP, SIDE, and ROAM share the engine and entities and differ in camera, gravity, and spawn logic. Mode transitions inside a level are just scene swaps with carried player state.

---

## 8. Build Order, Piece by Piece

Each milestone is small, runnable, and understandable before the next. Nothing depends on a future piece.

| # | Milestone | You'll understand | Size |
|---|---|---|---|
| 1 ✅ | Black 640x480 canvas, integer scaling, FPS counter | The render contract | ~80 lines |
| 2 ✅ | Fixed-timestep loop, moving test rect via keyboard | Loop and input | ~120 lines |
| 3 ✅ | sprite() rasterizer, palette, chopper on screen, animated rotor | Procedural art pipeline | ~150 lines |
| 4 | Bullets with pooling, fire rate, screen bounds | Entities and pools | ~120 lines |
| 5 | First enemy (drone boat), circle collision, explosion particles | Collision and particles | ~180 lines |
| 6 | blip() SFX: shoot, hit, explode, pickup | Audio synthesis | ~100 lines |
| 7 | Scrolling water tilemap, camera, waves.ts spawning from seed | Tiles, camera, seeded RNG | ~200 lines |
| 8 | HP, salvage pickups, HUD (score, lives, salvage) | Game state | ~150 lines |
| 9 | Sequencer + first song, title scene, INSERT COIN flow | Music and scenes | ~200 lines |
| 10 | Level 1 TOP segment playable start to finish | The vertical slice | glue |

After 10, the same pattern extends: SIDE mode (add gravity and a horizontal camera), the training gulch, ROAM mode (free camera, boss logic), then Level 1 complete. Rough total for the full engine plus Level 1: **2,500 to 3,500 lines**, every one of them yours.

---

## 9. Explicitly Deferred

Accounts, tokens, payments, the arcade shell, leaderboards, save/cloud state, touch controls, WebGL, the CRT shader, and multiplayer. The game runs from `npx vite` today and gets wrapped by gnarcade later. The only future-proofing now: the game exposes `start(seed)` and emits `gameover(score, salvage)`, so the shell can plug in a token check later without touching game code.