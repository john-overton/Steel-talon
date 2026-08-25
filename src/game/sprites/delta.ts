// Delta-wing target drone: flies down-screen (nose at the bottom edge),
// orange training livery over a gray fuselage, with a framed canopy and a
// jet flicker layer on the tail anchor at the trailing (top) edge.
// Palette chars, dark to light: p = wingtip/fuselage outline and side
// shadow, 4 = wing root shadow, spar seam and trailing edge, 5 = main wing
// skin, 6 = upper-wing sheen, 7 = leading-edge highlight; o/n/m = fuselage
// grays (shadow, side, lit spine), 1 = exhaust nozzle, panel seams, canopy
// frame and nose tip, f = canopy glass with a k glint, k = wing chevrons;
// 5/8 = jet flame body and core. The body ships as 17 pose frames
// (buildPoseFrames): frame 0 the neutral airframe, the rest generated
// bank/pitch warps in poseFrameIndex() order. Anchors are shared.
import { parseGrid, type LayeredSprite, type SpriteDef } from '../../engine/sprite';
import { PALETTE } from '../palette';
import { buildPoseFrames } from './poses';

// 48x32. Full-width trailing edge at the top (row 0), leading edges sweeping
// in one column per row to a two-pixel nose at the bottom. Down the
// centreline: exhaust nozzle (rows 0-5), gray engine spine with panel seams
// (rows 6-12), the framed canopy with its glint (rows 13-21), and the nose
// taper (rows 22-31). Each wing carries a spar seam running parallel to the
// leading edge (rows 1-8) and a chevron marking pointing at the nose (rows
// 9-13). Mirror-symmetric about the seam between columns 23 and 24. Every
// row is exactly 48 chars.
const BODY_ROWS = [
  'p44444444444444444po11111111op44444444444444444p',
  '.p7665545555555544po11111111op4455555555455667p.',
  '..p766554555555544pon111111nop445555555455667p..',
  '..p766554555555544ponn1111nnop445555555455667p..',
  '...p76655455555544ponnn11nnnop44555555455667p...',
  '....p7665545555544ponnnnnnnnop4455555455667p....',
  '.....p766554555544ponmmmmmmnop445555455667p.....',
  '.....p766554555544ponmmmmmmnop445555455667p.....',
  '......p76655455544ponm1mm1mnop44555455667p......',
  '.......p7k6555554kponmmmmmmnopk4555556k7p.......',
  '........p7k65555k4ponmm11mmnop4k55556k7p........',
  '........p76k555k44ponmmmmmmnop44k555k67p........',
  '.........p76k5k544pon1mmmm1nop445k5k67p.........',
  '..........p76k5544ponn1111nnop4455k67p..........',
  '...........p766544pon1ffff1nop445667p...........',
  '...........p766544pon1fkff1nop445667p...........',
  '............p76644pon1ffff1nop44667p............',
  '.............p7644pon1ffff1nop4467p.............',
  '..............p7644on1ffff1no4467p..............',
  '...............p764on1ffff1no467p...............',
  '................p76on11ff11no67p................',
  '.................p7onn1111nno7p.................',
  '..................p7onnmmnno7p..................',
  '...................ponnmmnnop...................',
  '....................onn11nno....................',
  '.....................o1111o.....................',
  '.....................o1111o.....................',
  '.....................o1111o.....................',
  '......................o11o......................',
  '......................o11o......................',
  '.......................11.......................',
  '.......................11.......................',
];

export const DELTA_BODY: SpriteDef = {
  frames: buildPoseFrames(parseGrid(BODY_ROWS, PALETTE)),
  // Rear centreline, at the lip of the exhaust nozzle on the trailing edge.
  anchors: { tail: [24, 5] },
};

// 8x6 exhaust flicker: hottest and widest at the nozzle lip (bottom rows),
// tapering up and off the back of the drone. The two frames differ in flame
// length — frame 0 reaches the top of the grid, frame 1 burns two rows
// shorter — so alternating them reads as a flame stutter, not a recolour.
export const DELTA_JET: SpriteDef = {
  frames: [
    parseGrid([
      '...55...',
      '..5555..',
      '..5885..',
      '.588885.',
      '.888888.',
      '.888888.',
    ], PALETTE),
    parseGrid([
      '........',
      '........',
      '...55...',
      '..5885..',
      '.588885.',
      '.888888.',
    ], PALETTE),
  ],
  anchors: { mount: [4, 5] },
};

export function createDelta(): LayeredSprite {
  return {
    layers: [
      { def: DELTA_BODY, frame: 0 },
      { def: DELTA_JET, frame: 0, attach: { to: 'tail', by: 'mount' } },
    ],
  };
}
