// Player chopper, top-down, two rotor frames. m = gunmetal, c = olive,
// 1 = dark, o = gray (rotor blur). Indices into PALETTE (base-32 digits).
import { parseGrid, type PixelGrid } from '../../engine/sprite';
import { PALETTE } from '../palette';

const BODY_A = [
  '.......mm.......',
  'oooooooommoooooo',
  '.......mm.......',
  '......cccc......',
  '.....cccccc.....',
  '....ccmccmcc....',
  '....cccccccc....',
  '.....cccccc.....',
  '......cccc......',
  '......1cc1......',
  '.......cc.......',
  '.......cc.......',
  '......m11m......',
  '.......11.......',
];

const BODY_B = BODY_A.map((row, y) =>
  y === 1 ? '...oooooooooo...' : row,
);

export const CHOPPER_FRAMES: PixelGrid[] = [
  parseGrid(BODY_A, PALETTE),
  parseGrid(BODY_B, PALETTE),
];
