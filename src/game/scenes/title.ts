// Attract-mode title screen: scrolling water backdrop, blinking "INSERT
// COIN" prompt, and a two-press flow (first key starts the theme, next
// key hands off to the run). Engine spec §8.
import type { AudioSystem } from '../../engine/audio';
import type { InputSource } from '../../engine/input';
import { HEIGHT, WIDTH } from '../../engine/renderer';
import type { Scene } from '../../engine/scene';
import type { Sequencer } from '../../engine/sequencer';
import { drawTilemap, type Tilemap } from '../../engine/tilemap';
import { PALETTE } from '../palette';
import { WATER_FRAME_TICKS } from '../sprites/tiles';
import { TITLE_SONG } from '../songs/title';

export interface TitleDeps {
  input: InputSource;
  audio: AudioSystem;
  sequencer: Sequencer;
  water: Tilemap;
  seed: number;
  onStart(): void;
}

export function createTitleScene(deps: TitleDeps): Scene {
  let ticks = 0;
  let started = false;
  let bgY = 0;

  return {
    enter() {
      ticks = 0;
      started = false;
      bgY = 0;
      // Drain any stale anyKey latch (e.g. the key that ended the previous
      // run) so the first update() here doesn't auto-advance the flow.
      deps.input.consumeAnyKey();
      // Audio context may not exist yet; unlock is wired globally elsewhere.
    },
    update(dt) {
      ticks++;
      bgY += 20 * dt;
      if (deps.input.consumeAnyKey()) {
        if (!started) {
          started = true;
          deps.sequencer.play(TITLE_SONG);
        } else {
          deps.sequencer.stop();
          deps.onStart();
        }
      }
    },
    draw(ctx) {
      drawTilemap(ctx, deps.water, 0, bgY % deps.water.tileSize, WIDTH, HEIGHT, Math.floor(ticks / WATER_FRAME_TICKS));

      ctx.globalAlpha = 0.55;
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
      ctx.globalAlpha = 1;

      ctx.textAlign = 'center';

      ctx.font = '48px monospace';
      ctx.fillStyle = PALETTE[8];
      ctx.fillText('STEEL TALON', WIDTH / 2, 160);

      ctx.font = '16px monospace';
      ctx.fillStyle = PALETTE[5];
      ctx.fillText('OPERATION GREENFIRE', WIDTH / 2, 190);

      if (Math.floor(ticks / 60) % 2 === 0) {
        ctx.font = '14px monospace';
        ctx.fillStyle = PALETTE[21];
        ctx.fillText('INSERT COIN — PRESS ANY KEY', WIDTH / 2, 300);
      }

      ctx.font = '10px monospace';
      ctx.fillStyle = PALETTE[22];
      ctx.fillText(`SEED ${deps.seed.toString(16).toUpperCase()}`, WIDTH / 2, 460);

      ctx.textAlign = 'left';
    },
  };
}
