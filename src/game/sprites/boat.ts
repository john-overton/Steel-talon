// Drone boat as a layered sprite: hull base + turret layer on the deck
// anchor. Turret is static this pass; a later milestone animates it.
// Points down-screen (it drives toward the player). Palette chars, dark to
// light: 1 = outline / waterline / panel seams, p = hull side below the
// gunwale, o = deck shadow and side-walkway plating, n = main deck, m =
// lit cabin roof and turret top; g = bridge glass with a k glint; j = cyan
// wake foam, k = foam sparkle.
import { parseGrid, type LayeredSprite, type SpriteDef } from '../../engine/sprite';
import { PALETTE } from '../palette';

// 48x32 hull, bow at the bottom. Two rows of wake foam trail off the stern
// (rows 0-1), then the flat transom (row 2), aft deck with mooring bitts
// and twin exhaust stacks (rows 3-6), the raised bridge superstructure —
// roof hatch, radar mast, two bands of bridge glass (rows 7-14), the gun
// barbette ring the turret seats into (rows 15-26), and the forward deck
// with its breakwater chevron tapering to the bow (rows 27-31). Railing
// stanchions dot the side walkways on rows 9, 12, 18 and 21. Mirror-
// symmetric about the seam between columns 23 and 24.
const HULL_ROWS = [
  '........j...k..j....j......j....j..k...j........',
  '..........jj..k..jj...kjjk...jj..k..jj..........',
  '............111111111111111111111111............',
  '...........1ppoooooooooooooooooooopp1...........',
  '...........1ppoo1nnnnnnnnnnnnnn1oopp1...........',
  '...........1pponnn1p1nnnnnn1p1nnnopp1...........',
  '..........1pponnn1111nnnnnn1111nnnopp1..........',
  '..........1pponno11111111111111onnopp1..........',
  '..........1pponno1mmmmmmmmmmmm1onnopp1..........',
  '..........1ppo1no1mm1nnnnnn1mm1on1opp1..........',
  '..........1pponno1mm1nn11nn1mm1onnopp1..........',
  '..........1pponno1mmm1nnnn1mmm1onnopp1..........',
  '..........1ppo1no1m1ggkggkgg1m1on1opp1..........',
  '..........1pponno1m1gggggggg1m1onnopp1..........',
  '..........1pponno11111111111111onnopp1..........',
  '..........1pponnoo111111111111oonnopp1..........',
  '..........1pponno1pppppppppppp1onnopp1..........',
  '..........1pponno1pppppppppppp1onnopp1..........',
  '..........1ppo1no1pppppppppppp1on1opp1..........',
  '..........1pponno1pppppppppppp1onnopp1..........',
  '..........1pponno1pppppppppppp1onnopp1..........',
  '..........1ppo1no1pppppppppppp1on1opp1..........',
  '...........1ppono1pppppppppppp1onopp1...........',
  '............1ppoo1pppppppppppp1oopp1............',
  '.............1ppo1pppppppppppp1opp1.............',
  '..............1ppo11pppppppp11opp1..............',
  '...............1ppoo11111111oopp1...............',
  '................1pponn1111nnopp1................',
  '.................1ppon1nn1nopp1.................',
  '...................1pponnopp1...................',
  '.....................1pnnp1.....................',
  '.......................11.......................',
];

export const BOAT_HULL: SpriteDef = {
  frames: [parseGrid(HULL_ROWS, PALETTE)],
  // Centre of the barbette ring, on the hull centreline seam.
  anchors: { turret: [24, 20] },
};

// 12x12 turret: gunmetal box with a sloped rear, a cupola hatch on the lit
// roof, mantlet shoulders, and the barrel pointing down toward the bow.
export const BOAT_TURRET: SpriteDef = {
  frames: [parseGrid([
    '....1111....',
    '...1mmmm1...',
    '..1mmmmmm1..',
    '.1mmnnnnmm1.',
    '.1mmn11nmm1.',
    '.1mmnnnnmm1.',
    '.1mmmmmmmm1.',
    '.1oommmmoo1.',
    '..1o1nn1o1..',
    '....1nn1....',
    '....1nn1....',
    '....1111....',
  ], PALETTE)],
  anchors: { mount: [6, 4] },
};

export function createBoat(): LayeredSprite {
  return {
    layers: [
      { def: BOAT_HULL, frame: 0 },
      { def: BOAT_TURRET, frame: 0, attach: { to: 'turret', by: 'mount' } },
    ],
  };
}
