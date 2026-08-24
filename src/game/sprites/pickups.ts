// Pickups. Weapon pickups are chopper-sized (32x32) rotating badges with a
// pulsing glow ring — built programmatically from a 12x12 glyph rotated 90°
// per frame inside a circular ring that alternates yellow/white.
import { parseGrid, type PixelGrid, type SpriteDef } from '../../engine/sprite';
import { PALETTE } from '../palette';

export const PICKUP_FRAME_TICKS = 8;
export const SALVAGE_FRAME_TICKS = 15;

export function rotateGrid(rows: string[]): string[] {
  const h = rows.length;
  const w = rows[0]?.length ?? 0;
  const out: string[] = [];
  for (let x = 0; x < w; x++) {
    let row = '';
    for (let y = h - 1; y >= 0; y--) row += rows[y][x];
    out.push(row);
  }
  return out;
}

// Crossed gatling barrels, diagonal so rotation reads.
const MINIGUN_GLYPH = [
  'mm..........',
  'mmm.......1.',
  '.mmm.....11.',
  '..mmm...11..',
  '...mmm.11...',
  '....mm11....',
  '....11mm....',
  '...11.mmm...',
  '..11...mmm..',
  '.11.....mmm.',
  '.1.......mm.',
  '..........mm',
];

// Rocket pair angled up-right: white tips, gray bodies, orange flames.
const ROCKET_GLYPH = [
  '.......ll...',
  '......lml...',
  '.....mmm....',
  '....mmm.ll..',
  '...mmm.lml..',
  '..5mm.mmm...',
  '.55..mmm....',
  '.5..mmm.....',
  '...5mm......',
  '..55........',
  '..5.........',
  '............',
];

function weaponFrames(glyph: string[]): PixelGrid[] {
  const frames: PixelGrid[] = [];
  let g = glyph;
  for (let f = 0; f < 4; f++) {
    const ring = f % 2 === 0 ? '8' : 'l';
    const rows = Array.from({ length: 32 }, () => new Array<string>(32).fill('.'));
    for (let y = 0; y < 32; y++) {
      for (let x = 0; x < 32; x++) {
        if (Math.round(Math.hypot(x - 16, y - 16)) === 14) rows[y][x] = ring;
      }
    }
    g.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        if (row[x] !== '.') rows[y + 10][x + 10] = row[x];
      }
    });
    frames.push(parseGrid(rows.map((r) => r.join('')), PALETTE));
    g = rotateGrid(g);
  }
  return frames;
}

export const MINIGUN_PICKUP: SpriteDef = {
  frames: weaponFrames(MINIGUN_GLYPH),
  anchors: { center: [16, 16] },
};

export const ROCKET_PICKUP: SpriteDef = {
  frames: weaponFrames(ROCKET_GLYPH),
  anchors: { center: [16, 16] },
};

// Brass supply crate with dark straps and a cyan missile glyph.
export const CRATE: SpriteDef = {
  frames: [parseGrid([
    '666666666666',
    '611666666116',
    '616666666616',
    '666663366666',
    '66666j366666',
    '66666j366666',
    '666663366666',
    '616666666616',
    '611666666116',
    '666666666666',
  ], PALETTE)],
  anchors: { center: [6, 5] },
};

// Spinning salvage canister: gray drum with a brass band, two frames.
export const SALVAGE: SpriteDef = {
  frames: [
    parseGrid([
      '..mmmm..',
      '.m6666m.',
      'm666666m',
      'm611116m',
      'm611116m',
      'm666666m',
      '.m6666m.',
      '..mmmm..',
    ], PALETTE),
    parseGrid([
      '..pppp..',
      '.p6116p.',
      'p661166p',
      'p661166p',
      'p661166p',
      'p661166p',
      '.p6116p.',
      '..pppp..',
    ], PALETTE),
  ],
  anchors: { center: [4, 4] },
};
