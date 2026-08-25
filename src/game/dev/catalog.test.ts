import { describe, expect, it } from 'vitest';
import { parseGrid, type SpriteDef } from '../../engine/sprite';
import { PALETTE } from '../palette';
import { buildCatalog } from './catalog';

const grid = () => parseGrid(['11', '11'], PALETTE);
const def = (): SpriteDef => ({ frames: [grid()], anchors: { hub: [1, 1] } });

describe('buildCatalog', () => {
  it('classifies defs, layered sprites, and grid strips; ignores the rest', () => {
    const entries = buildCatalog({
      './b.ts': {
        MY_DEF: def(),
        MY_LAYERED: { layers: [{ def: def(), frame: 0 }] },
        MY_STRIP: [grid(), grid()],
        FRAME_TICKS: 8,
        createThing: () => 0,
        EMPTY: [],
      },
      './a.ts': { OTHER_DEF: def() },
    });
    expect(entries.map((e) => [e.file, e.name, e.kind])).toEqual([
      ['./a.ts', 'OTHER_DEF', 'def'],
      ['./b.ts', 'MY_DEF', 'def'],
      ['./b.ts', 'MY_LAYERED', 'layered'],
      ['./b.ts', 'MY_STRIP', 'strip'],
    ]);
  });

  it('finds every real sprite module export without registration', () => {
    // Smoke test against a real module namespace.
    return import('../sprites/shots').then((shots) => {
      const entries = buildCatalog({ './shots.ts': { ...shots } });
      const names = entries.map((e) => e.name);
      expect(names).toContain('TRACER');
      expect(names).toContain('ENEMY_SHOT');
      expect(names).not.toContain('ENEMY_SHOT_FRAME_TICKS');
    });
  });
});
