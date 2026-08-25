// Level 1 TOP scene: the vertical slice. Scrolling water strip, seeded
// wave script, four-slot arsenal, HUD, and the complete/gameover outro.
// update() stays DOM-free (headless-testable): prepared sprite canvases
// are built lazily on first draw().
import type { AudioSystem } from '../../engine/audio';
import type { InputSource } from '../../engine/input';
import { HEIGHT, WIDTH, type Camera } from '../../engine/renderer';
import { mulberry32 } from '../../engine/rng';
import type { Scene } from '../../engine/scene';
import type { Sequencer } from '../../engine/sequencer';
import { drawTilemap, type Tilemap } from '../../engine/tilemap';
import type { TerrainLayer } from '../terrain';
import { drawLayered, prepareLayered, rasterize, type PreparedLayered } from '../../engine/sprite';
import {
  collideBulletsEnemies,
  collideEnemiesPlayer,
  collideEnemyBulletsPlayer,
  collidePickupsPlayer,
  createWorld,
  spawnSmoke,
  tickBullets,
  tickEnemies,
  tickEnemyBullets,
  tickParticles,
  tickPickups,
  type PickupKind,
  type World,
} from '../entities';
import { createHud, formatScore } from '../hud';
import { PALETTE } from '../palette';
import { createPauseMenu, pauseMenuMoved, tickPauseMenu, type PauseEdges } from '../pausemenu';
import {
  addScore,
  armMissiles,
  collectSalvage,
  createRun,
  cycleWeapon,
  damagePlayer,
  grantWeapon,
  selectWeapon,
  tickRun,
  type RunState,
} from '../run';
import { SFX } from '../sfx';
import { LEVEL_LENGTH, SCROLL_SPEED, createWaveRunner, generateWaveScript, tickWaves, type WaveRunner } from '../waves';
import {
  createWeaponState,
  tickWeapons,
  type Mounts,
  type WeaponState,
} from '../weapons';
import { CHOPPER_BODY, LAYER, createChopper } from '../sprites/player';
import { createBoat } from '../sprites/boat';
import { createDelta } from '../sprites/delta';
import { ENEMY_SHOT, ENEMY_SHOT_FRAME_TICKS, ROCKET, TRACER } from '../sprites/shots';
import {
  CRATE,
  MINIGUN_PICKUP,
  PICKUP_FRAME_TICKS,
  ROCKET_PICKUP,
  SALVAGE,
  SALVAGE_FRAME_TICKS,
} from '../sprites/pickups';
import { WATER_FRAME_TICKS } from '../sprites/tiles';
import { LEVEL1_SONG } from '../songs/level1';

/** Optional dev-only seam: when supplied, the TOP scene runs as a sandbox
 *  (waves off, scroll frozen, full arsenal, respawn in place) and hands each
 *  playing tick to the host first. Production wiring never passes this. */
export interface SandboxHooks {
  /** Called once per playing tick, before pause handling and gameplay.
   *  Return true to freeze this tick (e.g. the spawn overlay is open). */
  tick(world: World, playerX: number, camY: number): boolean;
  /** Screen-space overlay, drawn last. */
  draw(ctx: CanvasRenderingContext2D): void;
}

export interface TopDeps {
  input: InputSource;
  audio: AudioSystem;
  sequencer: Sequencer;
  camera: Camera;
  water: Tilemap;
  /** Island scenery drawn over the water. Omitted by the dev sandbox. */
  terrain?: TerrainLayer;
  makeRng(): () => number;
  onExit(score: number, salvage: number): void;
  onAbandon(): void;
  sandbox?: SandboxHooks;
}

export type Overlay = 'playing' | 'paused' | 'complete' | 'gameover';

const SPEED = 360;
// Terrain sampling offset: camera.x is pinned to 0 all level long, so a raw
// terrain.draw(ctx, camera.x, ...) always samples world x in [0,640) — the
// western edge of plot column 0, where the field's BORDER_FADE forces
// elevation toward 0 (open water). Shifting the sample by a plot-interior
// strip keeps the flight path over land most of the time.
const TERRAIN_X_OFFSET = 2180;
const SQRT1_2 = Math.SQRT1_2;
const PLAYER_RADIUS = 20;
const CHOPPER_HALF = 32; // CHOPPER_BODY is 64x64, scale 1
const OUTRO_TICKS = 300; // 5s at 60Hz
const TALLY_TICKS = 120; // 2s roll-up
const PAUSE_ITEMS = ['CONTINUE', 'ABANDON RUN'] as const;

interface PreparedAssets {
  chopper: PreparedLayered;
  boat: PreparedLayered;
  delta: PreparedLayered;
  tracer: HTMLCanvasElement;
  rocket: HTMLCanvasElement;
  enemyShot: HTMLCanvasElement[];
  minigunPickup: HTMLCanvasElement[];
  rocketPickup: HTMLCanvasElement[];
  crate: HTMLCanvasElement;
  salvage: HTMLCanvasElement[];
  hud: ReturnType<typeof createHud>;
}

// The extra accessor is a minimal read-only test seam (playerPos itself
// is a closure-private, reused object — never allocated per tick, never
// exposed for mutation) so tests can assert the chopper rides the scroll.
export function createTopScene(deps: TopDeps): Scene & {
  debugPlayerY(): number;
  debugOverlay(): Overlay;
  debugSelected(): number;
  debugRun(): Readonly<RunState>;
  debugDamage(): void;
} {
  // Reused closure-level objects — no per-tick allocation.
  const playerPos = { x: 0, y: 0 };
  const MOUNTS: Mounts = {
    nose: { x: 0, y: 0, dir: 1 },
    podL: { x: 0, y: 0, dir: -1 },
    podR: { x: 0, y: 0, dir: 1 },
    pylonL: { x: 0, y: 0, dir: -1 },
    pylonR: { x: 0, y: 0, dir: 1 },
  };
  const prevInput = {
    weapon1: false, weapon2: false, weapon3: false, weapon4: false, special: false,
    pause: false, up: false, down: false, start: false,
  };
  const pauseMenu = createPauseMenu();
  // Reused every paused tick — no per-tick allocation.
  const pauseEdges: PauseEdges = { up: false, down: false, confirm: false, pause: false };

  // `state` holds everything reassigned by enter(); callbacks close over
  // this single mutable object so a fresh enter() never strands a stale
  // reference (the pickup-collect callback in particular).
  const state: {
    rng: () => number;
    world: World;
    run: RunState;
    ws: WeaponState;
    script: ReturnType<typeof generateWaveScript>;
    runner: WaveRunner;
    overlay: Overlay;
    overlayTicks: number;
    ticks: number;
    tallyShown: number;
  } = {
    rng: mulberry32(0),
    world: createWorld(mulberry32(0)),
    run: createRun(),
    ws: createWeaponState(),
    script: [],
    runner: createWaveRunner([]),
    overlay: 'playing',
    overlayTicks: 0,
    ticks: 0,
    tallyShown: 0,
  };

  const chopper = createChopper();

  const onPickupCollect = (kind: PickupKind): void => {
    const run = state.run;
    switch (kind) {
      case 'salvage':
        collectSalvage(run);
        deps.audio.blip(SFX.pickup);
        break;
      case 'crate':
        armMissiles(run);
        deps.audio.blip(SFX.pickup);
        break;
      case 'minigun':
        grantWeapon(run, 'miniguns');
        deps.audio.blip(SFX.pickup);
        break;
      case 'rockets':
        grantWeapon(run, 'rockets');
        deps.audio.blip(SFX.pickup);
        break;
    }
  };

  // Copy current input into prevInput for edge detection next tick — every
  // overlay state (and every early return), so no stale edge fires after a
  // transition. Mutates the reused prevInput object; allocates nothing.
  const latchPrevInput = (): void => {
    const input = deps.input.state;
    prevInput.weapon1 = input.weapon1;
    prevInput.weapon2 = input.weapon2;
    prevInput.weapon3 = input.weapon3;
    prevInput.weapon4 = input.weapon4;
    prevInput.special = input.special;
    prevInput.pause = input.pause;
    prevInput.up = input.up;
    prevInput.down = input.down;
    prevInput.start = input.start;
  };

  // One hit's worth of damage resolution. In sandbox mode a fatal result
  // respawns in place (lives/hp restored, mercy invuln) instead of ending
  // the run, so the overlay never leaves 'playing' and the music keeps going.
  const resolveHit = (): void => {
    const run = state.run;
    const world = state.world;
    const result = damagePlayer(run);
    if (deps.sandbox && (result === 'death' || result === 'gameover')) {
      run.lives = 3;
      run.hp = 3;
      run.invulnTicks = 180;
      for (let i = 0; i < 4; i++) spawnSmoke(world, playerPos.x, playerPos.y, 0.8);
      deps.audio.blip(SFX.explode);
      return;
    }
    switch (result) {
      case 'hit':
        deps.audio.blip(SFX.hit);
        break;
      case 'death':
        for (let i = 0; i < 4; i++) spawnSmoke(world, playerPos.x, playerPos.y, 0.8);
        deps.audio.blip(SFX.explode);
        break;
      case 'gameover':
        deps.audio.blip(SFX.explode);
        state.overlay = 'gameover';
        state.overlayTicks = 0;
        deps.sequencer.stop();
        break;
      case 'shrugged':
        break;
    }
  };

  let prepared: PreparedAssets | null = null;

  function ensurePrepared(): PreparedAssets {
    if (!prepared) {
      prepared = {
        chopper: prepareLayered(chopper),
        boat: prepareLayered(createBoat()),
        delta: prepareLayered(createDelta()),
        tracer: rasterize(TRACER.frames[0]),
        rocket: rasterize(ROCKET.frames[0]),
        enemyShot: ENEMY_SHOT.frames.map(rasterize),
        minigunPickup: MINIGUN_PICKUP.frames.map(rasterize),
        rocketPickup: ROCKET_PICKUP.frames.map(rasterize),
        crate: rasterize(CRATE.frames[0]),
        salvage: SALVAGE.frames.map(rasterize),
        hud: createHud(),
      };
    }
    return prepared;
  }

  // collectSalvage() already banks +25/salvage into run.score, so the
  // tally target must match run.score exactly — no double count.
  function tallyTarget(): number {
    return state.run.score;
  }

  return {
    debugPlayerY() {
      return playerPos.y;
    },
    debugOverlay() {
      return state.overlay;
    },
    debugSelected() {
      return state.run.selected;
    },
    debugRun() {
      return state.run;
    },
    // Test/dev drive seam only — no production caller. Clears the mercy
    // window first so every call lands a real hit; otherwise damagePlayer()
    // short-circuits to 'shrugged' and the fatal branches never run.
    debugDamage() {
      state.run.invulnTicks = 0;
      resolveHit();
    },
    enter() {
      state.rng = deps.makeRng();
      state.world = createWorld(state.rng);
      state.run = createRun();
      if (deps.sandbox) {
        grantWeapon(state.run, 'miniguns');
        grantWeapon(state.run, 'rockets');
        state.run.missileAmmo = 9;
        state.run.selected = 1;
      }
      state.ws = createWeaponState();
      // Sandbox runs script-free: enemies come from the spawn menu only.
      state.script = deps.sandbox ? [] : generateWaveScript(state.rng, LEVEL_LENGTH);
      state.runner = createWaveRunner(state.script);
      state.overlay = 'playing';
      state.overlayTicks = 0;
      state.ticks = 0;
      state.tallyShown = 0;

      deps.camera.x = 0;
      deps.camera.y = LEVEL_LENGTH - HEIGHT;
      playerPos.x = WIDTH / 2;
      playerPos.y = deps.camera.y + HEIGHT - 80;

      prevInput.weapon1 = false;
      prevInput.weapon2 = false;
      prevInput.weapon3 = false;
      prevInput.weapon4 = false;
      prevInput.special = false;
      prevInput.pause = false;
      prevInput.up = false;
      prevInput.down = false;
      prevInput.start = false;
      pauseMenu.cursor = 0;

      // Reset layer visibility/frame state the scene owns (prepared
      // sprites, once built, are reused across runs).
      chopper.layers[LAYER.FLASH_L].visible = false;
      chopper.layers[LAYER.FLASH_R].visible = false;
      chopper.layers[LAYER.FLASH_NOSE].visible = false;
      chopper.layers[LAYER.MISSILE_L].visible = false;
      chopper.layers[LAYER.MISSILE_R].visible = false;
      chopper.layers[LAYER.ROTOR].frame = 0;

      deps.sequencer.play(LEVEL1_SONG);
    },

    update(dt) {
      const { world, run, ws, runner, script } = state;
      const camera = deps.camera;
      const input = deps.input.state;

      if (deps.sandbox && state.overlay === 'playing') {
        if (deps.sandbox.tick(world, playerPos.x, camera.y)) {
          latchPrevInput();
          return;
        }
      }

      const edgePause = input.pause && !prevInput.pause;

      if (state.overlay === 'playing' && edgePause) {
        state.overlay = 'paused';
        pauseMenu.cursor = 0;
        deps.audio.blip(SFX.select);
      } else if (state.overlay === 'playing') {
        state.ticks++;
        tickRun(run, dt);
        if (deps.sandbox) run.missileAmmo = 9;

        // Scroll. Ride the frame: apply the camera's actual delta (clamped
        // at 0, same as camera.y itself) to the player before input moves
        // them, so a hands-off chopper holds its screen position instead
        // of drifting toward the bottom as the world scrolls up under it.
        const prevCamY = camera.y;
        // Sandbox holds the strip still; the delta-ride line below becomes
        // a no-op rather than a special case.
        camera.y = Math.max(0, camera.y - (deps.sandbox ? 0 : SCROLL_SPEED) * dt);
        playerPos.y += camera.y - prevCamY;

        // Move player.
        let dx = 0;
        let dy = 0;
        if (input.left) dx -= 1;
        if (input.right) dx += 1;
        if (input.up) dy -= 1;
        if (input.down) dy += 1;
        if (dx !== 0 && dy !== 0) {
          dx *= SQRT1_2;
          dy *= SQRT1_2;
        }
        playerPos.x += dx * SPEED * dt;
        playerPos.y += dy * SPEED * dt;
        playerPos.x = Math.max(CHOPPER_HALF, Math.min(WIDTH - CHOPPER_HALF, playerPos.x));
        playerPos.y = Math.max(
          camera.y + CHOPPER_HALF,
          Math.min(camera.y + HEIGHT - CHOPPER_HALF, playerPos.y),
        );

        // Weapon selection (rising edge).
        if (input.weapon1 && !prevInput.weapon1) {
          deps.audio.blip(selectWeapon(run, 1) ? SFX.select : SFX.deny);
        }
        if (input.weapon2 && !prevInput.weapon2) {
          deps.audio.blip(selectWeapon(run, 2) ? SFX.select : SFX.deny);
        }
        if (input.weapon3 && !prevInput.weapon3) {
          deps.audio.blip(selectWeapon(run, 3) ? SFX.select : SFX.deny);
        }
        if (input.weapon4 && !prevInput.weapon4) {
          deps.audio.blip(selectWeapon(run, 4) ? SFX.select : SFX.deny);
        }
        if (input.special && !prevInput.special) {
          cycleWeapon(run);
          deps.audio.blip(SFX.select);
        }

        // Update mounts from player position + chopper anchors.
        const a = CHOPPER_BODY.anchors;
        MOUNTS.nose.x = playerPos.x - CHOPPER_HALF + a.nose[0];
        MOUNTS.nose.y = playerPos.y - CHOPPER_HALF + a.nose[1];
        // Fire from the barrel anchors the muzzle flashes draw on, not the
        // pods' top-left attach corners (those are asymmetric: -23 / +14).
        MOUNTS.podL.x = playerPos.x - CHOPPER_HALF + a.muzzleL[0];
        MOUNTS.podL.y = playerPos.y - CHOPPER_HALF + a.muzzleL[1];
        MOUNTS.podR.x = playerPos.x - CHOPPER_HALF + a.muzzleR[0];
        MOUNTS.podR.y = playerPos.y - CHOPPER_HALF + a.muzzleR[1];
        MOUNTS.pylonL.x = playerPos.x - CHOPPER_HALF + a.pylonL[0];
        MOUNTS.pylonL.y = playerPos.y - CHOPPER_HALF + a.pylonL[1];
        MOUNTS.pylonR.x = playerPos.x - CHOPPER_HALF + a.pylonR[0];
        MOUNTS.pylonR.y = playerPos.y - CHOPPER_HALF + a.pylonR[1];

        const firedKind = tickWeapons(world, run, ws, MOUNTS, input.fire, dt);
        if (firedKind) deps.audio.blip(SFX.shoot);

        tickWaves(world, runner, camera.y);

        tickBullets(world, dt, camera.y);
        tickEnemyBullets(world, dt, camera.y);
        tickEnemies(world, dt, camera.y, playerPos);
        tickPickups(world, dt, camera.y, playerPos);
        tickParticles(world, dt);

        const r = collideBulletsEnemies(world);
        addScore(run, r.score);
        if (r.kills > 0) deps.audio.blip(SFX.explode);
        else if (r.hits > 0) deps.audio.blip(SFX.hit);

        const invuln = run.invulnTicks > 0;
        const hit =
          collideEnemyBulletsPlayer(world, playerPos, PLAYER_RADIUS, invuln) ||
          collideEnemiesPlayer(world, playerPos, PLAYER_RADIUS, invuln);
        if (hit) resolveHit();

        collidePickupsPlayer(world, playerPos, 24, onPickupCollect);

        // Chopper layer state.
        chopper.layers[LAYER.FLASH_L].visible = ws.flashTicks > 0 && run.selected === 2;
        chopper.layers[LAYER.FLASH_R].visible = ws.flashTicks > 0 && run.selected === 2;
        chopper.layers[LAYER.FLASH_NOSE].visible = ws.flashTicks > 0 && run.selected === 1;
        chopper.layers[LAYER.FLASH_L].frame = ws.flashFrame;
        chopper.layers[LAYER.FLASH_R].frame = ws.flashFrame;
        chopper.layers[LAYER.FLASH_NOSE].frame = ws.flashFrame;
        chopper.layers[LAYER.MISSILE_L].visible = run.missileAmmo > 0;
        chopper.layers[LAYER.MISSILE_R].visible = run.missileAmmo > 0;
        chopper.layers[LAYER.ROTOR].frame = Math.floor(state.ticks / 4) % 2;

        // Outro check.
        if (!deps.sandbox && camera.y === 0 && world.enemies.countAlive() === 0 && runner.next >= script.length) {
          state.overlay = 'complete';
          state.overlayTicks = 0;
          deps.sequencer.stop();
        }
      } else if (state.overlay === 'paused') {
        // Paused: nothing world-side advances (no ticks, no scroll, no RNG
        // consultation) — only the menu itself reacts to input.
        pauseEdges.up = input.up && !prevInput.up;
        pauseEdges.down = input.down && !prevInput.down;
        pauseEdges.confirm = input.start && !prevInput.start;
        pauseEdges.pause = edgePause;
        const cursorBefore = pauseMenu.cursor;
        const action = tickPauseMenu(pauseMenu, pauseEdges);
        if (pauseMenuMoved(cursorBefore, pauseMenu.cursor)) deps.audio.blip(SFX.select);
        if (action === 'continue') {
          state.overlay = 'playing';
        } else if (action === 'abandon') {
          deps.sequencer.stop();
          deps.onAbandon();
        }
      } else {
        state.overlayTicks++;
        tickParticles(world, dt);
        const target = tallyTarget();
        state.tallyShown = Math.min(
          target,
          Math.floor((state.overlayTicks * target) / TALLY_TICKS),
        );
        if (state.overlayTicks === OUTRO_TICKS) {
          deps.onExit(run.score, run.salvage);
        }
      }

      latchPrevInput();
    },

    draw(ctx) {
      const assets = ensurePrepared();
      const { world, run, overlay, ticks, tallyShown } = state;
      const camera = deps.camera;

      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, WIDTH, HEIGHT);

      drawTilemap(ctx, deps.water, camera.x, camera.y, WIDTH, HEIGHT, Math.floor(ticks / WATER_FRAME_TICKS));
      deps.terrain?.draw(ctx, camera.x + TERRAIN_X_OFFSET, camera.y, ticks);

      // Pickups.
      world.pickups.forEachAlive((p) => {
        const x = p.pos.x - camera.x;
        const y = p.pos.y - camera.y;
        let canvas: HTMLCanvasElement;
        switch (p.pickupKind) {
          case 'minigun':
            canvas = assets.minigunPickup[Math.floor(ticks / PICKUP_FRAME_TICKS) % 4];
            break;
          case 'rockets':
            canvas = assets.rocketPickup[Math.floor(ticks / PICKUP_FRAME_TICKS) % 4];
            break;
          case 'salvage':
            canvas = assets.salvage[Math.floor(ticks / SALVAGE_FRAME_TICKS) % 2];
            break;
          case 'crate':
          default:
            canvas = assets.crate;
            break;
        }
        ctx.drawImage(canvas, Math.round(x - canvas.width / 2), Math.round(y - canvas.height / 2));
      });

      // Enemies.
      world.enemies.forEachAlive((e) => {
        const x = e.pos.x - camera.x;
        const y = e.pos.y - camera.y;
        if (e.enemyKind === 'delta') {
          assets.delta.sprite.layers[1].frame = Math.floor(ticks / 6) % 2;
          drawLayered(ctx, assets.delta, x, y);
        } else {
          drawLayered(ctx, assets.boat, x, y);
        }
      });

      // Enemy bullets.
      {
        const shotCanvas = assets.enemyShot[Math.floor(ticks / ENEMY_SHOT_FRAME_TICKS) % 2];
        world.enemyBullets.forEachAlive((b) => {
          const x = b.pos.x - camera.x;
          const y = b.pos.y - camera.y;
          ctx.drawImage(shotCanvas, Math.round(x - shotCanvas.width / 2), Math.round(y - shotCanvas.height / 2));
        });
      }

      // Player bullets.
      world.bullets.forEachAlive((b) => {
        const canvas = b.dmg >= 2 ? assets.rocket : assets.tracer;
        const x = b.pos.x - camera.x;
        const y = b.pos.y - camera.y;
        ctx.drawImage(canvas, Math.round(x - canvas.width / 2), Math.round(y - canvas.height / 2));
      });

      // Chopper (skip on invuln blink ticks).
      const blinking = run.invulnTicks > 0 && Math.floor(ticks / 4) % 2 === 1;
      if (!blinking) {
        drawLayered(ctx, assets.chopper, playerPos.x - camera.x, playerPos.y - camera.y);
      }

      // Particles.
      world.particles.forEachAlive((p) => {
        ctx.fillStyle = p.color;
        ctx.fillRect(
          Math.round(p.pos.x - camera.x - p.size / 2),
          Math.round(p.pos.y - camera.y - p.size / 2),
          p.size,
          p.size,
        );
      });

      assets.hud.draw(ctx, run);

      if (overlay === 'complete' || overlay === 'gameover') {
        ctx.textAlign = 'center';
        ctx.font = '24px monospace';
        ctx.fillStyle = overlay === 'complete' ? PALETTE[8] : PALETTE[27];
        ctx.fillText(overlay === 'complete' ? 'SEGMENT COMPLETE' : 'GAME OVER', WIDTH / 2, HEIGHT / 2 - 20);

        ctx.font = '14px monospace';
        ctx.fillStyle = PALETTE[21];
        ctx.fillText(`SCORE ${formatScore(tallyShown)}`, WIDTH / 2, HEIGHT / 2 + 6);

        if (overlay === 'complete') {
          ctx.font = '12px monospace';
          ctx.fillStyle = PALETTE[5];
          ctx.fillText('GOOD SHOOTING, TEX.', WIDTH / 2, HEIGHT / 2 + 26);
        }
        ctx.textAlign = 'left';
      }

      if (overlay === 'paused') {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.fillRect(0, 0, WIDTH, HEIGHT);
        ctx.textAlign = 'center';
        ctx.font = '24px monospace';
        ctx.fillStyle = PALETTE[21];
        ctx.fillText('P A U S E D', WIDTH / 2, HEIGHT / 2 - 48);
        ctx.font = '16px monospace';
        for (let i = 0; i < PAUSE_ITEMS.length; i++) {
          ctx.fillStyle = pauseMenu.cursor === i ? PALETTE[8] : PALETTE[22];
          ctx.fillText(
            (pauseMenu.cursor === i ? '> ' : '  ') + PAUSE_ITEMS[i],
            WIDTH / 2,
            HEIGHT / 2 - 8 + i * 24,
          );
        }
        ctx.font = '12px monospace';
        ctx.fillStyle = PALETTE[27];
        ctx.fillText('ABANDONING FORFEITS YOUR CREDIT', WIDTH / 2, HEIGHT / 2 + 56);
        ctx.textAlign = 'left';
      }

      deps.sandbox?.draw(ctx);
    },
  };
}
