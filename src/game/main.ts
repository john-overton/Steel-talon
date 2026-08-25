// Shell seam (engine spec §9): the game exposes start(seed) and emits
// gameover(score, salvage). Everything else stays inside.
import { createAudio } from '../engine/audio';
import { createInput } from '../engine/input';
import { createLoop } from '../engine/loop';
import { createRenderer } from '../engine/renderer';
import { mulberry32 } from '../engine/rng';
import { createSceneManager } from '../engine/scene';
import { createSequencer } from '../engine/sequencer';
import { createTitleScene } from './scenes/title';
import { createTopScene } from './scenes/top';
import { createTerrainLayer } from './terrain';
import { createWaterTilemap } from './sprites/tiles';

type GameOverCb = (score: number, salvage: number) => void;
let gameOverCb: GameOverCb = () => {};

export function onGameOver(cb: GameOverCb): void {
  gameOverCb = cb;
}

export function start(seed: number): void {
  const screen = document.getElementById('screen') as HTMLCanvasElement;
  const renderer = createRenderer(screen);
  renderer.resize();
  window.addEventListener('resize', () => renderer.resize());

  const input = createInput();
  input.attach(window);

  const audio = createAudio();
  // Unlock retries on every keydown (autoplay policy quirks) — must run in
  // the gesture handler, not the polled update.
  window.addEventListener('keydown', () => audio.unlock());
  // Safari does not grant user-activation for keyboard events — only
  // pointer/touch gestures can unlock an AudioContext there. Keep both.
  window.addEventListener('pointerdown', () => audio.unlock());

  const sequencer = createSequencer(audio);
  const water = createWaterTilemap();
  const terrain = createTerrainLayer(seed);
  const scenes = createSceneManager();

  // Each run draws a fresh stream so a full replay of the level is
  // deterministic from the boot seed.
  let runIndex = 0;
  const makeRng = (): (() => number) => mulberry32((seed ^ (runIndex++ * 0x9e3779b9)) >>> 0);

  const top = createTopScene({
    input, audio, sequencer, camera: renderer.camera, water, makeRng,
    onExit: (score, salvage) => {
      gameOverCb(score, salvage);
      scenes.switchTo(title);
    },
    // Abandoning a run bails to the title screen with no score submission
    // (no gameOverCb call — a forfeited run banks nothing) and flashes the
    // forfeit message once the title re-enters.
    onAbandon: () => {
      title.notifyForfeit();
      scenes.switchTo(title);
    },
  });
  // Dev screens (F1 sandbox / F2 explorer) load only in the dev server; the
  // dynamic import keeps src/game/dev/ out of the production bundle.
  let devTools: import('./dev').DevTools | undefined;
  const title = createTitleScene({
    input, audio, sequencer, water, terrain, seed,
    onStart: () => scenes.switchTo(top),
    dev: import.meta.env.DEV
      ? { poll: () => devTools?.poll() ?? null, open: (s) => devTools?.open(s) }
      : undefined,
  });
  if (import.meta.env.DEV) {
    void import('./dev').then((m) => {
      devTools = m.createDevTools({
        input, audio, sequencer, camera: renderer.camera, water, makeRng,
        switchTo: (s) => scenes.switchTo(s),
        toTitle: () => scenes.switchTo(title),
      });
    });
  }
  scenes.switchTo(title);

  const loop = createLoop(
    (dt) => scenes.update(dt),
    () => {
      scenes.draw(renderer.ctx);
      renderer.present();
    },
  );
  const frame = (now: number): void => {
    loop.frame(now);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
