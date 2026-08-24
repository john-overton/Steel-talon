// Lookahead music sequencer (engine spec §5): songs are plain beat data,
// scheduled ahead of playback time against a shared AudioContext clock.
// scheduleWindow is the pure, headlessly-tested core; createSequencer is the
// thin Web Audio scheduling loop, verified by ear in the dev server.
import type { AudioSystem } from './audio';

export type Note = [freq: number, beats: number]; // freq 0 = rest

export interface Song {
  bpm: number;
  channels: [Note[], Note[], Note[], Note[]]; // square lead 1, square lead 2, triangle bass, noise drums (freq = bandpass Hz)
  loop: boolean;
}

export interface ScheduledNote {
  channel: number;
  freq: number;
  atSec: number;
  durSec: number;
}

export function songBeats(song: Song): number {
  let max = 0;
  for (const channel of song.channels) {
    const total = channel.reduce((sum, [, beats]) => sum + beats, 0);
    if (total > max) max = total;
  }
  return max;
}

export function scheduleWindow(song: Song, fromSec: number, toSec: number): ScheduledNote[] {
  const secPerBeat = 60 / song.bpm;
  const loopSec = songBeats(song) * secPerBeat;
  const result: ScheduledNote[] = [];

  song.channels.forEach((notes, channel) => {
    let beatPos = 0;
    for (const [freq, beats] of notes) {
      const baseAtSec = beatPos * secPerBeat;
      const durSec = beats * secPerBeat;
      beatPos += beats;
      if (freq <= 0) continue;

      if (song.loop && loopSec > 0) {
        // Find every integer k >= 0 such that baseAtSec + k*loopSec lands
        // in the half-open window [fromSec, toSec).
        const kMin = Math.max(0, Math.ceil((fromSec - baseAtSec) / loopSec));
        const kMax = Math.ceil((toSec - baseAtSec) / loopSec) - 1;
        for (let k = kMin; k <= kMax; k++) {
          const atSec = baseAtSec + k * loopSec;
          if (atSec >= fromSec && atSec < toSec) {
            result.push({ channel, freq, atSec, durSec });
          }
        }
      } else if (baseAtSec >= fromSec && baseAtSec < toSec) {
        result.push({ channel, freq, atSec: baseAtSec, durSec });
      }
    }
  });

  result.sort((a, b) => a.atSec - b.atSec);
  return result;
}

export interface Sequencer {
  play(song: Song): void;
  stop(): void;
  playing(): boolean;
}

const CHANNEL_VOLUMES = [0.12, 0.1, 0.14, 0.1] as const;
const CHANNEL_TYPES: OscillatorType[] = ['square', 'square', 'triangle'];
const LOOKAHEAD_SEC = 0.12;
const SCHEDULE_LATENCY_SEC = 0.05;
const TICK_MS = 25;

export function createSequencer(audio: AudioSystem): Sequencer {
  let timer: ReturnType<typeof setInterval> | null = null;
  let isPlaying = false;

  function clear(): void {
    if (timer !== null) {
      clearInterval(timer);
      timer = null;
    }
    isPlaying = false;
  }

  function scheduleVoice(note: ScheduledNote, ctx: AudioContext): void {
    const volume = CHANNEL_VOLUMES[note.channel];
    if (note.channel === 3) {
      audio.noise(Math.min(note.durSec, 0.12), volume, note.freq, note.atSec);
      return;
    }

    const attackEnd = note.atSec + 0.005;
    const holdEnd = note.atSec + note.durSec * 0.8;
    const decayEnd = note.atSec + note.durSec;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = CHANNEL_TYPES[note.channel];
    osc.frequency.setValueAtTime(note.freq, note.atSec);
    gain.gain.setValueAtTime(0.001, note.atSec);
    gain.gain.exponentialRampToValueAtTime(volume, attackEnd);
    gain.gain.setValueAtTime(volume, holdEnd);
    gain.gain.exponentialRampToValueAtTime(0.001, decayEnd);
    osc.connect(gain).connect(ctx.destination);
    osc.start(note.atSec);
    osc.stop(decayEnd + 0.02);
    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
    };
  }

  return {
    play(song: Song) {
      clear();
      isPlaying = true;

      const begin = (ctx: AudioContext): void => {
        const songStart = ctx.currentTime + SCHEDULE_LATENCY_SEC;
        let scheduledUntil = songStart;
        timer = setInterval(() => {
          const windowFrom = scheduledUntil - songStart;
          const windowTo = ctx.currentTime + LOOKAHEAD_SEC - songStart;
          const notes = scheduleWindow(song, windowFrom, windowTo);
          for (const note of notes) {
            scheduleVoice({ ...note, atSec: note.atSec + songStart }, ctx);
          }
          scheduledUntil = ctx.currentTime + LOOKAHEAD_SEC;
        }, TICK_MS);
      };

      const ctx = audio.context();
      if (ctx) {
        begin(ctx);
        return;
      }

      // Not unlocked yet: poll until a context exists, then start.
      const waitTimer: ReturnType<typeof setInterval> = setInterval(() => {
        const readyCtx = audio.context();
        if (readyCtx) {
          clearInterval(waitTimer);
          if (isPlaying) begin(readyCtx);
        }
      }, TICK_MS);
      timer = waitTimer;
    },
    stop() {
      clear();
    },
    playing() {
      return isPlaying;
    },
  };
}
