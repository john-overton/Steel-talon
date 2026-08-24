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

export function rasterize(grid: PixelGrid): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = grid.width;
  canvas.height = grid.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');
  ctx.putImageData(new ImageData(grid.rgba, grid.width, grid.height), 0, 0);
  return canvas;
}
