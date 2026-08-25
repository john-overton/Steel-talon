// Terrain decoration sprites: trees, huts, boulders, path clearing. Viewed
// from directly above (TOP mode camera). Single-frame pixel grids — no
// anchors needed since decor.ts places them by world-space center.
import { parseGrid, type PixelGrid } from '../../engine/sprite';
import { PALETTE } from '../palette';

// Small tree canopy: irregular round blob, dark 'c' underside ring on the
// lower-right (shadow away from the sun), 'a' body, '9' highlight upper-left.
export const TREE_SMALL: PixelGrid = parseGrid([
  '............',
  '....999a....',
  '..999aaaa9..',
  '.99aaaaaaac.',
  '.9aaaaaaaacc',
  '9aaaaaaaaacc',
  '9aaaaaaaacc.',
  '.aaaaaaacc..',
  '.9aaaaacc...',
  '..9aaacc....',
  '...9cc......',
  '............',
], PALETTE);

export const TREE_MED: PixelGrid = parseGrid([
  '................',
  '.....99aaa......',
  '...999aaaaa9....',
  '..99aaaaaaaac...',
  '.99aaaaaaaaaacc.',
  '.9aaaaaaaaaaaccc',
  '9aaaaaaaaaaaaccc',
  '9aaaaaaaaaaaaacc',
  '9aaaaaaaaaaaaacc',
  '.9aaaaaaaaaaaccc',
  '.9aaaaaaaaaaaacc',
  '..9aaaaaaaaaacc.',
  '...9aaaaaaaacc..',
  '....9aaaaaacc...',
  '.....9aaacc.....',
  '......9cc.......',
], PALETTE);

export const TREE_LARGE: PixelGrid = parseGrid([
  '........................',
  '.........99aaaa9........',
  '.......99aaaaaaaa9......',
  '.....999aaaaaaaaaa9c....',
  '....99aaaaaaaaaaaaacc...',
  '...99aaaaaaaaaaaaaaacc..',
  '..99aaaaaaaaaaaaaaaaccc.',
  '.99aaaaaaaaaaaaaaaaaaccc',
  '.9aaaaaaaaaaaaaaaaaaaccc',
  '9aaaaaaaaaaabaaaaaaaaccc',
  '9aaaaaaaaaaaaaaaaaaaaccc',
  '9aaaaaaaaaaaaaaaaaaaaacc',
  '9aaaaaaaaaaaaaaaaaaaaacc',
  '.9aaaaaaaaaabaaaaaaaacc.',
  '.9aaaaaaaaaaaaaaaaaaccc.',
  '..9aaaaaaaaaaaaaaaaacc..',
  '...9aaaaaaaaaaaaaaacc...',
  '....9aaaaaaaaaaaaacc....',
  '.....9aaaaaaaaaaacc.....',
  '......99aaaaaaaacc......',
  '.......999aaaaacc.......',
  '.........99aaacc........',
  '...........9acc.........',
  '............9cc.........',
], PALETTE);

// Hut viewed from above: thatch roof stripes ('6'/'v'), '4' wall outline,
// '2' shadow along the bottom edge, single '2' door notch at the eave.
export const HUT: PixelGrid = parseGrid([
  '..444444444444..',
  '.46666666666664.',
  '46v6666666666v64',
  '466v6666666v6664',
  '4666v6666v66664.',
  '46666v66v666664.',
  '466666vv6666664.',
  '4666666v66666664',
  '46666v66v666664.',
  '4666v6666v66664.',
  '466v6666666v6664',
  '.4666666666664..',
  '.4444224444444..',
  '................',
], PALETTE);

// Boulder outcrop: gray blob, 'n' mid, 'o' shadow, 'p' highlight.
export const BOULDER: PixelGrid = parseGrid([
  '............',
  '...ppnnn....',
  '..pnnnnnno..',
  '.pnnnnnnnoo.',
  'pnnnnnnnnooo',
  'pnnnnnnnnooo',
  'onnnnnnnnooo',
  '.onnnnnnooo.',
  '..oonnnooo..',
  '...ooooo....',
], PALETTE);

// Sand clearing between huts: elliptical '7' sand fill with '6' edge
// speckle, generated so every row is exactly PATH_W wide.
const PATH_W = 24;
const PATH_H = 18;
function makePathPatch(): PixelGrid {
  const cx = (PATH_W - 1) / 2;
  const cy = (PATH_H - 1) / 2;
  const rx = PATH_W / 2 - 1;
  const ry = PATH_H / 2 - 1;
  const rows: string[] = [];
  for (let y = 0; y < PATH_H; y++) {
    let row = '';
    for (let x = 0; x < PATH_W; x++) {
      const dx = (x - cx) / rx;
      const dy = (y - cy) / ry;
      const d = dx * dx + dy * dy;
      if (d > 1) row += '.';
      else if (d > 0.78) row += '6';
      else row += '7';
    }
    rows.push(row);
  }
  return parseGrid(rows, PALETTE);
}
export const PATH_PATCH: PixelGrid = makePathPatch();
