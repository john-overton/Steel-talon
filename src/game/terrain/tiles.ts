/**
 * Marching-squares terrain tiles over the island field. Pure logic
 * (`marchCase`, `coverage`) is testable headlessly; `createTerrainRenderer`
 * builds a rasterized tile cache once and draws visible 16px cells.
 */
import { BAND, type Band, bandAt, hash2 } from './field';
import { PALETTE } from '../palette';
import { parseGrid, type PixelGrid, rasterize } from '../../engine/sprite';
import { visibleRange } from '../../engine/tilemap';

export const TERRAIN_TILE = 16;

/** Bit mask of corners at/above `band`: bit0=TL, bit1=TR, bit2=BR, bit3=BL. */
export function marchCase(corners: [Band, Band, Band, Band], band: Band): number {
  const [tl, tr, br, bl] = corners;
  let mask = 0;
  if (tl >= band) mask |= 0b0001;
  if (tr >= band) mask |= 0b0010;
  if (br >= band) mask |= 0b0100;
  if (bl >= band) mask |= 0b1000;
  return mask;
}

/** Per-pixel coverage for a case: bilinear of corner bits thresholded at 0.5. */
export function coverage(caseMask: number, px: number, py: number): boolean {
  const tl = caseMask & 0b0001 ? 1 : 0;
  const tr = caseMask & 0b0010 ? 1 : 0;
  const br = caseMask & 0b0100 ? 1 : 0;
  const bl = caseMask & 0b1000 ? 1 : 0;

  const u = (px + 0.5) / TERRAIN_TILE;
  const v = (py + 0.5) / TERRAIN_TILE;

  const top = tl + (tr - tl) * u;
  const bottom = bl + (br - bl) * u;
  const value = top + (bottom - top) * v;

  return value >= 0.5;
}

const BAND_TEXTURE: Record<Band, { base: string; speckle: readonly string[] }> = {
  [BAND.DEEP]: { base: '0', speckle: [] }, // unused: DEEP is never tiled (water shows through)
  [BAND.SHALLOW]: { base: 'j', speckle: ['i', 'k'] },
  [BAND.BEACH]: { base: '7', speckle: ['6'] },
  [BAND.GRASS]: { base: 'a', speckle: ['9'] },
  [BAND.JUNGLE]: { base: 'c', speckle: ['b', 'c'] },
  [BAND.ROCK]: { base: 'n', speckle: ['o', 'p'] },
};

/** One 16x16 tile texture for a band/variant: solid base with hashed speckle. */
function bandTexture(band: Band, variant: number): PixelGrid {
  const tex = BAND_TEXTURE[band];
  const rows: string[] = [];
  for (let y = 0; y < TERRAIN_TILE; y++) {
    let row = '';
    for (let x = 0; x < TERRAIN_TILE; x++) {
      const h = hash2(x + variant * TERRAIN_TILE, y, band * 1000 + variant);
      let ch = tex.base;
      if (band === BAND.SHALLOW) {
        // ~30% chance of transparency so animated water shows through.
        const roll = (h >>> 0) % 100;
        if (roll < 30) {
          row += '.';
          continue;
        }
        // Remaining 70%: ~80% base, ~20% speckle split between i/k — same
        // ratio as the other bands' speckle coverage.
        const sub = roll - 30; // 0..69
        ch = sub < 7 ? tex.speckle[0] : sub < 14 ? tex.speckle[1] : tex.base;
      } else if (tex.speckle.length > 0) {
        const roll = (h >>> 0) % 100;
        // ~20% speckle coverage using the hashed positions.
        if (roll < 20) {
          ch = tex.speckle[h % tex.speckle.length];
        }
      }
      row += ch;
    }
    rows.push(row);
  }
  return parseGrid(rows, PALETTE);
}

const VARIANTS = 3;
const TILED_BANDS: Band[] = [BAND.SHALLOW, BAND.BEACH, BAND.GRASS, BAND.JUNGLE, BAND.ROCK];

export interface TerrainRenderer {
  draw(ctx: CanvasRenderingContext2D, camX: number, camY: number, seed: number): void;
}

export function createTerrainRenderer(): TerrainRenderer {
  // Cache: [band][caseMask][variant] -> rasterized canvas (case 0 is never drawn/used).
  const cache = new Map<Band, HTMLCanvasElement[][]>();
  for (const band of TILED_BANDS) {
    const cases: HTMLCanvasElement[][] = [];
    const texGrids = Array.from({ length: VARIANTS }, (_, variant) => bandTexture(band, variant));
    for (let mask = 0; mask < 16; mask++) {
      const variants: HTMLCanvasElement[] = [];
      for (let variant = 0; variant < VARIANTS; variant++) {
        variants.push(buildCaseTile(mask, texGrids[variant]));
      }
      cases.push(variants);
    }
    cache.set(band, cases);
  }

  function buildCaseTile(mask: number, texGrid: PixelGrid): HTMLCanvasElement {
    const rgba = new Uint8ClampedArray(TERRAIN_TILE * TERRAIN_TILE * 4);
    for (let py = 0; py < TERRAIN_TILE; py++) {
      for (let px = 0; px < TERRAIN_TILE; px++) {
        if (!coverage(mask, px, py)) continue;
        const si = (py * TERRAIN_TILE + px) * 4;
        rgba[si] = texGrid.rgba[si];
        rgba[si + 1] = texGrid.rgba[si + 1];
        rgba[si + 2] = texGrid.rgba[si + 2];
        rgba[si + 3] = texGrid.rgba[si + 3];
      }
    }
    return rasterize({ width: TERRAIN_TILE, height: TERRAIN_TILE, rgba });
  }

  return {
    draw(ctx: CanvasRenderingContext2D, camX: number, camY: number, seed: number): void {
      const [c0, c1] = visibleRange(camX, ctx.canvas.width, TERRAIN_TILE);
      const [r0, r1] = visibleRange(camY, ctx.canvas.height, TERRAIN_TILE);

      for (let row = r0; row <= r1; row++) {
        for (let col = c0; col <= c1; col++) {
          const x0 = col * TERRAIN_TILE;
          const y0 = row * TERRAIN_TILE;
          const x1 = x0 + TERRAIN_TILE;
          const y1 = y0 + TERRAIN_TILE;

          const tl = bandAt(x0, y0, seed);
          const tr = bandAt(x1, y0, seed);
          const br = bandAt(x1, y1, seed);
          const bl = bandAt(x0, y1, seed);
          const corners: [Band, Band, Band, Band] = [tl, tr, br, bl];

          const lo = Math.min(tl, tr, br, bl) as Band;
          const hi = Math.max(tl, tr, br, bl) as Band;
          if (hi === BAND.DEEP) continue; // all corners DEEP: draw nothing

          const start = Math.max(lo, BAND.SHALLOW) as Band;
          for (let band = start; band <= hi; band++) {
            const b = band as Band;
            const mask = marchCase(corners, b);
            if (mask === 0) continue;
            const variant = hash2(col, row, b) % VARIANTS;
            const tile = cache.get(b)?.[mask]?.[variant];
            if (tile) {
              ctx.drawImage(tile, x0 - camX, y0 - camY);
            }
          }
        }
      }
    },
  };
}
