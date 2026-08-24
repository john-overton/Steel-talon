// Synthesized SFX (engine spec §5): one oscillator + gain envelope per
// blip, no sample files. The envelope math is pure and tested; the Web
// Audio calls stay thin and are verified by ear in the dev server.
export interface BlipParams {
  type: OscillatorType;
  startFreq: number; endFreq: number; // Hz, exponential sweep
  duration: number;                   // seconds
  volume: number;                     // 0–1 peak gain
}

export interface BlipEnvelope {
  attackEnd: number; // seconds: gain reaches peak
  decayEnd: number;  // seconds: gain reaches floor, oscillator stops
  peak: number;
  floor: number;
  startFreq: number;
  endFreq: number;
}

export function blipEnvelope(p: BlipParams): BlipEnvelope {
  const decayEnd = Math.max(0.01, p.duration);
  return {
    attackEnd: Math.min(0.005, decayEnd / 2),
    decayEnd,
    peak: Math.min(1, Math.max(0.001, p.volume)),
    floor: 0.001,
    startFreq: Math.max(1, p.startFreq),
    endFreq: Math.max(1, p.endFreq),
  };
}

export interface AudioSystem {
  unlock(): void;            // create/resume the AudioContext; call on a user gesture
  blip(p: BlipParams): void; // no-op until unlocked
  // white-noise burst through a bandpass filter (default 800 Hz) starting at
  // AudioContext time whenSec (default: now); no-op until unlocked
  noise(durationSec: number, volume: number, bandFreq?: number, whenSec?: number): void;
  context(): AudioContext | null; // null until unlocked; the sequencer schedules against this
}

export function createAudio(): AudioSystem {
  let ctx: AudioContext | null = null;
  let noiseBuffer: AudioBuffer | null = null;
  return {
    unlock() {
      if (!ctx) ctx = new AudioContext();
      if (ctx.state === 'suspended') void ctx.resume();
    },
    context() {
      return ctx;
    },
    noise(durationSec, volume, bandFreq = 800, whenSec) {
      if (!ctx) return;
      if (!noiseBuffer) {
        const rate = ctx.sampleRate;
        noiseBuffer = ctx.createBuffer(1, rate, rate);
        const data = noiseBuffer.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      }
      const env = blipEnvelope({ type: 'square', startFreq: 1, endFreq: 1, duration: durationSec, volume });
      const t0 = whenSec ?? ctx.currentTime;
      const src = ctx.createBufferSource();
      src.buffer = noiseBuffer;
      src.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = bandFreq;
      filter.Q.value = 1;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(env.floor, t0);
      gain.gain.exponentialRampToValueAtTime(env.peak, t0 + env.attackEnd);
      gain.gain.exponentialRampToValueAtTime(env.floor, t0 + env.decayEnd);
      src.connect(filter).connect(gain).connect(ctx.destination);
      src.start(t0);
      src.stop(t0 + env.decayEnd + 0.02);
      src.onended = () => {
        src.disconnect();
        filter.disconnect();
        gain.disconnect();
      };
    },
    blip(p) {
      if (!ctx) return;
      const env = blipEnvelope(p);
      const t0 = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = p.type;
      osc.frequency.setValueAtTime(env.startFreq, t0);
      osc.frequency.exponentialRampToValueAtTime(env.endFreq, t0 + env.decayEnd);
      gain.gain.setValueAtTime(env.floor, t0);
      gain.gain.exponentialRampToValueAtTime(env.peak, t0 + env.attackEnd);
      gain.gain.exponentialRampToValueAtTime(env.floor, t0 + env.decayEnd);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + env.decayEnd + 0.02);
      osc.onended = () => {
        osc.disconnect();
        gain.disconnect();
      };
    },
  };
}
