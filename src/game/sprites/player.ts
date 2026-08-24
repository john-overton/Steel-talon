// Player chopper as a layered sprite: body (airframe, no blades), two
// rocket pods on wing anchors, rotor blur on the mast anchor, and two
// muzzle-flash layers on the muzzle anchors (hidden until fired). MISSILE is
// defined but unattached — a future pickup milestone hangs it on the
// pylonL/pylonR hardpoint anchors. Palette chars: c = olive, d = dark
// olive deck, g = dark blue / j = cyan (canopy glass), m = gunmetal,
// p = dark gray (pods), r = red (rocket tips), 1 = dark, o = rotor blur.
import { parseGrid, type LayeredSprite, type SpriteDef } from '../../engine/sprite';
import { PALETTE } from '../palette';
import { MUZZLE_FLASH } from './shots';

// 32x32 airframe: narrow fuselage, 3-row wings, hardpoint stubs at the
// wingtips. Anchors: mast (rotor), podL/podR (rocket pods), muzzleL/muzzleR
// (gun muzzle flashes), pylonL/pylonR (future missile hardpoints).
const BODY_ROWS = [
  '...............cc...............',
  '..............cccc..............',
  '..............cccc..............',
  '.............cggggc.............',
  '.............cgjjgc.............',
  '.............cgjjgc.............',
  '.............cggggc.............',
  '............ccggggcc............',
  '............cccccccc............',
  '............ccddddcc............',
  '............ccddddcc............',
  '............ccddddcc............',
  '..mmmmmmmmmmccddddccmmmmmmmmmm..',
  '.mmmmmmmmmmmccddddccmmmmmmmmmmm.',
  '..mmmmmmmmmmccddddccmmmmmmmmmm..',
  '..11........ccddddcc........11..',
  '............ccddddcc............',
  '............ccd11dcc............',
  '............ccd11dcc............',
  '............ccddddcc............',
  '............ccddddcc............',
  '.............ccddcc.............',
  '..............cccc..............',
  '..............cccc..............',
  '...............cc...............',
  '...............cc...............',
  '...............cc...............',
  '...........mmmmccmmmm...........',
  '...............cc...............',
  '...............cc...............',
  '............mm1cc1mm............',
  '..............1cc1..............',
];

export const CHOPPER_BODY: SpriteDef = {
  frames: [parseGrid(BODY_ROWS, PALETTE)],
  anchors: {
    mast: [16, 17],
    podL: [5, 15],
    podR: [23, 15],
    muzzleL: [6, 13],
    muzzleR: [25, 13],
    pylonL: [2, 16],
    pylonR: [28, 16],
  },
};

// Under-wing rocket pod: gray pod with red rocket tips. Drawn once per
// wing, attached by its top-left corner.
export const ROCKET_POD: SpriteDef = {
  frames: [parseGrid(['pppp', 'rrrr'], PALETTE)],
  anchors: { mount: [0, 0] },
};

// Hangs from a pylon hardpoint by the top-center of its nose. Not part of
// createChopper() — attached by a future pickup.
export const MISSILE: SpriteDef = {
  frames: [parseGrid(['.r.', '.m.', '.m.', '.m.', '1m1'], PALETTE)],
  anchors: { mount: [1, 0] },
};

// 28x28 rotor blur disc, hub at the center. The two frames alternate the
// blades between a + (0°/90°) and an x (45°) so the rotor reads as
// spinning in the top-down plane.
const ROTOR_SIZE = 28;

function rotorFrame(blades: Array<[number, number]>): string[] {
  const grid = Array.from({ length: ROTOR_SIZE }, () =>
    new Array<string>(ROTOR_SIZE).fill('.'),
  );
  for (const [y, x] of blades) grid[y][x] = 'o';
  for (const y of [13, 14]) for (const x of [13, 14]) grid[y][x] = 'm';
  return grid.map((row) => row.join(''));
}

const PLUS: Array<[number, number]> = [];
const CROSS: Array<[number, number]> = [];
for (let d = 1; d <= 13; d++) {
  PLUS.push([13, 13 - d], [13, 14 + d], [14, 13 - d], [14, 14 + d]);
  PLUS.push([13 - d, 13], [13 - d, 14], [14 + d, 13], [14 + d, 14]);
}
for (let d = 1; d <= 9; d++) {
  CROSS.push([13 - d, 13 - d], [13 - d, 14 + d], [14 + d, 13 - d], [14 + d, 14 + d]);
}

export const CHOPPER_ROTOR: SpriteDef = {
  frames: [
    parseGrid(rotorFrame(PLUS), PALETTE),
    parseGrid(rotorFrame(CROSS), PALETTE),
  ],
  anchors: { hub: [14, 14] },
};

export function createChopper(): LayeredSprite {
  return {
    layers: [
      { def: CHOPPER_BODY, frame: 0 },
      { def: ROCKET_POD, frame: 0, attach: { to: 'podL', by: 'mount' } },
      { def: ROCKET_POD, frame: 0, attach: { to: 'podR', by: 'mount' } },
      { def: CHOPPER_ROTOR, frame: 0, attach: { to: 'mast', by: 'hub' } },
      { def: MUZZLE_FLASH, frame: 0, attach: { to: 'muzzleL', by: 'mount' }, visible: false },
      { def: MUZZLE_FLASH, frame: 0, attach: { to: 'muzzleR', by: 'mount' }, visible: false },
    ],
  };
}
