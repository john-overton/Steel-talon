import { describe, expect, it } from 'vitest';
import { scheduleWindow, songBeats, type Song } from './sequencer';

// 120 bpm → 0.5 s per beat. One bar of lead, rest-heavy drums.
const song: Song = {
  bpm: 120,
  channels: [
    [[440, 1], [0, 1], [660, 2]],   // starts at 0s, (rest), 1.0s; total 4 beats
    [], [],
    [[150, 0.5], [0, 3.5]],          // drum hit at 0s only
  ],
  loop: true,
};

describe('songBeats', () => {
  it('is the max channel length in beats', () => {
    expect(songBeats(song)).toBe(4);
  });
});

describe('scheduleWindow', () => {
  it('returns notes starting inside the window, skipping rests', () => {
    const notes = scheduleWindow(song, 0, 0.6);
    expect(notes).toHaveLength(2); // 440 at 0s, drum at 0s — rest excluded
    const lead = notes.find((n) => n.channel === 0)!;
    expect(lead.freq).toBe(440);
    expect(lead.atSec).toBe(0);
    expect(lead.durSec).toBeCloseTo(0.5);
  });

  it('half-open window: a note exactly at toSec is excluded', () => {
    expect(scheduleWindow(song, 0.5, 1.0)).toHaveLength(0);   // 660 starts at exactly 1.0
    expect(scheduleWindow(song, 1.0, 1.1)).toHaveLength(1);
  });

  it('looping songs wrap: the second iteration lands 2s later', () => {
    const notes = scheduleWindow(song, 1.9, 2.2);
    expect(notes).toHaveLength(2); // 440 and drum at 2.0
    expect(notes[0].atSec).toBeCloseTo(2.0);
  });

  it('non-looping songs end', () => {
    const once: Song = { ...song, loop: false };
    expect(scheduleWindow(once, 1.9, 2.2)).toHaveLength(0);
  });

  it('results are sorted by start time', () => {
    const notes = scheduleWindow(song, 0, 4);
    for (let i = 1; i < notes.length; i++) {
      expect(notes[i].atSec).toBeGreaterThanOrEqual(notes[i - 1].atSec);
    }
  });
});
