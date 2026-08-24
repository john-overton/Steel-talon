// Projectile visuals. Palette: 8 = yellow, 5 = orange, l = white,
// m = gunmetal.
import { parseGrid, type SpriteDef } from '../../engine/sprite';
import { PALETTE } from '../palette';

// 2x4 tracer round: yellow tip, gunmetal tail.
export const TRACER: SpriteDef = {
  frames: [parseGrid(['88', '88', 'mm', 'mm'], PALETTE)],
  anchors: { center: [1, 2] },
};

// Two-frame muzzle flash: big white/yellow star, then a smaller orange
// cross. Shown for FLASH_TICKS after each shot, alternating frames.
export const MUZZLE_FLASH: SpriteDef = {
  frames: [
    parseGrid([
      '..8..',
      '.888.',
      '88l88',
      '.888.',
      '..8..',
    ], PALETTE),
    parseGrid([
      '..5..',
      '.....',
      '5.8.5',
      '.....',
      '..5..',
    ], PALETTE),
  ],
  anchors: { mount: [2, 2] },
};
