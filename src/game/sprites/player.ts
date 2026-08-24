// Player chopper, top-down, two rotor frames. m = gunmetal, c = olive,
// 1 = dark, o = gray (rotor blur). Indices into PALETTE (base-32 digits).
import { parseGrid, type PixelGrid } from '../../engine/sprite';
import { PALETTE } from '../palette';

const BODY_A = [
  '.......cc.......',
  '......cccc......',
  '......c11c......',
  '......c11c......',
  '.....cccccc.....',
  '.mmmmccccccmmmm.',
  '...1.cccccc.1...',
  'ooooooommooooooo',
  '.....cccccc.....',
  '......cccc......',
  '.......cc.......',
  '.......cc.......',
  '.......cc.......',
  '....mmm11mmm....',
  '.......cc.......',
  '......m11m......',
];

const BODY_B = BODY_A.map((row, y) =>
  y === 7 ? '...oooommoooo...' : row,
);

export const CHOPPER_FRAMES: PixelGrid[] = [
  parseGrid(BODY_A, PALETTE),
  parseGrid(BODY_B, PALETTE),
];
