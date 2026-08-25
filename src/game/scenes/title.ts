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

// Dev-only entry points (F1/F2). Supplied only under import.meta.env.DEV, so
// the hint line and the dev screens are absent from prod builds.
export interface TitleDevHook {
  poll(): 'sandbox' | 'explorer' | null;
  open(screen: 'sandbox' | 'explorer'): void;
}

export interface TitleDeps {
  input: InputSource;
  audio: AudioSystem;
  sequencer: Sequencer;
  water: Tilemap;
  seed: number;
  onStart(): void;
  dev?: TitleDevHook;
}

const FORFEIT_TICKS = 240; // 4 s at 60 Hz
const FORFEIT_BLINK = 20;  // ticks per blink phase

export function createTitleScene(deps: TitleDeps): Scene & { notifyForfeit(): void; debugForfeitTicks(): number } {
  let ticks = 0;
  let started = false;
  let bgY = 0;
  let forfeitPending = false;
  let forfeitTicks = 0;

  return {
    enter() {
      ticks = 0;
      started = false;
      bgY = 0;
      forfeitTicks = forfeitPending ? FORFEIT_TICKS : 0;
      forfeitPending = false;
      // Drain any stale anyKey latch (e.g. the key that ended the previous
      // run) so the first update() here doesn't auto-advance the flow.
      deps.input.consumeAnyKey();
      // Audio context may not exist yet; unlock is wired globally elsewhere.
    },
    update(dt) {
      // F1/F2 also latch the input's anyKey; the early return keeps this tick
      // from consuming it, and enter() drains stale latches on the way back.
      const pick = deps.dev?.poll();
      if (pick) {
        if (started) deps.sequencer.stop();
        started = false;
        deps.dev?.open(pick);
        return;
      }
      ticks++;
      bgY += 20 * dt;
      if (forfeitTicks > 0) forfeitTicks--;
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

      if (forfeitTicks > 0 && Math.floor(forfeitTicks / FORFEIT_BLINK) % 2 === 0) {
        ctx.font = '14px monospace';
        ctx.fillStyle = PALETTE[27];
        ctx.fillText('CREDIT FORFEITED — GOOD PILOTS FINISH THE MISSION.', WIDTH / 2, HEIGHT - 96);
      }

      if (deps.dev) {
        ctx.font = '10px monospace';
        ctx.fillStyle = PALETTE[22];
        ctx.fillText('F1 SANDBOX · F2 EXPLORER', WIDTH / 2, 430);
      }

      ctx.font = '10px monospace';
      ctx.fillStyle = PALETTE[22];
      ctx.fillText(`SEED ${deps.seed.toString(16).toUpperCase()}`, WIDTH / 2, 460);

      ctx.textAlign = 'left';
    },
    notifyForfeit() {
      forfeitPending = true;
    },
    debugForfeitTicks() {
      return forfeitTicks;
    },
  };
}
