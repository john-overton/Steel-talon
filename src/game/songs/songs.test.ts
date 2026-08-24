import { describe, expect, it } from 'vitest';
import { songBeats } from '../../engine/sequencer';
import { LEVEL1_SONG } from './level1';
import { TITLE_SONG } from './title';

function channelBeats(notes: Array<[number, number]>): number {
  return notes.reduce((sum, [, beats]) => sum + beats, 0);
}

describe.each([
  ['TITLE_SONG', TITLE_SONG, 96, 32],
  ['LEVEL1_SONG', LEVEL1_SONG, 128, 64],
] as const)('%s', (_name, song, bpm, beats) => {
  it('has the right tempo and loops', () => {
    expect(song.bpm).toBe(bpm);
    expect(song.loop).toBe(true);
  });

  it('all four channels stay in phase across the loop', () => {
    expect(song.channels).toHaveLength(4);
    for (const ch of song.channels) {
      expect(channelBeats(ch)).toBe(beats);
    }
    expect(songBeats(song)).toBe(beats);
  });

  it('every frequency is 0 (rest) or in the audible band', () => {
    for (const ch of song.channels) {
      for (const [freq] of ch) {
        expect(freq === 0 || (freq >= 40 && freq <= 8000)).toBe(true);
      }
    }
  });
});
