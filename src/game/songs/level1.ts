// Level 1: sunny Caribbean groove — offbeat stabs stand in for steel
// drums. 16 bars at 128 bpm. Keep every channel summing to 64 beats.
import type { Note, Song } from '../../engine/sequencer';

const C3 = 130.81, F3 = 174.61, G3 = 196, A2 = 110;
const C4 = 261.63, E4 = 329.63, G4 = 392, F4 = 349.23, A4 = 440;
const C5 = 523.25, D5 = 587.33, E5 = 659.25, G5 = 783.99, A5 = 880, F5 = 698.46;
const KICK = 150, SNARE = 800, HAT = 6000;

const phraseA: Note[] = [
  [E5, 0.5], [0, 0.25], [E5, 0.25], [D5, 0.5], [C5, 0.5], [D5, 1], [0, 1],
  [C5, 0.5], [0, 0.25], [C5, 0.25], [D5, 0.5], [E5, 0.5], [G5, 1], [0, 1],
  [A5, 0.5], [G5, 0.5], [E5, 0.5], [D5, 0.5], [E5, 1], [C5, 1],
  [D5, 0.5], [C5, 0.5], [A4, 0.5], [G4, 0.5], [C5, 2],
];
const phraseB: Note[] = [
  [G5, 0.5], [0, 0.25], [G5, 0.25], [F5, 0.5], [E5, 0.5], [F5, 1], [0, 1],
  [E5, 0.5], [0, 0.25], [E5, 0.25], [F5, 0.5], [G5, 0.5], [A5, 1], [0, 1],
  [G5, 0.5], [F5, 0.5], [E5, 0.5], [D5, 0.5], [C5, 1], [E5, 1],
  [D5, 0.5], [E5, 0.5], [D5, 0.5], [G4, 0.5], [C5, 2],
];
const lead1: Note[] = [...phraseA, ...phraseB, ...phraseA, ...phraseB];

const stab = (f: number): Note[] => [
  [0, 0.5], [f, 0.25], [0, 0.25], [0, 0.5], [f, 0.25], [0, 0.25],
  [0, 0.5], [f, 0.25], [0, 0.25], [0, 0.5], [f, 0.25], [0, 0.25],
];
const stabBars = (roots: number[]): Note[] => roots.map(stab).flat();
const lead2: Note[] = stabBars([
  C4, C4, F4, G4, C4, C4, F4, G4,
  A4, A4, F4, G4, C4, E4, G4, C4,
]);

const calypso = (f: number): Note[] => [
  [f, 0.75], [0, 0.25], [f * 1.5, 0.75], [0, 0.25],
  [f, 0.5], [f * 1.5, 0.5], [f, 1],
];
const bass: Note[] = [
  C3, C3, F3, G3, C3, C3, F3, G3,
  A2, A2, F3, G3, C3, C3, G3, C3,
].map(calypso).flat();

const groove: Note[] = [
  [KICK, 0.5], [HAT, 0.25], [HAT, 0.25], [SNARE, 0.5], [HAT, 0.5],
  [KICK, 0.25], [KICK, 0.25], [SNARE, 0.5], [HAT, 1],
];
const drums: Note[] = Array.from({ length: 16 }, () => groove).flat();

export const LEVEL1_SONG: Song = {
  bpm: 128,
  channels: [lead1, lead2, bass, drums],
  loop: true,
};
