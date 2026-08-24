// Milestone 1: black 640x480 field, integer-scaled, with an FPS debug overlay.
import { createRenderer, HEIGHT, WIDTH } from '../engine/renderer';

const screen = document.getElementById('screen') as HTMLCanvasElement;
const renderer = createRenderer(screen);
renderer.resize();
window.addEventListener('resize', () => renderer.resize());

let frames = 0;
let fps = 0;
let fpsWindowStart = 0;

function draw(now: number): void {
  frames++;
  if (now - fpsWindowStart >= 1000) {
    fps = frames;
    frames = 0;
    fpsWindowStart = now;
  }
  const { ctx } = renderer;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.fillStyle = '#9badb7';
  ctx.font = '10px monospace';
  ctx.fillText(`FPS ${fps}`, 4, 12);
  renderer.present();
  requestAnimationFrame(draw);
}
requestAnimationFrame(draw);
