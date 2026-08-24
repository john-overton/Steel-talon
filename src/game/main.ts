// Combat sandbox (milestones 4-6): fly, shoot boats, hear it.
import { createAudio } from '../engine/audio';
import { createInput } from '../engine/input';
import { createLoop } from '../engine/loop';
import { createRenderer, HEIGHT, WIDTH } from '../engine/renderer';
import { mulberry32 } from '../engine/rng';
import { drawLayered, prepareLayered, rasterize } from '../engine/sprite';
import {
  collideBulletsEnemies, createWorld,
  tickBullets, tickEnemies, tickParticles,
} from './entities';
import { createRun, grantWeapon, tickRun } from './run';
import { SFX } from './sfx';
import { createBoat } from './sprites/boat';
import { CHOPPER_BODY, LAYER, createChopper } from './sprites/player';
import { TRACER } from './sprites/shots';
import { createWaveRunner, generateWaveScript, LEVEL_LENGTH, SCROLL_SPEED, tickWaves } from './waves';
import { createWeaponState, tickWeapons, type Mounts } from './weapons';

const SEED = 0xc0ffee; // fixed until start(seed) arrives with the shell seam

const screen = document.getElementById('screen') as HTMLCanvasElement;
const renderer = createRenderer(screen);
renderer.resize();
window.addEventListener('resize', () => renderer.resize());

const input = createInput();
input.attach(window);

const audio = createAudio();
// No { once: true }: unlock() is idempotent and cheap, and if the context
// is still suspended after the first keydown (autoplay policy quirks) we
// want every subsequent keydown to retry rather than going silent forever.
window.addEventListener('keydown', () => audio.unlock());

const rng = mulberry32(SEED);
const world = createWorld(rng);
// Sandbox starts with miniguns granted so it still plays like pass 2 until
// pickups (Task 11) let the player earn the loadout in-run.
const run = createRun();
grantWeapon(run, 'miniguns');
const ws = createWeaponState();

// Seeded Level 1 wave script (milestone 7). The sandbox has no camera/scene
// yet (Task 16 adds the TOP scene), so we simulate a camera sweeping from
// the top of the level strip down to 0 and translate spawned entities into
// screen space by hand below.
const waveScript = generateWaveScript(mulberry32(SEED), LEVEL_LENGTH);
const waveRunner = createWaveRunner(waveScript);
let camYSim = LEVEL_LENGTH - HEIGHT;
// Reused every tick instead of allocated: mutated in place from the
// chopper's current position for the new camera-relative signatures.
const PLAYER_POS = { x: 0, y: 0 };

const SPEED = 180; // pixels per second
const CHOPPER_SCALE = 1;
const chopperSprite = createChopper();
const chopperPrepared = prepareLayered(chopperSprite);
const rotorLayer = chopperSprite.layers[LAYER.ROTOR];
const podFlashLayers = [
  chopperSprite.layers[LAYER.FLASH_L],
  chopperSprite.layers[LAYER.FLASH_R],
];
const noseFlashLayer = chopperSprite.layers[LAYER.FLASH_NOSE];
const boatPrepared = prepareLayered(createBoat());
const tracerCanvas = rasterize(TRACER.frames[0]);
const [TRACER_CX, TRACER_CY] = TRACER.anchors.center;

const chopper = {
  x: WIDTH / 2,
  y: HEIGHT - 80,
  w: CHOPPER_BODY.frames[0].width * CHOPPER_SCALE,
  h: CHOPPER_BODY.frames[0].height * CHOPPER_SCALE,
};
let ticks = 0;

// Reused every tick instead of allocated: offsets from the chopper anchors
// are static, only x/y need updating as the chopper moves.
const MOUNT_HALF = 16 * CHOPPER_SCALE;
const [NOSE_X, NOSE_Y] = CHOPPER_BODY.anchors.nose;
const [POD_L_X, POD_L_Y] = CHOPPER_BODY.anchors.muzzleL;
const [POD_R_X, POD_R_Y] = CHOPPER_BODY.anchors.muzzleR;
const [PYLON_L_X, PYLON_L_Y] = CHOPPER_BODY.anchors.pylonL;
const [PYLON_R_X, PYLON_R_Y] = CHOPPER_BODY.anchors.pylonR;
const MOUNTS: Mounts = {
  nose: { x: 0, y: 0, dir: 1 },
  podL: { x: 0, y: 0, dir: -1 },
  podR: { x: 0, y: 0, dir: 1 },
  pylonL: { x: 0, y: 0, dir: -1 },
  pylonR: { x: 0, y: 0, dir: 1 },
};

function updateMounts(): Mounts {
  MOUNTS.nose.x = chopper.x - MOUNT_HALF + NOSE_X * CHOPPER_SCALE;
  MOUNTS.nose.y = chopper.y - MOUNT_HALF + NOSE_Y * CHOPPER_SCALE;
  MOUNTS.podL.x = chopper.x - MOUNT_HALF + POD_L_X * CHOPPER_SCALE;
  MOUNTS.podL.y = chopper.y - MOUNT_HALF + POD_L_Y * CHOPPER_SCALE;
  MOUNTS.podR.x = chopper.x - MOUNT_HALF + POD_R_X * CHOPPER_SCALE;
  MOUNTS.podR.y = chopper.y - MOUNT_HALF + POD_R_Y * CHOPPER_SCALE;
  MOUNTS.pylonL.x = chopper.x - MOUNT_HALF + PYLON_L_X * CHOPPER_SCALE;
  MOUNTS.pylonL.y = chopper.y - MOUNT_HALF + PYLON_L_Y * CHOPPER_SCALE;
  MOUNTS.pylonR.x = chopper.x - MOUNT_HALF + PYLON_R_X * CHOPPER_SCALE;
  MOUNTS.pylonR.y = chopper.y - MOUNT_HALF + PYLON_R_Y * CHOPPER_SCALE;
  return MOUNTS;
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

  tickRun(run, dt);
  const f = tickWeapons(world, run, ws, updateMounts(), input.state.fire, dt);
  if (f) audio.blip(SFX.shoot);

  camYSim -= SCROLL_SPEED * dt;
  tickWaves(world, waveRunner, camYSim);
  // temporary until Task 16: no scene/camera yet, so newly spawned entities
  // (world-space, y = atY) are translated into the sandbox's screen space
  // by hand, once, right after they spawn.
  world.enemies.forEachAlive((e) => { if (e.age === 0) e.pos.y -= camYSim; });
  world.pickups.forEachAlive((p) => { if (p.age === 0) p.pos.y -= camYSim; });

  PLAYER_POS.x = chopper.x;
  PLAYER_POS.y = chopper.y;
  tickBullets(world, dt, 0);
  tickEnemies(world, dt, 0, PLAYER_POS);
  tickParticles(world, dt);

  const hits = collideBulletsEnemies(world);
  if (hits.kills > 0) audio.blip(SFX.explode);
  else if (hits.hits > 0) audio.blip(SFX.hit);

  for (const layer of podFlashLayers) {
    layer.visible = ws.flashTicks > 0 && run.selected === 2;
    layer.frame = ws.flashFrame;
  }
  noseFlashLayer.visible = ws.flashTicks > 0 && run.selected === 1;
  noseFlashLayer.frame = ws.flashFrame;
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
    ctx.drawImage(tracerCanvas, Math.round(b.pos.x - TRACER_CX), Math.round(b.pos.y - TRACER_CY));
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
