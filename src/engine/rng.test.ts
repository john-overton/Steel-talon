import { describe, expect, it } from 'vitest';
import { mulberry32 } from './rng';

describe('mulberry32', () => {
  it('same seed yields an identical sequence', () => {
    const a = mulberry32(1234);
    const b = mulberry32(1234);
    const seqA = Array.from({ length: 100 }, () => a());
    const seqB = Array.from({ length: 100 }, () => b());
    expect(seqA).toEqual(seqB);
  });

  it('different seeds yield different sequences', () => {
    const a = mulberry32(1);
    const b = mulberry32(2);
    const seqA = Array.from({ length: 10 }, () => a());
    const seqB = Array.from({ length: 10 }, () => b());
    expect(seqA).not.toEqual(seqB);
  });

  it('pins the first 5 outputs of a fixed seed (golden sequence)', () => {
    // Locks the implementation against accidental drift: any change to the
    // mulberry32 algorithm that alters its output must be a deliberate,
    // reviewed decision, since it would desync every seeded replay.
    const rng = mulberry32(0xc0ffee);
    const seq = Array.from({ length: 5 }, () => rng());
    expect(seq).toEqual([
      0.021141508361324668,
      0.6661099966149777,
      0.7799714196007699,
      0.7395844468846917,
      0.10705656302161515,
    ]);
  });

  it('outputs stay in [0, 1) and vary', () => {
    const rng = mulberry32(42);
    const seq = Array.from({ length: 1000 }, () => rng());
    for (const v of seq) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
    expect(new Set(seq).size).toBeGreaterThan(900);
  });
});
