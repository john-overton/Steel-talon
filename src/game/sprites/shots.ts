// Projectile visuals. Palette: 8 = yellow, 5 = orange, k = pale blue,
// l = white, m = gunmetal, n = dark gray.
import { parseGrid, type SpriteDef } from '../../engine/sprite';
import { PALETTE } from '../palette';

// 4x8 tracer round: white-hot core column inside a yellow sheath, trailing
// off into a gunmetal tail.
export const TRACER: SpriteDef = {
  frames: [parseGrid([
    '.88.',
    '8ll8',
    '8ll8',
    '8ll8',
    '.88.',
    '.mm.',
    '.mm.',
    '.mm.',
  ], PALETTE)],
  anchors: { center: [2, 4] },
};

// Two-frame muzzle flash: a nine-pixel white/yellow star, then a sparser
// orange cross. Shown for FLASH_TICKS after each shot, alternating frames.
// Sized to stay inside the 64x64 chopper body when mounted on its muzzle
// anchors.
export const MUZZLE_FLASH: SpriteDef = {
  frames: [
    parseGrid([
      '....8....',
      '.8..8..8.',
      '..8.8.8..',
      '...8k8...',
      '888klk888',
      '...8k8...',
      '..8.8.8..',
      '.8..8..8.',
      '....8....',
    ], PALETTE),
    parseGrid([
      '....5....',
      '.........',
      '....5....',
      '.........',
      '5.5.8.5.5',
      '.........',
      '....5....',
      '.........',
      '....5....',
    ], PALETTE),
  ],
  anchors: { mount: [4, 4] },
};

// 4x10 rocket in flight: white tip over an orange collar, gunmetal body
// with fore and aft fins, and a yellow-over-orange exhaust plume.
export const ROCKET: SpriteDef = {
  frames: [parseGrid([
    '.ll.',
    '.55.',
    'nmmn',
    '.mm.',
    '.mm.',
    '.mm.',
    'nmmn',
    '.mm.',
    '.88.',
    '.55.',
  ], PALETTE)],
  anchors: { center: [2, 5] },
};
