// Heads-up display: score, hp pips, lives, salvage, and the four-slot weapon
// panel. Pure helpers (formatScore, slotView, LIVES_ICON) are headless; only
// createHud touches the DOM, rasterizing the lives glyph once at boot.
// draw() allocates no objects or arrays per frame.
import { HEIGHT, WIDTH } from '../engine/renderer';
import { parseGrid, rasterize, type SpriteDef } from '../engine/sprite';
import { PALETTE } from './palette';
import { ownsSlot, type RunState, type WeaponSlot } from './run';
import { ROCKET_COOLDOWN } from './weapons';

const SCORE_DIGITS = 6;
const SCORE_MAX = 999999;

export function formatScore(n: number): string {
  const clamped = Math.max(0, Math.min(SCORE_MAX, Math.floor(n)));
  return String(clamped).padStart(SCORE_DIGITS, '0');
}

export interface SlotView {
  owned: boolean;
  selected: boolean;
  label: string; // '1'..'4'
}

export function slotView(r: RunState, slot: WeaponSlot): SlotView {
  return { owned: ownsSlot(r, slot), selected: r.selected === slot, label: String(slot) };
}

// 16x16 mini-chopper seen from above: olive fuselage with a dark outline,
// gray main rotor (forward blade arm plus the full-width bar through the
// hub) and a gray tail rotor.
export const LIVES_ICON: SpriteDef = {
  frames: [parseGrid([
    '.......oo.......',
    '.......oo.......',
    '......1cc1......',
    '.....1cccc1.....',
    '.....1cccc1.....',
    '....1cccccc1....',
    'oooo1ccoocc1oooo',
    'oooo1ccoocc1oooo',
    '....1cccccc1....',
    '.....1cccc1.....',
    '......1cc1......',
    '......1cc1......',
    '.......cc.......',
    '.......cc.......',
    '.....oo11oo.....',
    '................',
  ], PALETTE)],
  anchors: { center: [8, 8] },
};

// Layout constants (640x480 buffer).
const TEXT_FONT = '10px monospace';
const SMALL_FONT = '8px monospace';
const SCORE_X = 4;
const SCORE_Y = 12;
const PIP_Y = 18;
const PIP_SIZE = 6;
const PIP_X0 = 4;
const PIP_STEP = 8;
// Lives sit centered along the top: 16px icons on a 22px pitch, so three
// span 60px around the buffer midline, clear of the score and salvage text.
const LIVES_Y = 4;
const LIVES_X0 = WIDTH / 2 - 33;
const LIVES_STEP = 22;
const SALVAGE_X = WIDTH - 4;
const PANEL_Y = HEIGHT - 30;
const BOX_X0 = 4;
const BOX_STEP = 26;
const BOX_SIZE = 22;
const BAR_H = 3;

const COLOR_TEXT = PALETTE[22];
const COLOR_HP = PALETTE[9];
const COLOR_EMPTY = PALETTE[25];
const COLOR_BOX = PALETTE[1];
const COLOR_SELECTED = PALETTE[8];
const COLOR_OWNED = PALETTE[23];
const COLOR_BAR = PALETTE[5];

export interface Hud {
  draw(ctx: CanvasRenderingContext2D, run: RunState): void;
}

export function createHud(): Hud {
  const livesCanvas = rasterize(LIVES_ICON.frames[0]);

  return {
    draw(ctx, run) {
      ctx.font = TEXT_FONT;

      // Score.
      ctx.fillStyle = COLOR_TEXT;
      ctx.fillText(formatScore(run.score), SCORE_X, SCORE_Y);

      // HP pips: dark square, overpainted green while hp covers it.
      for (let i = 0; i < 3; i++) {
        const x = PIP_X0 + i * PIP_STEP;
        ctx.fillStyle = i < run.hp ? COLOR_HP : COLOR_EMPTY;
        ctx.fillRect(x, PIP_Y, PIP_SIZE, PIP_SIZE);
      }

      // Lives icons, centered.
      for (let i = 0; i < run.lives; i++) {
        ctx.drawImage(livesCanvas, LIVES_X0 + i * LIVES_STEP, LIVES_Y);
      }

      // Salvage, right-aligned.
      ctx.textAlign = 'right';
      ctx.fillStyle = COLOR_TEXT;
      ctx.fillText(`SALVAGE x${run.salvage}`, SALVAGE_X, SCORE_Y);
      ctx.textAlign = 'left';

      // Weapon panel.
      for (let i = 0; i < 4; i++) {
        const slot = (i + 1) as WeaponSlot;
        const owned = ownsSlot(run, slot);
        const selected = run.selected === slot;
        const x = BOX_X0 + i * BOX_STEP;

        ctx.fillStyle = COLOR_BOX;
        ctx.fillRect(x, PANEL_Y, BOX_SIZE, BOX_SIZE);
        ctx.strokeStyle = selected ? COLOR_SELECTED : owned ? COLOR_OWNED : COLOR_EMPTY;
        ctx.strokeRect(x + 0.5, PANEL_Y + 0.5, BOX_SIZE - 1, BOX_SIZE - 1);

        ctx.fillStyle = owned ? COLOR_TEXT : COLOR_EMPTY;
        ctx.textAlign = 'center';
        ctx.fillText(String(slot), x + BOX_SIZE / 2, PANEL_Y + 15);
        ctx.textAlign = 'left';

        if (slot === 3) {
          const ready = 1 - run.rocketCooldown / ROCKET_COOLDOWN;
          const w = BOX_SIZE * Math.max(0, Math.min(1, ready));
          ctx.fillStyle = COLOR_BAR;
          ctx.fillRect(x, PANEL_Y + BOX_SIZE + 1, w, BAR_H);
        } else if (slot === 4) {
          ctx.font = SMALL_FONT;
          ctx.fillStyle = owned ? COLOR_TEXT : COLOR_EMPTY;
          ctx.fillText(`x${run.missileAmmo}`, x + BOX_SIZE + 2, PANEL_Y + 15);
          ctx.font = TEXT_FONT;
        }
      }
    },
  };
}
