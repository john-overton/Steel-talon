// Player chopper as a layered sprite: body (airframe, no blades), two
// rocket pods on wing anchors, rotor blur on the mast anchor, and two
// muzzle-flash layers on the muzzle anchors plus a third on the nose
// barrel (all hidden until fired), and two MISSILE layers hanging from the
// pylonL/pylonR hardpoints (hidden until the loadout carries missiles).
// Layer indices are named by LAYER. Palette chars: green ramp 9 = spine
// highlight, a = lit deck, c = olive, d = shaded olive, e = dark green-gray,
// 1 = panel lines / outline; g = dark blue frame, j = cyan glass, k = glass
// glint; m/n/o = gunmetal, gray, dark gray (guns, engines, rotor); r = red
// rocket tips, l = white missile tip, 8 = wingtip light.
import { parseGrid, type LayeredSprite, type SpriteDef } from '../../engine/sprite';
import { PALETTE } from '../palette';
import { MUZZLE_FLASH } from './shots';

// 64x64 airframe, nose up-screen. Nose chin cannon (rows 2-7) into the
// sensor housing (8-13), tandem canopy with three frame bands (14-29),
// engine nacelles with intakes and exhaust ports flanking the deck (29-44),
// stub wings carrying the gun barrels, pods and pylons (30-43), tail boom
// with a joint band (45-51), stabilizer (52-56) and a port-side tail rotor
// (57-59). Mirror-symmetric about column 32; the tail rotor is the one
// deliberate exception.
const BODY_ROWS = [
  '................................................................',
  '................................................................',
  '..............................1mmm1.............................',
  '..............................1nmn1.............................',
  '..............................1nmn1.............................',
  '.............................1onmno1............................',
  '............................1onnmnno1...........................',
  '...........................1eonnmnnoe1..........................',
  '..........................1edccaaaccde1.........................',
  '.........................1eddccaaaccdde1........................',
  '........................1eddc1j111j1cdde1.......................',
  '........................1eddc1j111j1cdde1.......................',
  '........................1edd1111a1111dde1.......................',
  '.......................1edddccaaaaaccddde1......................',
  '.......................1eddggjjjkjjjggdde1......................',
  '......................1eddggjjjjkjjjjggdde1.....................',
  '......................1eddggjjkjkjkjjggdde1.....................',
  '......................1eddgggggggggggggdde1.....................',
  '.....................1edddggjjjjkjjjjggddde1....................',
  '.....................1edddggjjkjkjkjjggddde1....................',
  '.....................1edddggjjjkkkjjjggddde1....................',
  '.....................1edddggjjjjkjjjjggddde1....................',
  '.....................1edddgggggggggggggddde1....................',
  '....................1eddddggjjjjkjjjjggdddde1...................',
  '....................1eddddggjjkjkjkjjggdddde1...................',
  '..............1n1...1eddddggjjjjkjjjjggdddde1...1n1.............',
  '.............1mnm1..1eddddggjjjkkkjjjggdddde1..1mnm1............',
  '.............1mnm1..1eddddggjjjjkjjjjggdddde1..1mnm1............',
  '.............1mnm1..1eddddggjjjkkkjjjggdddde1..1mnm1............',
  '.............1mnm1.1nnnoddgggggggggggggddonnn1.1mnm1............',
  '........1aaaaaaaaaa1n11o1edcccaa9aacccde1o11n1aaaaaaaaaa1.......',
  '......1aaaaaaaaaaaa1n11o1edc1caa9aac1cde1o11n1aaaaaaaaaaaa1.....',
  '.....1nncccccnnnccc1n11o1edcc1nnmnn1ccde1o11n1cccnnncccccnn1....',
  '....1cccccccccccccc1omno1edcc1nmmmn1ccde1onmo1cccccccccccccc1...',
  '...1dddddddddddddee1omno1edcc1mmmmm1ccde1onmo1eeddddddddddddd1..',
  '...1cccccccccccccee1omno1edcc1nmmmn1ccde1onmo1eeccccccccccccc1..',
  '...8cccccccccccccee1omno1edcc1nnmnn1ccde1onmo1eeccccccccccccc8..',
  '...1cccccccccccccee1omno1edcc11nnn11ccde1onmo1eeccccccccccccc1..',
  '...1dddddddddddddee1omno1edc1caa9aac1cde1onmo1eeddddddddddddd1..',
  '...1c1ccc1ccc1cccee1omno1edcccaa9aacccde1onmo1eeccc1ccc1ccc1c1..',
  '....1cccccccccccccc1o1no1eddccaa9aaccdde1on1o1cccccccccccccc1...',
  '....1eeeeeeeeeeeeee1e11e1e11ddca9acdd11e1e11e1eeeeeeeeeeeeee1...',
  '.....1eeeeeeeeeeeee1e11e1e11ddca9acdd11e1e11e1eeeeeeeeeeeee1....',
  '.......11111111111111eee1ee1ddca9acdd1ee1eee11111111111111......',
  '....................1eee1eeddcaa9aacddee1eee1...................',
  '..........................1edcaa9aacde1.........................',
  '...........................1edca9acde1..........................',
  '...........................1edca9acde1..........................',
  '...........................1eeee9eeee1..........................',
  '...........................1edca9acde1..........................',
  '...........................1edca9acde1..........................',
  '...........................1edca9acde1..........................',
  '...................1aaaaaaaaaaaaaaaaaaaaaaaaa1..................',
  '...................1cccccccccdca9acdccccccccc1..................',
  '...................1cccccccccdca9acdccccccccc1..................',
  '...................1eeeeeeeeeedcacdeeeeeeeeee1..................',
  '...................111111111edca9acde111111111..................',
  '.......................1nnnnnmdcacd1............................',
  '.....................1onnnnnnmdcacd1............................',
  '.......................1nnnnnm1cac1.............................',
  '..............................1cac1.............................',
  '..............................1ccc1.............................',
  '...............................1c1..............................',
  '................................................................',
];

export const CHOPPER_BODY: SpriteDef = {
  frames: [parseGrid(BODY_ROWS, PALETTE)],
  anchors: {
    mast: [32, 34],
    podL: [9, 33],
    podR: [46, 33],
    muzzleL: [15, 26],
    muzzleR: [49, 26],
    nose: [32, 6],
    pylonL: [6, 31],
    pylonR: [58, 31],
  },
};

// Under-wing rocket pod: three tube openings with the rocket tips visible
// inside, over a gray body that shades off at the rear. Drawn once per
// wing, attached by its top-left corner.
export const ROCKET_POD: SpriteDef = {
  frames: [
    parseGrid([
      '1nn1nn1nn1',
      '1rr1rr1rr1',
      '1nn1nn1nn1',
      '1nnnnnnnn1',
      '1oooooooo1',
    ], PALETTE),
  ],
  anchors: { mount: [0, 0] },
};

// Pylon missile: white nose tip, red seeker band, gunmetal body with fore
// and aft fins. Hangs from a pylon hardpoint by the top-center of its nose.
export const MISSILE: SpriteDef = {
  frames: [
    parseGrid([
      '..l..',
      '.1r1.',
      '.1m1.',
      '11m11',
      '.1m1.',
      '.nmn.',
      '.nmn.',
      '.nmn.',
      '.1m1.',
      '11m11',
      '.1n1.',
    ], PALETTE),
  ],
  anchors: { mount: [2, 0] },
};

// 59x59 rotor blur disc, hub at the center. Four blades sweep 45 degrees
// between the frames (frame 0 is a +, frame 1 an x) and the dashed blur
// arcs rotate with them, so the disc reads as spinning rather than
// flickering between two palettes.
const ROTOR_SIZE = 59;
const ROTOR_HUB = 29;
const BLADE_MIN = 5;
const BLADE_MAX = 28;

// [radius, dash period] of the blur arcs; dashes are 2px long.
const BLUR_ARCS: Array<[number, number]> = [[27, 7], [19, 5]];

function rotorFrame(baseAngle: number, arcPhase: number): string[] {
  const grid = Array.from({ length: ROTOR_SIZE }, () =>
    new Array<string>(ROTOR_SIZE).fill('.'),
  );
  const set = (x: number, y: number, ch: string): void => {
    if (x >= 0 && x < ROTOR_SIZE && y >= 0 && y < ROTOR_SIZE) grid[y][x] = ch;
  };
  for (let blade = 0; blade < 4; blade++) {
    const a = baseAngle + blade * (Math.PI / 2);
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    for (let r = BLADE_MIN; r <= BLADE_MAX; r++) {
      const x = ROTOR_HUB + Math.round(dx * r);
      const y = ROTOR_HUB + Math.round(dy * r);
      set(x, y, r > 22 ? 'o' : 'n');
      // One pixel of chord on the trailing side, dropped near the tip.
      if (r < 24) set(x + Math.round(-dy), y + Math.round(dx), 'o');
    }
  }
  for (const [radius, period] of BLUR_ARCS) {
    const steps = Math.round(2 * Math.PI * radius);
    for (let i = 0; i < steps; i++) {
      if ((i + arcPhase) % period >= 2) continue;
      const a = (i / steps) * Math.PI * 2;
      set(
        ROTOR_HUB + Math.round(Math.cos(a) * radius),
        ROTOR_HUB + Math.round(Math.sin(a) * radius),
        'o',
      );
    }
  }
  // Hub: a bright gunmetal boss ringed in gray and outlined.
  for (let y = ROTOR_HUB - 3; y <= ROTOR_HUB + 3; y++) {
    for (let x = ROTOR_HUB - 3; x <= ROTOR_HUB + 3; x++) {
      const d = Math.abs(x - ROTOR_HUB) + Math.abs(y - ROTOR_HUB);
      if (d <= 2) set(x, y, 'm');
      else if (d <= 4) set(x, y, 'n');
      else if (d <= 5) set(x, y, '1');
    }
  }
  return grid.map((row) => row.join(''));
}

export const CHOPPER_ROTOR: SpriteDef = {
  frames: [
    parseGrid(rotorFrame(0, 0), PALETTE),
    parseGrid(rotorFrame(Math.PI / 4, 3), PALETTE),
  ],
  anchors: { hub: [ROTOR_HUB, ROTOR_HUB] },
};

// Index of each layer produced by createChopper(). Callers toggle
// visibility and frames through these names rather than magic numbers.
export const LAYER = {
  BODY: 0,
  POD_L: 1,
  POD_R: 2,
  ROTOR: 3,
  FLASH_L: 4,
  FLASH_R: 5,
  FLASH_NOSE: 6,
  MISSILE_L: 7,
  MISSILE_R: 8,
} as const;

export function createChopper(): LayeredSprite {
  return {
    layers: [
      { def: CHOPPER_BODY, frame: 0 },
      { def: ROCKET_POD, frame: 0, attach: { to: 'podL', by: 'mount' } },
      { def: ROCKET_POD, frame: 0, attach: { to: 'podR', by: 'mount' } },
      { def: CHOPPER_ROTOR, frame: 0, attach: { to: 'mast', by: 'hub' } },
      { def: MUZZLE_FLASH, frame: 0, attach: { to: 'muzzleL', by: 'mount' }, visible: false },
      { def: MUZZLE_FLASH, frame: 0, attach: { to: 'muzzleR', by: 'mount' }, visible: false },
      { def: MUZZLE_FLASH, frame: 0, attach: { to: 'nose', by: 'mount' }, visible: false },
      { def: MISSILE, frame: 0, attach: { to: 'pylonL', by: 'mount' }, visible: false },
      { def: MISSILE, frame: 0, attach: { to: 'pylonR', by: 'mount' }, visible: false },
    ],
  };
}
