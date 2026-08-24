// Pickups. Weapon pickups are chopper-sized (64x64) rotating badges with a
// pulsing glow ring — built programmatically from a 32x32 glyph rotated 90°
// per frame inside a circular ring that alternates yellow/white.
import { parseGrid, type PixelGrid, type SpriteDef } from '../../engine/sprite';
import { PALETTE } from '../palette';

export const PICKUP_FRAME_TICKS = 8;
export const SALVAGE_FRAME_TICKS = 15;

const PICKUP_SIZE = 64;
const GLYPH_SIZE = 32;
const GLYPH_OFFSET = (PICKUP_SIZE - GLYPH_SIZE) / 2;
const RING_RADIUS = 28;

export function rotateGrid(rows: string[]): string[] {
  const h = rows.length;
  const w = rows[0]?.length ?? 0;
  const out: string[] = [];
  for (let x = 0; x < w; x++) {
    let row = '';
    for (let y = h - 1; y >= 0; y--) row += rows[y][x];
    out.push(row);
  }
  return out;
}

// Side-on gatling: six-barrel cluster with dark bores and muzzle bands, a
// clamped shroud, the ribbed rotor drum, motor block with a hazard chip, and
// a brass ammo belt feeding out of the chute.
const MINIGUN_GLYPH = [
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
  '...............mkkkkkkm.........',
  '...............mmmpmmpm.........',
  '.............kpnnnpnnpnnn.......',
  '...1pmmmkmmmmmpnnnpnnpnnnoooo...',
  '...1pnnnnnnnnmpnknpnkpnnnpppp...',
  '.............mpnnnpnnpnnnp88p1..',
  '...1pmmmkmmmmmpnnnpnnpnnnp88p1..',
  '...1pnnnnnnnnmpnnnpnnpnnnpppp1..',
  '.............mpeeeeeeeeeepppp1..',
  '...1pmmmkmmmmmpnnnpnnpnnnp11p1..',
  '...1pnnnnnnnnmpnnnpnnpnnnp11p1..',
  '.............mpnnnpnnpnnnpppp1..',
  '...1pnnnknnnnmpnnnpnnpnnnpppp...',
  '...1poooooooompnknpnkpnnnpppp...',
  '.............opnnnpnnpnnn.......',
  '...............pppppppp.........',
  '...............pppppppp.........',
  '..................ooooo.........',
  '..................ooooo.........',
  '...................763..........',
  '...................663763.......',
  '......................663763....',
  '.........................663....',
  '................................',
  '................................',
  '................................',
  '................................',
];

// Pylon-mounted rocket pod: 4x3 grid of tube mouths (orange warheads loaded
// top and bottom rows, middle row empty), caution stripes on the rear plate
// and swept tail fins.
const ROCKET_GLYPH = [
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
  '............nnnnnnn.............',
  '............oopppoo.............',
  '............oopppoo.............',
  '............ooooooo.............',
  '.....mmmmmmmmmmmmmmmmmmmmm......',
  '....nmmmmmmmmmmmmmmmmmmmmmn.....',
  '....np111111111111111188oon.....',
  '....np1knn1knn1knn1knn11oonoo...',
  '....np1n5n1n5n1n5n1n5n11oonoo...',
  '....np1nno1nno1nno1nno88oonno...',
  '....np1knn1knn1knn1knn88oonno...',
  '....np1n1n1n1n1n1n1n1n11oonno...',
  '....np1nno1nno1nno1nno11oonno...',
  '....np1knn1knn1knn1knn88oonno...',
  '....np1n5n1n5n1n5n1n5n88oonoo...',
  '....np1nno1nno1nno1nno11oonoo...',
  '....np111111111111111111oon.....',
  '....ppppppppppppppppppppppp.....',
  '.....111111111111111111111......',
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
];

function weaponFrames(glyph: string[]): PixelGrid[] {
  const frames: PixelGrid[] = [];
  let g = glyph;
  for (let f = 0; f < 4; f++) {
    const ring = f % 2 === 0 ? '8' : 'l';
    const rows = Array.from(
      { length: PICKUP_SIZE },
      () => new Array<string>(PICKUP_SIZE).fill('.'),
    );
    const c = PICKUP_SIZE / 2;
    for (let y = 0; y < PICKUP_SIZE; y++) {
      for (let x = 0; x < PICKUP_SIZE; x++) {
        if (Math.round(Math.hypot(x - c, y - c)) === RING_RADIUS) rows[y][x] = ring;
      }
    }
    g.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        if (row[x] !== '.') rows[y + GLYPH_OFFSET][x + GLYPH_OFFSET] = row[x];
      }
    });
    frames.push(parseGrid(rows.map((r) => r.join('')), PALETTE));
    g = rotateGrid(g);
  }
  return frames;
}

export const MINIGUN_PICKUP: SpriteDef = {
  frames: weaponFrames(MINIGUN_GLYPH),
  anchors: { center: [32, 32] },
};

export const ROCKET_PICKUP: SpriteDef = {
  frames: weaponFrames(ROCKET_GLYPH),
  anchors: { center: [32, 32] },
};

// Ammo crate: planked wood with seams, leather strapping bands riveted at the
// crossings, and a cyan air-drop stencil.
export const CRATE: SpriteDef = {
  frames: [parseGrid([
    '333333333333333333333333',
    '322222222222222222222223',
    '322733333333333333373223',
    '322222222222222222222223',
    '342324444444444444232443',
    '372327777777777777232773',
    '362326666666666666232663',
    '3623266666jjjj6666232663',
    '3623266666jjjj6666232663',
    '34232444jjjjjjjj44232443',
    '372327777jjjjjj777232773',
    '3623266666jjjj6666232663',
    '36232666666jj66666232663',
    '362326666666666666232663',
    '342324444444444444232443',
    '322222222222222222222223',
    '333733333333333333373333',
    '322222222222222222222223',
    '322326666666666666232223',
    '333333333333333333333333',
  ], PALETTE)],
  anchors: { center: [12, 10] },
};

// Torn hull plate with rust pitting; the glint travels between the two frames.
const SALVAGE_BASE = [
  '................',
  '....1111........',
  '...1nnnn11......',
  '..1nmmmnnn1.....',
  '..1nm44mnnn1....',
  '.1nmm44mmnnn1...',
  '.1nooommmmnn1...',
  '.1noppoommmn1...',
  '..1oppppoomn1...',
  '..1opp44ppon1...',
  '...1oo44ppn1....',
  '....1oopppn1....',
  '.....1ooon1.....',
  '......111.......',
  '................',
  '................',
];

function withGlint(rows: string[], spots: ReadonlyArray<readonly [number, number, string]>): string[] {
  const cells = rows.map((r) => r.split(''));
  for (const [x, y, ch] of spots) cells[y][x] = ch;
  return cells.map((r) => r.join(''));
}

export const SALVAGE: SpriteDef = {
  frames: [
    parseGrid(withGlint(SALVAGE_BASE, [
      [5, 2, '8'], [4, 3, 'k'], [5, 3, 'k'], [4, 4, 'k'],
    ]), PALETTE),
    parseGrid(withGlint(SALVAGE_BASE, [
      [9, 8, '8'], [8, 9, 'k'], [9, 9, 'k'], [8, 10, 'k'],
    ]), PALETTE),
  ],
  anchors: { center: [8, 8] },
};
