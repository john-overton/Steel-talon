// Player chopper, top-down, 32x32, two rotor frames. Palette chars:
// c = olive, d = dark olive (fuselage deck), g = dark blue / j = cyan
// (canopy glass), m = gunmetal, p = dark gray (weapon pods), 1 = dark,
// o = gray (rotor blur). Indices into PALETTE (base-32 digits).
import { parseGrid, type PixelGrid } from '../../engine/sprite';
import { PALETTE } from '../palette';

const BODY = [
  '...............cc...............',
  '..............cccc..............',
  '.............cccccc.............',
  '.............cggggc.............',
  '............cgjjjjgc............',
  '............cgjjjjgc............',
  '............cggggggc............',
  '...........ccggggggcc...........',
  '...........cccccccccc...........',
  '..........ccddddddddcc..........',
  '..........ccddddddddcc..........',
  '.........ccddddddddddcc.........',
  'mmmmmmmmmccddddddddddccmmmmmmmmm',
  '...pp....ccddddddddddcc....pp...',
  '...11....ccddddddddddcc....11...',
  '..........ccddddddddcc..........',
  '..........ccdd1mm1ddcc..........',
  '..........ccdd1mm1ddcc..........',
  '..........ccddddddddcc..........',
  '...........ccddddddcc...........',
  '............ccddddcc............',
  '.............ccddcc.............',
  '..............cccc..............',
  '..............cccc..............',
  '..............cccc..............',
  '..............cccc..............',
  '..............cccc..............',
  '.........mmmmmccccmmmmm.........',
  '..............cccc..............',
  '..............cccc..............',
  '............mm1cc1mm............',
  '..............1cc1..............',
];

// Rotor hub sits at rows 16-17, cols 15-16. The two frames alternate the
// blur between a + (0°/90°) and an x (45°) so the rotor reads as spinning
// in the top-down plane rather than flapping.
const PLUS: Array<[number, number]> = [];
const CROSS: Array<[number, number]> = [];
for (let d = 1; d <= 14; d++) {
  PLUS.push([16, 15 - d], [16, 16 + d], [17, 15 - d], [17, 16 + d]);
}
for (let d = 1; d <= 13; d++) {
  PLUS.push([16 - d, 15], [16 - d, 16], [17 + d, 15], [17 + d, 16]);
}
for (let d = 1; d <= 10; d++) {
  CROSS.push([16 - d, 15 - d], [16 - d, 16 + d], [17 + d, 15 - d], [17 + d, 16 + d]);
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
