/**
 * Terrain layer facade: the single object scenes use to draw the island world.
 * Wires the marching-squares tile renderer, coastal wave animation, and
 * scenery decorations together behind one `draw` call. Stateless per frame —
 * everything is a pure function of (camX, camY, seed, tick), so the layer is
 * deterministic and safe to share across scenes.
 */
import { rasterize, type PixelGrid } from '../../engine/sprite';
import { HEIGHT, WIDTH } from '../../engine/renderer';
import { BOULDER, HUT, PATH_PATCH, TREE_LARGE, TREE_MED, TREE_SMALL } from '../sprites/terrain-decor';
import { decorationsIn, type DecorKind } from './decor';
import { createTerrainRenderer } from './tiles';
import { drawWaves } from './waves';

export interface TerrainLayer {
  /**
   * Draws terrain tiles, waves, and decorations for the visible rect.
   * Call after the water tilemap draw. `tick` drives wave animation.
   */
  draw(ctx: CanvasRenderingContext2D, camX: number, camY: number, tick: number): void;
}

const DECOR_GRIDS: Record<DecorKind, PixelGrid> = {
  treeS: TREE_SMALL,
  treeM: TREE_MED,
  treeL: TREE_LARGE,
  hut: HUT,
  boulder: BOULDER,
  path: PATH_PATCH,
};

/** World-space padding so decorations straddling the view edge still draw. */
const PAD = 32;

export function createTerrainLayer(seed: number): TerrainLayer {
  const terrain = createTerrainRenderer();

  // Rasterize the six decoration grids once at construction.
  const sprites = {} as Record<DecorKind, HTMLCanvasElement>;
  for (const kind of Object.keys(DECOR_GRIDS) as DecorKind[]) {
    sprites[kind] = rasterize(DECOR_GRIDS[kind]);
  }

  return {
    draw(ctx, camX, camY, tick) {
      terrain.draw(ctx, camX, camY, seed);
      drawWaves(ctx, camX, camY, seed, tick);

      const decor = decorationsIn(camX - PAD, camY - PAD, camX + WIDTH + PAD, camY + HEIGHT + PAD, seed);
      // Ground paths first so village huts sit on top of their clearing;
      // everything else keeps decorationsIn's y-sorted draw order.
      for (const d of decor) {
        if (d.kind !== 'path') continue;
        const img = sprites.path;
        ctx.drawImage(img, Math.round(d.x - camX - img.width / 2), Math.round(d.y - camY - img.height / 2));
      }
      for (const d of decor) {
        if (d.kind === 'path') continue;
        const img = sprites[d.kind];
        ctx.drawImage(img, Math.round(d.x - camX - img.width / 2), Math.round(d.y - camY - img.height / 2));
      }
    },
  };
}
