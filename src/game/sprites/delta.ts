// Delta-wing target drone: flies down-screen (nose at the bottom edge),
// bright orange training livery over gray, cyan canopy glint. The jet
// flicker layer sits at the trailing (top) edge on the tail anchor.
// Palette: 5 orange skin, p/m grays, j cyan canopy, 1 dark nose, 8 jet core.
import { parseGrid, type LayeredSprite, type SpriteDef } from '../../engine/sprite';
import { PALETTE } from '../palette';

// 24x16: full-width trailing edge at the top, swept leading edges narrowing
// to a two-pixel nose at the bottom. Every row is exactly 24 chars.
const BODY_ROWS = [
  'p55555555mppppm55555555p',
  '.p5555555pmmmmp5555555p.',
  '..p555555pmmmmp555555p..',
  '..p555555pmmmmp555555p..',
  '...p55555pmmmmp55555p...',
  '....p5555pmmmmp5555p....',
  '.....p555pmmmmp555p.....',
  '.....p555pmmmmp555p.....',
  '......p55pmmmmp55p......',
  '.......p55pjjp55p.......',
  '........p5pjjp5p........',
  '........p5pjjp5p........',
  '.........p5115p.........',
  '..........p11p..........',
  '..........p11p..........',
  '...........pp...........',
];

export const DELTA_BODY: SpriteDef = {
  frames: [parseGrid(BODY_ROWS, PALETTE)],
  // Rear centerline, on the engine housing at the trailing (top) edge.
  anchors: { tail: [11, 0] },
};

// 4x3 exhaust flicker: hottest at the housing (bottom row), trailing up and
// off the back of the drone. Two frames alternate for a cheap flame flicker.
export const DELTA_JET: SpriteDef = {
  frames: [
    parseGrid(['.5..', '.85.', '.88.'], PALETTE),
    parseGrid(['....', '.55.', '.88.'], PALETTE),
  ],
  anchors: { mount: [1, 0] },
};

export function createDelta(): LayeredSprite {
  return {
    layers: [
      { def: DELTA_BODY, frame: 0 },
      { def: DELTA_JET, frame: 0, attach: { to: 'tail', by: 'mount' } },
    ],
  };
}
