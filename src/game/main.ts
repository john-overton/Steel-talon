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
