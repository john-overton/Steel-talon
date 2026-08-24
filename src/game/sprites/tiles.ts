// Caribbean water: three 32x32 variants (calm, light chop, foam fleck),
// two shimmer frames each. Rows are generated from sparkle coordinates so
// every row is exactly 32 chars by construction. Palette: g deep blue,
// h/i highlights, l white foam.
import { parseGrid, rasterize, type PixelGrid } from '../../engine/sprite';
import type { Tilemap } from '../../engine/tilemap';
import { PALETTE } from '../palette';

export const WATER_FRAME_TICKS = 30;

const SIZE = 32;

// [x, y, paletteChar] sparkles over a solid deep-blue base.
type Fleck = [number, number, string];

function tile(flecks: Fleck[]): PixelGrid {
  const rows = Array.from({ length: SIZE }, () => new Array<string>(SIZE).fill('g'));
  for (const [x, y, ch] of flecks) rows[y][x] = ch;
  return parseGrid(rows.map((r) => r.join('')), PALETTE);
}

// Horizontal chop streak: `len` pixels of `ch` starting at (x, y).
function dash(x: number, y: number, len: number, ch: string): Fleck[] {
  return Array.from({ length: len }, (_, i): Fleck => [x + i, y, ch]);
}

// Two-row foam crest: a bright white core feathered with 'i' at the ends.
function crest(x: number, y: number): Fleck[] {
  return [
    [x, y, 'i'], [x + 1, y, 'l'], [x + 2, y, 'l'], [x + 3, y, 'l'], [x + 4, y, 'i'],
    [x - 1, y + 1, 'i'], [x, y + 1, 'l'], [x + 1, y + 1, 'l'],
    [x + 2, y + 1, 'l'], [x + 3, y + 1, 'i'],
  ];
}

const CALM_A: Fleck[] = [
  [3, 2, 'h'], [11, 1, 'i'], [21, 4, 'h'], [28, 3, 'h'],
  [7, 8, 'i'], [16, 6, 'h'], [25, 10, 'h'], [1, 12, 'h'],
  [12, 14, 'i'], [20, 16, 'h'], [29, 15, 'h'], [5, 19, 'h'],
  [15, 22, 'i'], [24, 24, 'h'], [9, 27, 'h'], [19, 29, 'h'],
];
const CALM_B: Fleck[] = [
  [4, 3, 'h'], [11, 2, 'h'], [22, 5, 'i'], [28, 5, 'h'],
  [6, 9, 'h'], [17, 7, 'i'], [26, 11, 'h'], [2, 13, 'i'],
  [13, 15, 'h'], [19, 18, 'h'], [30, 16, 'i'], [4, 20, 'h'],
  [16, 23, 'h'], [23, 25, 'i'], [10, 28, 'h'], [20, 30, 'h'],
];

const CHOP_A: Fleck[] = [
  ...dash(2, 2, 3, 'h'), ...dash(13, 1, 4, 'i'), ...dash(24, 3, 3, 'h'),
  ...dash(6, 7, 4, 'h'), ...dash(17, 6, 3, 'i'), ...dash(27, 8, 4, 'h'),
  ...dash(1, 12, 3, 'i'), ...dash(11, 13, 4, 'h'), ...dash(21, 11, 3, 'h'),
  ...dash(5, 17, 4, 'h'), ...dash(15, 18, 3, 'h'), ...dash(26, 16, 4, 'i'),
  ...dash(2, 22, 3, 'h'), ...dash(12, 21, 4, 'i'), ...dash(23, 23, 3, 'h'),
  ...dash(7, 27, 4, 'h'), ...dash(18, 28, 3, 'i'), ...dash(27, 26, 4, 'h'),
];
const CHOP_B: Fleck[] = [
  ...dash(4, 3, 3, 'i'), ...dash(14, 2, 4, 'h'), ...dash(25, 4, 3, 'h'),
  ...dash(8, 8, 4, 'h'), ...dash(18, 7, 3, 'h'), ...dash(27, 9, 4, 'i'),
  ...dash(3, 13, 3, 'h'), ...dash(13, 14, 4, 'i'), ...dash(23, 12, 3, 'h'),
  ...dash(7, 18, 4, 'i'), ...dash(17, 19, 3, 'h'), ...dash(27, 17, 4, 'h'),
  ...dash(4, 23, 3, 'i'), ...dash(14, 22, 4, 'h'), ...dash(25, 24, 3, 'h'),
  ...dash(9, 28, 4, 'h'), ...dash(20, 29, 3, 'h'), ...dash(29, 27, 3, 'i'),
];

const FOAM_A: Fleck[] = [
  ...crest(5, 3), ...crest(19, 8), ...crest(9, 17), ...crest(23, 24),
  [28, 2, 'l'], [12, 7, 'i'], [2, 12, 'i'], [16, 13, 'l'],
  [26, 14, 'i'], [29, 19, 'l'], [3, 26, 'l'], [17, 30, 'i'],
];
const FOAM_B: Fleck[] = [
  ...crest(7, 2), ...crest(17, 9), ...crest(11, 18), ...crest(21, 25),
  [26, 5, 'l'], [3, 8, 'i'], [29, 12, 'i'], [14, 14, 'l'],
  [23, 16, 'i'], [2, 21, 'l'], [6, 29, 'l'], [28, 30, 'i'],
];

export const WATER_TILES: PixelGrid[] = [
  tile(CALM_A), tile(CALM_B),
  tile(CHOP_A), tile(CHOP_B),
  tile(FOAM_A), tile(FOAM_B),
];

// Small integer hash of the cell -> stable variant choice.
function cellHash(col: number, row: number): number {
  let h = (col * 374761393 + row * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

export function pickWaterTile(col: number, row: number, frame: number): number {
  const r = cellHash(col, row) % 100;
  const variant = r < 80 ? 0 : r < 95 ? 1 : 2;
  return variant * 2 + (frame % 2);
}

export function createWaterTilemap(): Tilemap {
  return {
    tileSize: SIZE,
    tiles: WATER_TILES.map(rasterize),
    pickTile: pickWaterTile,
  };
}
