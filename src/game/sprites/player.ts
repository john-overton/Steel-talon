// Player chopper, top-down, two rotor frames. m = gunmetal, c = olive,
// 1 = dark, o = gray (rotor blur). Indices into PALETTE (base-32 digits).
import { parseGrid, type PixelGrid } from '../../engine/sprite';
import { PALETTE } from '../palette';

const BODY = [
  '.......cc.......',
  '......cccc......',
  '......c11c......',
  '......c11c......',
  '.....cccccc.....',
  '.mmmmccccccmmmm.',
  '...1.cccccc.1...',
  '.....ccmmcc.....',
  '.....cccccc.....',
  '......cccc......',
  '.......cc.......',
  '.......cc.......',
  '.......cc.......',
  '....mmm11mmm....',
  '.......cc.......',
  '......m11m......',
];

// Rotor hub sits at row 7, cols 7-8. The two frames alternate the blur
// between a + (0°/90°) and an x (45°) so the rotor reads as spinning
// in the top-down plane rather than flapping.
const PLUS: Array<[number, number]> = [];
const CROSS: Array<[number, number]> = [];
for (let d = 1; d <= 7; d++) PLUS.push([7, 7 - d], [7, 8 + d]);
for (let d = 1; d <= 6; d++) {
  PLUS.push([7 - d, 7], [7 - d, 8], [7 + d, 7], [7 + d, 8]);
  CROSS.push([7 - d, 7 - d], [7 - d, 8 + d], [7 + d, 7 - d], [7 + d, 8 + d]);
}

function withRotor(blades: Array<[number, number]>): string[] {
  const grid = BODY.map((row) => row.split(''));
  for (const [y, x] of blades) grid[y][x] = 'o';
  return grid.map((row) => row.join(''));
}

export const CHOPPER_FRAMES: PixelGrid[] = [
  parseGrid(withRotor(PLUS), PALETTE),
  parseGrid(withRotor(CROSS), PALETTE),
];
