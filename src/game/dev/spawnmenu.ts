// Pure spawn-palette state: open/closed + cursor. The sandbox scene owns
// edge detection and rendering; this module owns only the transitions.
export interface SpawnMenuState { open: boolean; cursor: number; }
export interface SpawnMenuEdges { toggle: boolean; up: boolean; down: boolean; confirm: boolean; close: boolean; }
export type SpawnMenuAction = 'none' | number;

export function createSpawnMenu(): SpawnMenuState {
  return { open: false, cursor: 0 };
}

export function tickSpawnMenu(s: SpawnMenuState, e: SpawnMenuEdges, count: number): SpawnMenuAction {
  if (e.toggle) {
    s.open = !s.open;
    if (s.open) s.cursor = 0;
    return 'none';
  }
  if (!s.open) return 'none';
  if (e.close) { s.open = false; return 'none'; }
  if (e.up) s.cursor = (s.cursor + count - 1) % count;
  if (e.down) s.cursor = (s.cursor + 1) % count;
  if (e.confirm) return s.cursor;
  return 'none';
}
