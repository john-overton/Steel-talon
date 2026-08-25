import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../engine/rng';
import { createWorld } from '../entities';
import { SANDBOX_SPAWNS } from './spawns';

describe('sandbox spawn registry', () => {
  it('covers every enemy and pickup kind with unique labels', () => {
    const labels = SANDBOX_SPAWNS.map((e) => e.label);
    expect(new Set(labels).size).toBe(labels.length);
    expect(labels).toEqual(
      expect.arrayContaining(['BOAT', 'DELTA', 'MISSILE CRATE', 'MINIGUN PICKUP', 'ROCKET PICKUP', 'SALVAGE']),
    );
  });

  it('every entry spawns exactly one live object into the world', () => {
    for (const entry of SANDBOX_SPAWNS) {
      const w = createWorld(mulberry32(1));
      entry.spawn(w, 320, 100);
      const alive = w.enemies.countAlive() + w.pickups.countAlive();
      expect(alive, entry.label).toBe(1);
    }
  });
});
