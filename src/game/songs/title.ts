// Title theme: confident minor-key action sting. 8 bars at 96 bpm.
// Tuning by ear is expected — keep every channel summing to 32 beats.
import type { Note, Song } from '../../engine/sequencer';

const A2 = 110, E2 = 82.41, F2 = 87.31, G2 = 98;
const A3 = 220, E3 = 164.81, F3 = 174.61;
const A4 = 440, B4 = 493.88, C5 = 523.25, D4 = 293.66, E4 = 329.63,
  F4 = 349.23, G4 = 392, C4 = 261.63;
const KICK = 150, SNARE = 800, HAT = 6000;

const lead1: Note[] = [
  [A4, 1], [C5, 0.5], [B4, 0.5], [A4, 1], [E4, 1],
  [G4, 1], [A4, 1], [E4, 2],
  [F4, 1], [A4, 0.5], [G4, 0.5], [F4, 1], [D4, 1],
  [E4, 1.5], [C4, 0.5], [E4, 2],
  [A4, 1], [C5, 0.5], [B4, 0.5], [A4, 1], [E4, 1],
  [G4, 1], [A4, 1], [E4, 2],
  [F4, 1], [G4, 1], [A4, 1], [B4, 1],
  [C5, 2], [0, 2],
];

const stab = (f: number): Note[] =>
  [[0, 0.5], [f, 0.5], [0, 0.5], [f, 0.5], [0, 0.5], [f, 0.5], [0, 1]];
const lead2: Note[] = [
  ...stab(A3), ...stab(A3), ...stab(F3), ...stab(E3),
  ...stab(A3), ...stab(A3), ...stab(F3), ...stab(E3),
];

const root = (f: number): Note[] => [[f, 1], [0, 0.5], [f, 0.5], [f, 1], [0, 1]];
const bass: Note[] = [
  ...root(A2), ...root(A2), ...root(F2), ...root(E2),
  ...root(A2), ...root(A2), ...root(F2), ...root(G2),
];

const beat: Note[] = [
  [KICK, 0.5], [HAT, 0.5], [SNARE, 0.5], [HAT, 0.5],
  [KICK, 0.5], [HAT, 0.5], [SNARE, 0.5], [HAT, 0.5],
];
const drums: Note[] = Array.from({ length: 8 }, () => beat).flat();

export const TITLE_SONG: Song = {
  bpm: 96,
  channels: [lead1, lead2, bass, drums],
  loop: true,
};
