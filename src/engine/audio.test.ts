import { describe, expect, it } from 'vitest';
import { blipEnvelope } from './audio';

describe('blipEnvelope', () => {
  it('passes well-formed params through', () => {
    const env = blipEnvelope({ type: 'square', startFreq: 880, endFreq: 440, duration: 0.08, volume: 0.15 });
    expect(env).toEqual({
      attackEnd: 0.005, decayEnd: 0.08, peak: 0.15, floor: 0.001,
      startFreq: 880, endFreq: 440,
    });
  });

  it('clamps volume into (0, 1]', () => {
    expect(blipEnvelope({ type: 'sine', startFreq: 440, endFreq: 440, duration: 0.1, volume: 3 }).peak).toBe(1);
    expect(blipEnvelope({ type: 'sine', startFreq: 440, endFreq: 440, duration: 0.1, volume: -1 }).peak).toBe(0.001);
  });

  it('enforces a minimum duration and positive frequencies', () => {
    const env = blipEnvelope({ type: 'sine', startFreq: 0, endFreq: -5, duration: 0, volume: 0.5 });
    expect(env.decayEnd).toBe(0.01);
    expect(env.startFreq).toBe(1);
    expect(env.endFreq).toBe(1);
  });

  it('keeps the attack inside very short blips', () => {
    const env = blipEnvelope({ type: 'sine', startFreq: 440, endFreq: 440, duration: 0.006, volume: 0.5 });
    expect(env.attackEnd).toBeLessThan(env.decayEnd);
  });
});
