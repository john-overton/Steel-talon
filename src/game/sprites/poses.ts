// Procedural pose warps: generate banked/pitched variants of a neutral
// PixelGrid (spec: bank frames pass). Warps happen inside the fixed
// canvas — output dimensions always equal input — so anchors stay valid.
// buildPoseFrames() accepts sparse hand-drawn overrides (the hybrid
// escape hatch); it ships with none.
import type { PixelGrid } from '../../engine/sprite';
import { POSE_DIR_ORDER } from '../pose';

function blank(width: number, height: number): PixelGrid {
  return { width, height, rgba: new Uint8ClampedArray(width * height * 4) };
}

function copyPx(src: PixelGrid, sx: number, sy: number, dst: PixelGrid, dx: number, dy: number): void {
  if (sx < 0 || sx >= src.width || sy < 0 || sy >= src.height) return;
  if (dx < 0 || dx >= dst.width || dy < 0 || dy >= dst.height) return;
  const s = (sy * src.width + sx) * 4;
  const d = (dy * dst.width + dx) * 4;
  dst.rgba[d] = src.rgba[s];
  dst.rgba[d + 1] = src.rgba[s + 1];
  dst.rgba[d + 2] = src.rgba[s + 2];
  dst.rgba[d + 3] = src.rgba[s + 3];
}

// Roll into a lateral bank: each row is width-squashed (nearest-neighbor),
// its center shifted toward the banking side, and sheared so the nose
// leads the lean while the tail trails.
export function bankGrid(grid: PixelGrid, side: 'left' | 'right', intensity: 1 | 2): PixelGrid {
  const { width: w, height: h } = grid;
  const squash = intensity * 2;   // total width lost: 2 slight, 4 full
  const shearMax = intensity;     // nose/tail lateral lead in px
  const lateral = intensity;      // whole-row center shift in px
  const sign = side === 'left' ? -1 : 1;
  const scale = w / (w - squash);
  const out = blank(w, h);
  for (let y = 0; y < h; y++) {
    // +shearMax at the nose (y=0) fading through 0 mid-fuselage to
    // -shearMax at the tail, signed toward the banking side.
    const shear = sign * shearMax * ((h / 2 - y) / (h / 2));
    const center = (w - 1) / 2 + sign * lateral + shear;
    for (let x = 0; x < w; x++) {
      const sx = Math.round((x - center) * scale + (w - 1) / 2);
      copyPx(grid, sx, y, out, x, y);
    }
  }
  return out;
}

// Pitch: compress the occupied row span by `crush` rows, packed toward the
// requested edge ('up' = toward row 0). Motion-relative: a craft moving
// up-screen packs toward the top, which reads as diving into the motion.
export function pitchGrid(grid: PixelGrid, dir: 'up' | 'down', intensity: 1 | 2): PixelGrid {
  const { width: w, height: h } = grid;
  const crush = intensity * 2;
  let top = -1;
  let bottom = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (grid.rgba[(y * w + x) * 4 + 3] > 0) {
        if (top < 0) top = y;
        bottom = y;
        break;
      }
    }
  }
  if (top < 0) return blank(w, h); // fully transparent input
  const span = bottom - top + 1;
  const newSpan = Math.max(1, span - crush);
  const scale = span / newSpan;
  const destTop = dir === 'up' ? top : bottom - newSpan + 1;
  const out = blank(w, h);
  for (let y = 0; y < newSpan; y++) {
    const sy = top + Math.min(span - 1, Math.round(y * scale));
    for (let x = 0; x < w; x++) copyPx(grid, x, sy, out, x, destTop + y);
  }
  return out;
}

// 17 frames in poseFrameIndex order: neutral, then each POSE_DIR_ORDER
// direction at slight-then-full intensity. An override (key
// `${dir}-${intensity}`) replaces the generated grid verbatim.
export function buildPoseFrames(
  neutral: PixelGrid,
  overrides: Partial<Record<string, PixelGrid>> = {},
): PixelGrid[] {
  const frames: PixelGrid[] = [neutral];
  for (const dir of POSE_DIR_ORDER) {
    for (const intensity of [1, 2] as const) {
      const ov = overrides[`${dir}-${intensity}`];
      if (ov) {
        if (ov.width !== neutral.width || ov.height !== neutral.height) {
          throw new Error(
            `override ${dir}-${intensity} is ${ov.width}x${ov.height}, ` +
            `neutral is ${neutral.width}x${neutral.height}`,
          );
        }
        frames.push(ov);
        continue;
      }
      let g: PixelGrid = neutral;
      const side = dir.endsWith('left') ? 'left' as const : dir.endsWith('right') ? 'right' as const : null;
      const pitch = dir.startsWith('up') ? 'up' as const : dir.startsWith('down') ? 'down' as const : null;
      if (side) g = bankGrid(g, side, intensity);
      if (pitch) g = pitchGrid(g, pitch, intensity);
      frames.push(g);
    }
  }
  return frames;
}
