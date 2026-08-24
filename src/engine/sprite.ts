// Pixel-grid sprites: parseGrid is pure (headlessly testable); rasterize
// paints the result onto a small canvas once at boot (engine spec §4).
export interface PixelGrid {
  width: number;
  height: number;
  // Backed by a plain ArrayBuffer (not SharedArrayBuffer) so it can be
  // handed straight to ImageData in rasterize().
  rgba: Uint8ClampedArray<ArrayBuffer>;
}

export function parseGrid(rows: string[], palette: readonly string[]): PixelGrid {
  const height = rows.length;
  const width = rows[0]?.length ?? 0;
  const rgba = new Uint8ClampedArray(width * height * 4);
  rows.forEach((row, y) => {
    if (row.length !== width) throw new Error(`row ${y} length ${row.length} != ${width}`);
    for (let x = 0; x < width; x++) {
      const ch = row[x];
      if (ch === '.') continue; // transparent
      const index = parseInt(ch, 32);
      const hex = Number.isNaN(index) ? undefined : palette[index];
      if (hex === undefined) throw new Error(`'${ch}' is not a palette index`);
      const o = (y * width + x) * 4;
      rgba[o] = parseInt(hex.slice(1, 3), 16);
      rgba[o + 1] = parseInt(hex.slice(3, 5), 16);
      rgba[o + 2] = parseInt(hex.slice(5, 7), 16);
      rgba[o + 3] = 255;
    }
  });
  return { width, height, rgba };
}

// Layered sprites: a base layer plus attachments (rotors, turrets, pylon
// weapons) positioned by mapping a named anchor on the attachment onto a
// named anchor on the base. Layers draw in array order (last on top) and
// animate independently via their own `frame` index; adding or removing a
// layer at runtime (e.g. a weapon pickup) is a plain array edit followed by
// prepareLayered().

export interface SpriteDef {
  frames: PixelGrid[];
  anchors: Record<string, readonly [number, number]>;
}

export interface Layer {
  def: SpriteDef;
  frame: number;
  attach?: { to: string; by: string }; // base anchor name / own anchor name
}

export interface LayeredSprite {
  layers: Layer[]; // layers[0] is the base
}

// Pure: pixel offset of each layer relative to the base's top-left corner.
export function layerOffsets(sprite: LayeredSprite): Array<{ x: number; y: number }> {
  const base = sprite.layers[0];
  return sprite.layers.map((layer, i) => {
    if (i === 0 || !layer.attach) return { x: 0, y: 0 };
    const to = base.def.anchors[layer.attach.to];
    const by = layer.def.anchors[layer.attach.by];
    if (!to) throw new Error(`base has no anchor '${layer.attach.to}'`);
    if (!by) throw new Error(`layer has no anchor '${layer.attach.by}'`);
    return { x: to[0] - by[0], y: to[1] - by[1] };
  });
}

export interface PreparedLayered {
  sprite: LayeredSprite;
  canvases: HTMLCanvasElement[][]; // [layer][frame]
}

export function prepareLayered(sprite: LayeredSprite): PreparedLayered {
  return { sprite, canvases: sprite.layers.map((l) => l.def.frames.map(rasterize)) };
}

// Draws all layers centered on (cx, cy) using the base layer's dimensions.
export function drawLayered(
  ctx: CanvasRenderingContext2D,
  prepared: PreparedLayered,
  cx: number,
  cy: number,
  scale = 1,
): void {
  const { sprite, canvases } = prepared;
  const baseGrid = sprite.layers[0]?.def.frames[0];
  if (!baseGrid) return;
  const offsets = layerOffsets(sprite);
  const ox = cx - (baseGrid.width * scale) / 2;
  const oy = cy - (baseGrid.height * scale) / 2;
  sprite.layers.forEach((layer, i) => {
    const grid = layer.def.frames[layer.frame];
    ctx.drawImage(
      canvases[i][layer.frame],
      Math.round(ox + offsets[i].x * scale),
      Math.round(oy + offsets[i].y * scale),
      grid.width * scale,
      grid.height * scale,
    );
  });
}

export function rasterize(grid: PixelGrid): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = grid.width;
  canvas.height = grid.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');
  ctx.putImageData(new ImageData(grid.rgba, grid.width, grid.height), 0, 0);
  return canvas;
}
