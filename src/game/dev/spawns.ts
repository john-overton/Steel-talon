// Dev-only sandbox spawn registry. One line per spawnable thing; the
// spawn palette lists these labels in order. Add new enemies here.
import { spawnBoat, spawnDelta, spawnPickup, type World } from '../entities';

export interface SpawnEntry {
  label: string;
  spawn(w: World, x: number, y: number): void;
}

export const SANDBOX_SPAWNS: readonly SpawnEntry[] = [
  { label: 'BOAT', spawn: (w, x, y) => void spawnBoat(w, x, y) },
  { label: 'DELTA', spawn: (w, x, y) => void spawnDelta(w, x, y) },
  { label: 'MISSILE CRATE', spawn: (w, x, y) => void spawnPickup(w, 'crate', x, y) },
  { label: 'MINIGUN PICKUP', spawn: (w, x, y) => void spawnPickup(w, 'minigun', x, y) },
  { label: 'ROCKET PICKUP', spawn: (w, x, y) => void spawnPickup(w, 'rockets', x, y) },
  { label: 'SALVAGE', spawn: (w, x, y) => void spawnPickup(w, 'salvage', x, y) },
];
