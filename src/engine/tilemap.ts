// Repeating tile grid drawn relative to a camera. The engine knows nothing
// about what the tiles depict; the game supplies rasterized tiles and a
// pure pickTile(col,row,frame) that indexes them.
export interface Tilemap {
  tileSize: number;
  tiles: CanvasImageSource[];
  pickTile(col: number, row: number, frame: number): number;
}

// First and last (inclusive) tile indices whose span intersects
// [cam, cam + view). Pure; used by drawTilemap and tested headlessly.
export function visibleRange(cam: number, view: number, tileSize: number): [number, number] {
  const first = Math.floor(cam / tileSize);
  const last = Math.ceil((cam + view) / tileSize) - 1;
  return [first, last];
}

export function drawTilemap(
  ctx: CanvasRenderingContext2D, map: Tilemap,
  camX: number, camY: number, viewW: number, viewH: number, frame: number,
): void {
  const [c0, c1] = visibleRange(camX, viewW, map.tileSize);
  const [r0, r1] = visibleRange(camY, viewH, map.tileSize);
  for (let row = r0; row <= r1; row++) {
    for (let col = c0; col <= c1; col++) {
      const tile = map.tiles[map.pickTile(col, row, frame)];
      if (tile) {
        ctx.drawImage(tile, col * map.tileSize - camX, row * map.tileSize - camY);
      }
    }
  }
}
