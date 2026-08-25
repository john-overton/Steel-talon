// Attract-mode title screen: scrolling water backdrop, drifting seeded
// archipelago, a lissajous chopper flyover (drawn nose-up, banking via pose
// frames rather than canvas rotation), blinking "INSERT COIN" prompt,
// and a two-press flow (first key starts the theme, next key hands off to
// the run). Engine spec §8.
import type { AudioSystem } from '../../engine/audio';
import type { InputSource } from '../../engine/input';
import { HEIGHT, WIDTH } from '../../engine/renderer';
import type { Scene } from '../../engine/scene';
import type { Sequencer } from '../../engine/sequencer';
import { drawLayered, prepareLayered, type PreparedLayered } from '../../engine/sprite';
import { drawTilemap, type Tilemap } from '../../engine/tilemap';
import { PALETTE } from '../palette';
import { poseFrameIndex, poseFromVelocity } from '../pose';
import { createChopper, LAYER } from '../sprites/player';
import { WATER_FRAME_TICKS } from '../sprites/tiles';
import type { TerrainLayer } from '../terrain';
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
  terrain: TerrainLayer;
  seed: number;
  onStart(): void;
  dev?: TitleDevHook;
}

const FORFEIT_TICKS = 240; // 4 s at 60 Hz
const FORFEIT_BLINK = 20;  // ticks per blink phase

// Camera world position at a tick: slow incommensurate drift (the two sine
// periods and the linear terms share no common factor) so the flyover
// crosses a fresh stretch of archipelago every pass and never visibly loops.
// Amplitude tuned down from the spec's 1400 to 650: at the spec value the
// sine terms' instantaneous slope can momentarily add to the linear drift
// and exceed a believable "slow flyover" speed (attractCamera(60) -
// attractCamera(0) landed at ~85 px/s, above the intended cap). 650 keeps
// the same incommensurate frequencies/phases (so the path still never
// closes) while holding drift speed comfortably in a slow, readable range.
const CAM_AMP = 650;

// Pose thresholds in px/tick (0.25 = 15 px/s, 0.75 = 45 px/s): the attract
// path's per-tick analytic velocity feeds poseFromVelocity directly.
export const TITLE_POSE_SLOW = 0.25;
export const TITLE_POSE_FAST = 0.75;

export function attractCamera(t: number): { x: number; y: number } {
  return {
    x: 2500 + t * 0.35 + CAM_AMP * Math.sin(t * 0.00073),
    y: 2500 + t * 0.28 + CAM_AMP * Math.sin(t * 0.00101 + 2),
  };
}

// Chopper position/velocity in SCREEN coords at a tick: a lissajous path kept
// well inside the 640x480 frame. The sprite draws nose-up; the analytic
// per-tick velocity picks a pose frame, so banking conveys the motion.
export function attractChopper(t: number): { x: number; y: number; vx: number; vy: number } {
  const x = 320 + 190 * Math.sin(t * 0.006);
  const y = 260 + 120 * Math.sin(t * 0.0043 + 1.3);
  const vx = 190 * 0.006 * Math.cos(t * 0.006);
  const vy = 120 * 0.0043 * Math.cos(t * 0.0043 + 1.3);
  return { x, y, vx, vy };
}

// Dark backing behind a text block so it reads over the flyover without a
// full-screen dim. Resets fillStyle/globalAlpha are the caller's job.
function textBacking(ctx: CanvasRenderingContext2D, cx: number, top: number, w: number, h: number): void {
  ctx.globalAlpha = 0.45;
  ctx.fillStyle = '#000000';
  ctx.fillRect(cx - w / 2, top, w, h);
  ctx.globalAlpha = 1;
}

export function createTitleScene(deps: TitleDeps): Scene & { notifyForfeit(): void; debugForfeitTicks(): number } {
  let ticks = 0;
  let started = false;
  let forfeitPending = false;
  let forfeitTicks = 0;

  const chopper = createChopper();
  let prepared: PreparedLayered | null = null;

  return {
    enter() {
      ticks = 0;
      started = false;
      forfeitTicks = forfeitPending ? FORFEIT_TICKS : 0;
      forfeitPending = false;
      // Drain any stale anyKey latch (e.g. the key that ended the previous
      // run) so the first update() here doesn't auto-advance the flow.
      deps.input.consumeAnyKey();
      // Reset layer visibility/frame state (mirrors top.ts's enter()) —
      // no weapon flash or missiles on the title screen chopper.
      chopper.layers[LAYER.FLASH_L].visible = false;
      chopper.layers[LAYER.FLASH_R].visible = false;
      chopper.layers[LAYER.FLASH_NOSE].visible = false;
      chopper.layers[LAYER.MISSILE_L].visible = false;
      chopper.layers[LAYER.MISSILE_R].visible = false;
      chopper.layers[LAYER.ROTOR].frame = 0;
      // Audio context may not exist yet; unlock is wired globally elsewhere.
    },
    update(_dt) {
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
      chopper.layers[LAYER.ROTOR].frame = Math.floor(ticks / 4) % 2;
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
      if (!prepared) prepared = prepareLayered(chopper);

      const cam = attractCamera(ticks);
      drawTilemap(
        ctx,
        deps.water,
        cam.x % deps.water.tileSize,
        cam.y % deps.water.tileSize,
        WIDTH,
        HEIGHT,
        Math.floor(ticks / WATER_FRAME_TICKS),
      );
      deps.terrain.draw(ctx, cam.x, cam.y, ticks);

      const p = attractChopper(ticks);
      ctx.globalAlpha = 0.3;
      ctx.fillStyle = '#000000';
      ctx.beginPath();
      ctx.ellipse(p.x + 10, p.y + 14, 12, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;

      const bank = poseFromVelocity(p.vx, p.vy, TITLE_POSE_SLOW, TITLE_POSE_FAST);
      chopper.layers[LAYER.BODY].frame = poseFrameIndex(bank.dir, bank.intensity);
      drawLayered(ctx, prepared, p.x, p.y);

      ctx.textAlign = 'center';

      textBacking(ctx, WIDTH / 2, 120, 360, 80);
      ctx.font = '48px monospace';
      ctx.fillStyle = PALETTE[8];
      ctx.fillText('STEEL TALON', WIDTH / 2, 160);

      ctx.font = '16px monospace';
      ctx.fillStyle = PALETTE[5];
      ctx.fillText('OPERATION GREENFIRE', WIDTH / 2, 190);

      if (Math.floor(ticks / 60) % 2 === 0) {
        textBacking(ctx, WIDTH / 2, 288, 320, 20);
        ctx.font = '14px monospace';
        ctx.fillStyle = PALETTE[21];
        ctx.fillText('INSERT COIN — PRESS ANY KEY', WIDTH / 2, 300);
      }

      if (forfeitTicks > 0 && Math.floor(forfeitTicks / FORFEIT_BLINK) % 2 === 0) {
        textBacking(ctx, WIDTH / 2, HEIGHT - 108, 460, 20);
        ctx.font = '14px monospace';
        ctx.fillStyle = PALETTE[27];
        ctx.fillText('CREDIT FORFEITED — GOOD PILOTS FINISH THE MISSION.', WIDTH / 2, HEIGHT - 96);
      }

      if (deps.dev) {
        textBacking(ctx, WIDTH / 2, 418, 220, 20);
        ctx.font = '10px monospace';
        ctx.fillStyle = PALETTE[22];
        ctx.fillText('F1 SANDBOX · F2 EXPLORER', WIDTH / 2, 430);
      }

      textBacking(ctx, WIDTH / 2, 448, 160, 20);
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
