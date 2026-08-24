// Pause-menu state machine, pure and headless: the TOP scene feeds it
// edge-detected input and acts on the returned action. Two items only:
// 0 = CONTINUE, 1 = ABANDON RUN.
export type PauseAction = 'continue' | 'abandon' | null;

export interface PauseMenuState { cursor: 0 | 1 }

export interface PauseEdges { up: boolean; down: boolean; confirm: boolean; pause: boolean }

export function createPauseMenu(): PauseMenuState {
  return { cursor: 0 };
}

export function tickPauseMenu(m: PauseMenuState, edges: PauseEdges): PauseAction {
  if (edges.pause) return 'continue'; // Escape resumes; deliberate confirm required to abandon
  if (edges.up || edges.down) m.cursor = m.cursor === 0 ? 1 : 0;
  if (edges.confirm) return m.cursor === 0 ? 'continue' : 'abandon';
  return null;
}

export function pauseMenuMoved(before: 0 | 1, after: 0 | 1): boolean {
  return before !== after;
}
