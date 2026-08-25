// Dev object explorer: auto-discovers every sprite export via
// import.meta.glob and shows it rasterized at 1x/2x/4x on a checkerboard.
// Left/Right browses; Esc exits. New sprite exports appear automatically.
import type { InputSource } from '../../engine/input';
import { HEIGHT, WIDTH } from '../../engine/renderer';
import type { Scene } from '../../engine/scene';
import {
  drawLayered, prepareLayered, rasterize,
  type PixelGrid, type PreparedLayered,
} from '../../engine/sprite';
import { PALETTE } from '../palette';
import { buildCatalog, type CatalogEntry } from './catalog';

const FRAME_TICKS = 10; // uniform preview animation rate
const ZOOMS = [1, 2, 4] as const;

interface PreparedEntry {
  frames?: HTMLCanvasElement[];      // def / strip
  layered?: PreparedLayered;         // layered
  width: number;
  height: number;
  frameCount: number;
}

export interface ExplorerDeps { input: InputSource; onExit(): void; }

export function createExplorerScene(deps: ExplorerDeps): Scene {
  const modules = import.meta.glob(['../sprites/*.ts', '!../sprites/*.test.ts'], { eager: true }) as Record<string, Record<string, unknown>>;
  const catalog = buildCatalog(modules);
  const preparedCache = new Map<CatalogEntry, PreparedEntry>();
  let index = 0;
  let ticks = 0;
  const prev = { left: false, right: false, pause: false };

  function prepare(entry: CatalogEntry): PreparedEntry {
    let p = preparedCache.get(entry);
    if (p) return p;
    if (entry.kind === 'layered') {
      const layered = prepareLayered(entry.layered);
      const base = entry.layered.layers[0].def.frames[0];
      p = { layered, width: base.width, height: base.height, frameCount: 1 };
    } else {
      const grids: PixelGrid[] = entry.kind === 'def' ? entry.def.frames : entry.frames;
      p = {
        frames: grids.map(rasterize),
        width: grids[0].width,
        height: grids[0].height,
        frameCount: grids.length,
      };
    }
    preparedCache.set(entry, p);
    return p;
  }

  function drawChecker(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
    ctx.fillStyle = '#2a2a2a';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#3a3a3a';
    for (let cy = 0; cy < h; cy += 8) {
      for (let cx = (cy / 8) % 2 === 0 ? 0 : 8; cx < w; cx += 16) {
        ctx.fillRect(x + cx, y + cy, Math.min(8, w - cx), Math.min(8, h - cy));
      }
    }
  }

  return {
    enter() {
      ticks = 0;
      prev.left = true; prev.right = true; prev.pause = true; // swallow held keys
    },
    update() {
      ticks++;
      const s = deps.input.state;
      if (s.right && !prev.right && catalog.length > 0) index = (index + 1) % catalog.length;
      if (s.left && !prev.left && catalog.length > 0) index = (index + catalog.length - 1) % catalog.length;
      if (s.pause && !prev.pause) { prev.pause = s.pause; deps.onExit(); return; }
      prev.left = s.left; prev.right = s.right; prev.pause = s.pause;
    },
    draw(ctx) {
      ctx.fillStyle = '#101418';
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
      ctx.textAlign = 'left';
      ctx.font = '12px monospace';
      ctx.fillStyle = PALETTE[8];
      ctx.fillText('OBJECT EXPLORER', 16, 24);
      ctx.fillStyle = PALETTE[22];
      ctx.font = '10px monospace';
      ctx.fillText('LEFT/RIGHT: BROWSE — ESC: TITLE', 16, 40);

      if (catalog.length === 0) {
        ctx.fillText('NO SPRITES FOUND', 16, 80);
        return;
      }
      const entry = catalog[index];
      const p = prepare(entry);
      ctx.fillStyle = PALETTE[21];
      ctx.font = '14px monospace';
      ctx.fillText(`${entry.name}  (${index + 1}/${catalog.length})`, 16, 68);
      ctx.fillStyle = PALETTE[22];
      ctx.font = '10px monospace';
      ctx.fillText(`${entry.file}  ${p.width}x${p.height}  ${entry.kind}  frames: ${p.frameCount}`, 16, 84);

      const frame = Math.floor(ticks / FRAME_TICKS) % p.frameCount;
      let x = 16;
      for (const zoom of ZOOMS) {
        const w = p.width * zoom;
        const h = p.height * zoom;
        if (x + w > WIDTH - 16) break; // zoom does not fit; skip it
        const y = 120;
        drawChecker(ctx, x, y, w, h);
        ctx.save();
        ctx.imageSmoothingEnabled = false;
        ctx.translate(x, y);
        ctx.scale(zoom, zoom);
        if (p.layered) drawLayered(ctx, p.layered, p.width / 2, p.height / 2);
        else if (p.frames) ctx.drawImage(p.frames[frame], 0, 0);
        ctx.restore();
        ctx.fillStyle = PALETTE[22];
        ctx.fillText(`${zoom}x`, x, 116);
        x += w + 24;
      }
    },
  };
}
