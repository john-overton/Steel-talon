// Named blip presets, tuned by ear in the dev server. Combat sounds plus
// the two UI blips (select/deny) used by menus and weapon switching.
import type { BlipParams } from '../engine/audio';

export type SfxName = 'shoot' | 'hit' | 'explode' | 'pickup' | 'select' | 'deny';

export const SFX: Record<SfxName, BlipParams> = {
  shoot:   { type: 'square',   startFreq: 880, endFreq: 440,  duration: 0.08, volume: 0.15 },
  hit:     { type: 'square',   startFreq: 220, endFreq: 110,  duration: 0.1,  volume: 0.2 },
  explode: { type: 'sawtooth', startFreq: 140, endFreq: 30,   duration: 0.45, volume: 0.3 },
  pickup:  { type: 'triangle', startFreq: 440, endFreq: 1320, duration: 0.15, volume: 0.2 },
  select:  { type: 'square',   startFreq: 660, endFreq: 990,  duration: 0.05, volume: 0.12 },
  deny:    { type: 'square',   startFreq: 110, endFreq: 80,   duration: 0.08, volume: 0.12 },
};
