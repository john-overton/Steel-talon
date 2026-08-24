// Caribbean water: three 16x16 variants (calm, light chop, foam fleck),
// two shimmer frames each. Rows are generated from sparkle coordinates so
// every row is exactly 16 chars by construction. Palette: g deep blue,
// h/i highlights, l white foam.
import { parseGrid, rasterize, type PixelGrid } from '../../engine/sprite';
import type { Tilemap } from '../../engine/tilemap';
import { PALETTE } from '../palette';

export const WATER_FRAME_TICKS = 30;

const SIZE = 16;

// [x, y, paletteChar] sparkles over a solid deep-blue base.
type Fleck = [number, number, string];

function tile(flecks: Fleck[]): PixelGrid {
  const rows = Array.from({ length: SIZE }, () => new Array<string>(SIZE).fill('g'));
  for (const [x, y, ch] of flecks) rows[y][x] = ch;
  return parseGrid(rows.map((r) => r.join('')), PALETTE);
}

const CALM_A: Fleck[] = [[5, 2, 'h'], [10, 5, 'h'], [2, 9, 'h'], [13, 13, 'h']];
const CALM_B: Fleck[] = [[5, 3, 'h'], [10, 6, 'h'], [2, 10, 'h'], [13, 14, 'h']];
const CHOP_A: Fleck[] = [
  [4, 1, 'h'], [5, 1, 'h'], [10, 3, 'i'], [11, 3, 'h'], [12, 3, 'h'],
  [2, 5, 'h'], [3, 5, 'h'], [4, 5, 'i'], [7, 8, 'h'], [8, 8, 'h'],
  [1, 11, 'i'], [2, 11, 'h'], [11, 13, 'i'], [12, 13, 'h'],
];
const CHOP_B: Fleck[] = [
  [4, 2, 'i'], [5, 2, 'h'], [11, 4, 'h'], [12, 4, 'h'], [13, 4, 'i'],
  [2, 6, 'h'], [3, 6, 'h'], [4, 6, 'i'], [7, 9, 'i'], [8, 9, 'h'], [9, 9, 'h'],
  [2, 12, 'i'], [3, 12, 'h'], [12, 14, 'i'], [13, 14, 'h'],
];
const FOAM_A: Fleck[] = [
  [5, 2, 'l'], [6, 2, 'l'], [7, 2, 'i'], [4, 3, 'i'], [5, 3, 'l'],
  [10, 6, 'l'], [11, 6, 'l'], [9, 7, 'i'], [10, 7, 'l'], [11, 7, 'l'], [12, 7, 'i'],
  [2, 10, 'l'], [13, 13, 'l'],
];
const FOAM_B: Fleck[] = [
  [6, 2, 'l'], [7, 2, 'i'], [5, 3, 'i'], [6, 3, 'l'],
  [11, 6, 'l'], [12, 6, 'l'], [10, 7, 'i'], [11, 7, 'l'], [12, 7, 'l'],
  [4, 10, 'l'], [12, 13, 'l'],
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
    tileSize: 16,
    tiles: WATER_TILES.map(rasterize),
    pickTile: pickWaterTile,
  };
}
