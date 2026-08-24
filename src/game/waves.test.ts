import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../engine/rng';
import { createWorld } from './entities';
import {
  createWaveRunner, generateWaveScript, LEVEL_LENGTH, tickWaves,
} from './waves';

describe('generateWaveScript', () => {
  const script = generateWaveScript(mulberry32(0xc0ffee), LEVEL_LENGTH);

  it('is sorted by atY descending (earliest event first)', () => {
    for (let i = 1; i < script.length; i++) {
      expect(script[i].atY).toBeLessThanOrEqual(script[i - 1].atY);
    }
  });

  it('same seed → identical script; different seed differs', () => {
    expect(generateWaveScript(mulberry32(0xc0ffee), LEVEL_LENGTH)).toEqual(script);
    expect(generateWaveScript(mulberry32(0xbeef), LEVEL_LENGTH)).not.toEqual(script);
  });

  it('has a plausible event population', () => {
    expect(script.length).toBeGreaterThanOrEqual(45);
    expect(script.length).toBeLessThanOrEqual(90);
    const kinds = script.map((e) => e.kind);
    expect(kinds.filter((k) => k === 'minigunPickup')).toHaveLength(1);
    expect(kinds.filter((k) => k === 'rocketPickup')).toHaveLength(1);
    expect(kinds.filter((k) => k === 'missileCrate')).toHaveLength(3);
    expect(kinds.filter((k) => k === 'boat').length).toBeGreaterThan(20);
    expect(kinds.filter((k) => k === 'delta').length).toBeGreaterThan(8);
  });

  it('minigun pickup comes before the rocket pickup', () => {
    const mg = script.findIndex((e) => e.kind === 'minigunPickup');
    const rk = script.findIndex((e) => e.kind === 'rocketPickup');
    expect(mg).toBeGreaterThanOrEqual(0);
    expect(mg).toBeLessThan(rk);
  });

  it('all x positions are inside the lane', () => {
    for (const e of script) {
      expect(e.x).toBeGreaterThanOrEqual(48);
      expect(e.x).toBeLessThanOrEqual(592);
    }
  });

  it('all events fit inside the level strip', () => {
    for (const e of script) {
      expect(e.atY).toBeLessThanOrEqual(LEVEL_LENGTH);
      expect(e.atY).toBeGreaterThanOrEqual(-64);
    }
  });

  it('golden: seed 0xc0ffee script shape is pinned', () => {
    expect(script.length).toBe(66);
    expect(script[0]).toEqual({ atY: 21170.926037993282, kind: 'boat', x: 410.3638381585479 });
    expect(script[script.length - 1]).toEqual({ atY: 1692.8144727684557, kind: 'delta', x: 56.92661539465189 });
  });
});

describe('tickWaves', () => {
  it('spawns events as the camera passes and never re-fires them', () => {
    const rng = mulberry32(0xc0ffee);
    const w = createWorld(rng);
    const script = generateWaveScript(mulberry32(0xc0ffee), LEVEL_LENGTH);
    const runner = createWaveRunner(script);
    const first = script[0];
    tickWaves(w, runner, first.atY + 100); // camera well before the first event
    expect(w.enemies.countAlive() + w.pickups.countAlive()).toBe(0);
    tickWaves(w, runner, first.atY + 32);  // exactly at the trigger line
    expect(runner.next).toBeGreaterThan(0);
    const spawned = runner.next;
    tickWaves(w, runner, first.atY + 32);  // same camera → nothing new
    expect(runner.next).toBe(spawned);
  });

  it('a full camera sweep consumes the entire script', () => {
    const rng = mulberry32(0xc0ffee);
    const w = createWorld(rng);
    const script = generateWaveScript(mulberry32(0xc0ffee), LEVEL_LENGTH);
    const runner = createWaveRunner(script);
    // Sweep camY from start to 0; drain pools between ticks so they never fill.
    for (let camY = LEVEL_LENGTH - 480; camY >= 0; camY -= 60) {
      tickWaves(w, runner, camY);
      w.enemies.reset();
      w.pickups.reset();
    }
    tickWaves(w, runner, 0);
    expect(runner.next).toBe(script.length);
  });
});
