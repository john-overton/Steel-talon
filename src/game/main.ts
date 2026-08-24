// Combat sandbox (milestones 4-6): fly, shoot boats, hear it.
import { createAudio } from '../engine/audio';
import { createInput } from '../engine/input';
import { createLoop } from '../engine/loop';
import { createRenderer, HEIGHT, WIDTH } from '../engine/renderer';
import { mulberry32 } from '../engine/rng';
import { drawLayered, prepareLayered, rasterize } from '../engine/sprite';
import {
  collideBulletsEnemies, createFireControl, createWorld,
  tickBullets, tickEnemies, tickFire, tickParticles, type Muzzle,
} from './entities';
import { SFX } from './sfx';
import { createBoat } from './sprites/boat';
import { CHOPPER_BODY, LAYER, createChopper } from './sprites/player';
import { TRACER } from './sprites/shots';
import { createWaveRunner, generateWaveScript, LEVEL_LENGTH, SCROLL_SPEED, tickWaves } from './waves';

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
const fire = createFireControl();

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
const flashLayers = [
  chopperSprite.layers[LAYER.FLASH_L],
  chopperSprite.layers[LAYER.FLASH_R],
];
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
const MUZZLE_HALF = 16 * CHOPPER_SCALE;
const [MUZZLE_L_X, MUZZLE_L_Y] = CHOPPER_BODY.anchors.muzzleL;
const [MUZZLE_R_X, MUZZLE_R_Y] = CHOPPER_BODY.anchors.muzzleR;
const MUZZLES: Muzzle[] = [
  { x: 0, y: 0, dir: -1 },
  { x: 0, y: 0, dir: 1 },
];

function muzzles(): Muzzle[] {
  MUZZLES[0].x = chopper.x - MUZZLE_HALF + MUZZLE_L_X * CHOPPER_SCALE;
  MUZZLES[0].y = chopper.y - MUZZLE_HALF + MUZZLE_L_Y * CHOPPER_SCALE;
  MUZZLES[1].x = chopper.x - MUZZLE_HALF + MUZZLE_R_X * CHOPPER_SCALE;
  MUZZLES[1].y = chopper.y - MUZZLE_HALF + MUZZLE_R_Y * CHOPPER_SCALE;
  return MUZZLES;
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
