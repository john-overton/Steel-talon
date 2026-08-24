import { describe, expect, it } from 'vitest';
import { blipEnvelope } from '../engine/audio';
import { SFX } from './sfx';

describe('SFX presets', () => {
  it('defines the combat sounds and the UI blips', () => {
    expect(Object.keys(SFX).sort()).toEqual([
      'deny',
      'explode',
      'hit',
      'pickup',
      'select',
      'shoot',
    ]);
  });

  it('select and deny presets exist with sane ranges', () => {
    for (const name of ['select', 'deny'] as const) {
      const p = SFX[name];
      expect(p.duration).toBeGreaterThan(0);
      expect(p.volume).toBeGreaterThan(0);
      expect(p.volume).toBeLessThanOrEqual(1);
    }
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
