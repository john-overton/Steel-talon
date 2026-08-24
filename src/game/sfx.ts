// Named blip presets, tuned by ear in the dev server. pickup is wired
// in milestone 8.
import type { BlipParams } from '../engine/audio';

export const SFX: Record<'shoot' | 'hit' | 'explode' | 'pickup', BlipParams> = {
  shoot:   { type: 'square',   startFreq: 880, endFreq: 440,  duration: 0.08, volume: 0.15 },
  hit:     { type: 'square',   startFreq: 220, endFreq: 110,  duration: 0.1,  volume: 0.2 },
  explode: { type: 'sawtooth', startFreq: 140, endFreq: 30,   duration: 0.45, volume: 0.3 },
  pickup:  { type: 'triangle', startFreq: 440, endFreq: 1320, duration: 0.15, volume: 0.2 },
};
