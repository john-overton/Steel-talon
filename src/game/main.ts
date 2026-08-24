// Milestone 2: fixed-timestep loop moving a test rect via keyboard.
import { createInput } from '../engine/input';
import { createLoop } from '../engine/loop';
import { createRenderer, HEIGHT, WIDTH } from '../engine/renderer';

const screen = document.getElementById('screen') as HTMLCanvasElement;
const renderer = createRenderer(screen);
renderer.resize();
window.addEventListener('resize', () => renderer.resize());

const input = createInput();
input.attach(window);

const RECT_SPEED = 180; // pixels per second
const rect = { x: WIDTH / 2 - 8, y: HEIGHT / 2 - 8, w: 16, h: 16 };

function update(dt: number): void {
  if (input.state.up) rect.y -= RECT_SPEED * dt;
  if (input.state.down) rect.y += RECT_SPEED * dt;
  if (input.state.left) rect.x -= RECT_SPEED * dt;
  if (input.state.right) rect.x += RECT_SPEED * dt;
  rect.x = Math.min(Math.max(rect.x, 0), WIDTH - rect.w);
  rect.y = Math.min(Math.max(rect.y, 0), HEIGHT - rect.h);
}

let frames = 0;
let fps = 0;
let fpsWindowStart = 0;

function render(): void {
  const { ctx } = renderer;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.fillStyle = '#6abe30';
  ctx.fillRect(Math.round(rect.x), Math.round(rect.y), rect.w, rect.h);
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
