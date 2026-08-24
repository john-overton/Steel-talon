import { describe, expect, it } from 'vitest';
import {
  drawLayered,
  layerOffsets,
  parseGrid,
  type LayeredSprite,
  type PreparedLayered,
  type SpriteDef,
} from './sprite';

const PAL = ['#000000', '#ff0000', '#00ff00'] as const;

describe('parseGrid', () => {
  it('reports width and height from the grid', () => {
    const g = parseGrid(['012', '210'], PAL);
    expect(g.width).toBe(3);
    expect(g.height).toBe(2);
    expect(g.rgba).toHaveLength(3 * 2 * 4);
  });

  it('decodes palette indices to opaque RGBA', () => {
    const g = parseGrid(['1'], PAL);
    expect([...g.rgba]).toEqual([255, 0, 0, 255]);
  });

  it('treats "." as transparent', () => {
    const g = parseGrid(['.2'], PAL);
    expect(g.rgba[3]).toBe(0); // first pixel fully transparent
    expect([...g.rgba.slice(4)]).toEqual([0, 255, 0, 255]);
  });

  it('throws on a character outside the palette', () => {
    expect(() => parseGrid(['5'], PAL)).toThrow(/palette/i);
    expect(() => parseGrid(['!'], PAL)).toThrow(/palette/i);
  });

  it('throws on ragged rows', () => {
    expect(() => parseGrid(['01', '012'], PAL)).toThrow(/row/i);
  });
});

describe('layerOffsets', () => {
  const base: SpriteDef = {
    frames: [parseGrid(['00', '00'], PAL)],
    anchors: { mast: [5, 6], pylon: [1, 2] },
  };
  const rotor: SpriteDef = {
    frames: [parseGrid(['1'], PAL)],
    anchors: { hub: [3, 3] },
  };

  it('returns {0,0} for the base layer', () => {
    const sprite: LayeredSprite = { layers: [{ def: base, frame: 0 }] };
    expect(layerOffsets(sprite)).toEqual([{ x: 0, y: 0 }]);
  });

  it('positions an attached layer by mapping its anchor onto the base anchor', () => {
    const sprite: LayeredSprite = {
      layers: [
        { def: base, frame: 0 },
        { def: rotor, frame: 0, attach: { to: 'mast', by: 'hub' } },
      ],
    };
    expect(layerOffsets(sprite)).toEqual([
      { x: 0, y: 0 },
      { x: 2, y: 3 }, // mast [5,6] - hub [3,3]
    ]);
  });

  it('defaults an unattached extra layer to {0,0}', () => {
    const sprite: LayeredSprite = {
      layers: [{ def: base, frame: 0 }, { def: rotor, frame: 0 }],
    };
    expect(layerOffsets(sprite)[1]).toEqual({ x: 0, y: 0 });
  });

  it('throws when an anchor name is missing on either side', () => {
    const bad1: LayeredSprite = {
      layers: [
        { def: base, frame: 0 },
        { def: rotor, frame: 0, attach: { to: 'nose', by: 'hub' } },
      ],
    };
    const bad2: LayeredSprite = {
      layers: [
        { def: base, frame: 0 },
        { def: rotor, frame: 0, attach: { to: 'mast', by: 'tip' } },
      ],
    };
    expect(() => layerOffsets(bad1)).toThrow(/anchor/i);
    expect(() => layerOffsets(bad2)).toThrow(/anchor/i);
  });

  it('returns an empty list for an empty layer stack', () => {
    expect(layerOffsets({ layers: [] })).toEqual([]);
  });
});

describe('drawLayered offsets', () => {
  const base: SpriteDef = {
    frames: [parseGrid(['00', '00'], PAL)],
    anchors: { mast: [5, 6], pylon: [1, 2] },
  };
  const rotor: SpriteDef = {
    frames: [parseGrid(['1'], PAL)],
    anchors: { hub: [3, 3] },
  };
  const sprite: LayeredSprite = {
    layers: [
      { def: base, frame: 0 },
      { def: rotor, frame: 0, attach: { to: 'mast', by: 'hub' } },
    ],
  };

  it('draws using prepared.offsets, matching layerOffsets for the same sprite', () => {
    const fake = {} as HTMLCanvasElement;
    const prepared: PreparedLayered = {
      sprite,
      canvases: [[fake], [fake]],
      offsets: layerOffsets(sprite),
    };
    const calls: unknown[][] = [];
    const ctx = {
      drawImage: (...args: unknown[]) => {
        calls.push(args);
      },
    } as unknown as CanvasRenderingContext2D;
    drawLayered(ctx, prepared, 100, 100);
    // base at (100-1, 100-1); attached layer offset by (2,3) per layerOffsets
    expect(calls[0]).toEqual([fake, 99, 99, 2, 2]);
    expect(calls[1]).toEqual([fake, 101, 102, 1, 1]);
  });

  it('honors an explicitly stale offsets array instead of recomputing it', () => {
    // Proves drawLayered reads prepared.offsets rather than calling
    // layerOffsets itself: a deliberately wrong offset here must show up
    // untouched in the drawImage call.
    const fake = {} as HTMLCanvasElement;
    const prepared: PreparedLayered = {
      sprite,
      canvases: [[fake], [fake]],
      offsets: [{ x: 0, y: 0 }, { x: 99, y: 99 }],
    };
    const calls: unknown[][] = [];
    const ctx = {
      drawImage: (...args: unknown[]) => {
        calls.push(args);
      },
    } as unknown as CanvasRenderingContext2D;
    drawLayered(ctx, prepared, 100, 100);
    expect(calls[1]).toEqual([fake, 198, 198, 1, 1]);
  });
});

describe('drawLayered visibility', () => {
  it('skips layers with visible: false', () => {
    const grid = parseGrid(['0'], ['#102030']);
    const def: SpriteDef = { frames: [grid], anchors: { a: [0, 0] as const } };
    const sprite: LayeredSprite = {
      layers: [
        { def, frame: 0 },
        { def, frame: 0, attach: { to: 'a', by: 'a' }, visible: false },
        { def, frame: 0, attach: { to: 'a', by: 'a' }, visible: true },
      ],
    };
    const fake = {} as HTMLCanvasElement;
    const prepared: PreparedLayered = {
      sprite,
      canvases: [[fake], [fake], [fake]],
      offsets: layerOffsets(sprite),
    };
    const calls: unknown[][] = [];
    const ctx = {
      drawImage: (...args: unknown[]) => {
        calls.push(args);
      },
    } as unknown as CanvasRenderingContext2D;
    drawLayered(ctx, prepared, 10, 10);
    expect(calls).toHaveLength(2); // base + visible:true; visible:false skipped
  });
});
