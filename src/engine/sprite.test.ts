import { describe, expect, it } from 'vitest';
import { parseGrid } from './sprite';

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
