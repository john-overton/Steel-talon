// Seeded Level 1 wave script (engine spec build order, milestone 7):
// generateWaveScript builds the whole level's spawn timeline once, up
// front, from the seeded rng; tickWaves drains it deterministically as
// the camera scrolls. No allocation happens in tickWaves.
import { CAM_MARGIN, spawnBoat, spawnDelta, spawnPickup, type World } from './entities';
import { HEIGHT, WIDTH } from '../engine/renderer';

export const SCROLL_SPEED = 120; // px/s, camera scroll rate
export const LEVEL_LENGTH = 22_080; // px: HEIGHT + 180 s * 120 px/s

export type SpawnKind = 'boat' | 'delta' | 'missileCrate' | 'minigunPickup' | 'rocketPickup';

export interface SpawnEvent { atY: number; kind: SpawnKind; x: number; }

const LANE_MIN = 48;
const LANE_MAX = WIDTH - 48;

function clampX(x: number): number {
  return Math.min(LANE_MAX, Math.max(LANE_MIN, x));
}

function laneX(rng: () => number): number {
  return LANE_MIN + rng() * (LANE_MAX - LANE_MIN);
}

export function generateWaveScript(rng: () => number, levelLength: number): SpawnEvent[] {
  const events: SpawnEvent[] = [];
  const timeToY = (t: number) => levelLength - HEIGHT - SCROLL_SPEED * t - CAM_MARGIN;
  const jitter = (t: number, j: number) => t + (rng() * 2 - 1) * j;

  // Band 1: warm-up (4 <= t < 40) — one boat every 4s +/- 1s.
  for (let t = 4; t < 40; t += 4) {
    events.push({ atY: timeToY(jitter(t, 1)), kind: 'boat', x: clampX(laneX(rng)) });
  }
  events.push({ atY: timeToY(40), kind: 'minigunPickup', x: WIDTH / 2 });

  // Band 2: boat pairs (40 <= t < 80) — a pair every 6s +/- 1s.
  for (let t = 40; t < 80; t += 6) {
    const jt = jitter(t, 1);
    const x = laneX(rng);
    events.push({ atY: timeToY(jt), kind: 'boat', x: clampX(x - 160) });
    events.push({ atY: timeToY(jt + 0.4), kind: 'boat', x: clampX(x + 160) });
  }
  events.push({ atY: timeToY(jitter(55, 3)), kind: 'missileCrate', x: clampX(laneX(rng)) });
  events.push({ atY: timeToY(jitter(70, 3)), kind: 'missileCrate', x: clampX(laneX(rng)) });

  // Band 3: deltas join (80 <= t < 120) — delta every 7s +/- 1.5s AND boat every 8s +/- 1s.
  for (let t = 80; t < 120; t += 7) {
    events.push({ atY: timeToY(jitter(t, 1.5)), kind: 'delta', x: clampX(laneX(rng)) });
  }
  for (let t = 80; t < 120; t += 8) {
    events.push({ atY: timeToY(jitter(t, 1)), kind: 'boat', x: clampX(laneX(rng)) });
  }
  events.push({ atY: timeToY(90), kind: 'rocketPickup', x: WIDTH / 2 });

  // Band 4: combined arms (120 <= t < 170) — boat trio every 10s +/- 1s AND
  // delta pair every 9s +/- 1.5s.
  for (let t = 120; t < 170; t += 10) {
    const jt = jitter(t, 1);
    const x = laneX(rng);
    events.push({ atY: timeToY(jt), kind: 'boat', x: clampX(x - 160) });
    events.push({ atY: timeToY(jt + 0.3), kind: 'boat', x: clampX(x) });
    events.push({ atY: timeToY(jt + 0.6), kind: 'boat', x: clampX(x + 160) });
  }
  for (let t = 120; t < 170; t += 9) {
    const jt = jitter(t, 1.5);
    const x = laneX(rng);
    events.push({ atY: timeToY(jt), kind: 'delta', x: clampX(x) });
    events.push({ atY: timeToY(jt + 0.5), kind: 'delta', x: clampX(WIDTH - x) });
  }
  events.push({ atY: timeToY(jitter(140, 3)), kind: 'missileCrate', x: clampX(laneX(rng)) });

  // Band 5: breather (170 <= t <= 180) — nothing.

  events.sort((a, b) => b.atY - a.atY);
  return events;
}

export interface WaveRunner { script: SpawnEvent[]; next: number; }

export function createWaveRunner(script: SpawnEvent[]): WaveRunner {
  return { script, next: 0 };
}

export function tickWaves(w: World, runner: WaveRunner, camY: number): void {
  while (runner.next < runner.script.length && runner.script[runner.next].atY >= camY - CAM_MARGIN) {
    const ev = runner.script[runner.next];
    switch (ev.kind) {
      case 'boat':
        spawnBoat(w, ev.x, ev.atY);
        break;
      case 'delta':
        spawnDelta(w, ev.x, ev.atY);
        break;
      case 'missileCrate':
        spawnPickup(w, 'crate', ev.x, ev.atY);
        break;
      case 'minigunPickup':
        spawnPickup(w, 'minigun', ev.x, ev.atY);
        break;
      case 'rocketPickup':
        spawnPickup(w, 'rockets', ev.x, ev.atY);
        break;
    }
    runner.next++;
  }
}
