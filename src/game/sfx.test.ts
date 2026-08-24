import { describe, expect, it } from 'vitest';
import { blipEnvelope } from '../engine/audio';
import { SFX } from './sfx';

describe('SFX presets', () => {
  it('defines all four combat sounds', () => {
    expect(Object.keys(SFX).sort()).toEqual(['explode', 'hit', 'pickup', 'shoot']);
  });

  it('every preset is already within valid ranges (no clamping needed)', () => {
    for (const p of Object.values(SFX)) {
      const env = blipEnvelope(p);
      expect(env.peak).toBe(p.volume);
      expect(env.decayEnd).toBe(p.duration);
      expect(env.startFreq).toBe(p.startFreq);
      expect(env.endFreq).toBe(p.endFreq);
    }
  });
});
