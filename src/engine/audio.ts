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
}

export function createAudio(): AudioSystem {
  let ctx: AudioContext | null = null;
  return {
    unlock() {
      if (!ctx) ctx = new AudioContext();
      if (ctx.state === 'suspended') void ctx.resume();
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
