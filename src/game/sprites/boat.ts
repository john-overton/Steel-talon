// Drone boat as a layered sprite: hull base + turret layer on the deck
// anchor. Turret is static this pass; a later milestone animates it.
// Points down-screen (it drives toward the player). Palette: p/m = deck
// grays, 1 = dark waterline, j = cyan wake.
import { parseGrid, type LayeredSprite, type SpriteDef } from '../../engine/sprite';
import { PALETTE } from '../palette';

// 24x16 hull, bow at the bottom, wake sparkle at the stern (top).
const HULL_ROWS = [
  '........jj..jj..........',
  '....1111111111111111....',
  '....1pppppppppppppp1....',
  '....1pmmmmmmmmmmmmp1....',
  '....1pmmmmmmmmmmmmp1....',
  '....1pmmppppppppmmp1....',
  '....1pmmppppppppmmp1....',
  '....1pmmppppppppmmp1....',
  '....1pmmmmmmmmmmmmp1....',
  '....1pmmmmmmmmmmmmp1....',
  '.....1pmmmmmmmmmmp1.....',
  '.....1ppmmmmmmmmpp1.....',
  '......1ppmmmmmmpp1......',
  '.......1ppmmmmpp1.......',
  '.........1pppp1.........',
  '...........11...........',
];

export const BOAT_HULL: SpriteDef = {
  frames: [parseGrid(HULL_ROWS, PALETTE)],
  anchors: { turret: [11, 7] },
};

// 6x6 turret: gunmetal box, barrel pointing down toward the bow.
export const BOAT_TURRET: SpriteDef = {
  frames: [parseGrid([
    '.pppp.',
    'pmmmmp',
    'pmmmmp',
    '.pppp.',
    '..mm..',
    '..mm..',
  ], PALETTE)],
  anchors: { mount: [2, 2] },
};

export function createBoat(): LayeredSprite {
  return {
    layers: [
      { def: BOAT_HULL, frame: 0 },
      { def: BOAT_TURRET, frame: 0, attach: { to: 'turret', by: 'mount' } },
    ],
  };
}
