// Milestone 3: fixed-timestep loop moving the player chopper via keyboard.
import { createInput } from '../engine/input';
import { createLoop } from '../engine/loop';
import { createRenderer, HEIGHT, WIDTH } from '../engine/renderer';
import { rasterize } from '../engine/sprite';
import { CHOPPER_FRAMES } from './sprites/player';

const screen = document.getElementById('screen') as HTMLCanvasElement;
const renderer = createRenderer(screen);
renderer.resize();
window.addEventListener('resize', () => renderer.resize());

const input = createInput();
input.attach(window);

const SPEED = 180; // pixels per second
const CHOPPER_SCALE = 2; // sprite data stays 16x16; drawn at 2x (smoothing off keeps it crisp)
const chopperCanvases = CHOPPER_FRAMES.map(rasterize);
const chopper = {
  x: WIDTH / 2,
  y: HEIGHT / 2,
  w: CHOPPER_FRAMES[0].width * CHOPPER_SCALE,
  h: CHOPPER_FRAMES[0].height * CHOPPER_SCALE,
};
let ticks = 0;

function update(dt: number): void {
  ticks++;
  if (input.state.up) chopper.y -= SPEED * dt;
  if (input.state.down) chopper.y += SPEED * dt;
  if (input.state.left) chopper.x -= SPEED * dt;
  if (input.state.right) chopper.x += SPEED * dt;
  chopper.x = Math.min(Math.max(chopper.x, chopper.w / 2), WIDTH - chopper.w / 2);
  chopper.y = Math.min(Math.max(chopper.y, chopper.h / 2), HEIGHT - chopper.h / 2);
}

let frames = 0;
let fps = 0;
let fpsWindowStart = 0;

function render(): void {
  const { ctx } = renderer;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  const frameIndex = Math.floor(ticks / 4) % chopperCanvases.length;
  ctx.drawImage(
    chopperCanvases[frameIndex],
    Math.round(chopper.x - chopper.w / 2),
    Math.round(chopper.y - chopper.h / 2),
    chopper.w,
    chopper.h,
  );
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
