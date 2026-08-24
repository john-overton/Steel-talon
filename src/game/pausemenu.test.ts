import { describe, expect, it } from 'vitest';
import { createPauseMenu, pauseMenuMoved, tickPauseMenu } from './pausemenu';

const edges = (o: Partial<{ up: boolean; down: boolean; confirm: boolean; pause: boolean }> = {}) =>
  ({ up: false, down: false, confirm: false, pause: false, ...o });

describe('pause menu', () => {
  it('starts on CONTINUE', () => {
    expect(createPauseMenu().cursor).toBe(0);
  });

  it('down moves to ABANDON, down again wraps to CONTINUE', () => {
    const m = createPauseMenu();
    expect(tickPauseMenu(m, edges({ down: true }))).toBeNull();
    expect(m.cursor).toBe(1);
    tickPauseMenu(m, edges({ down: true }));
    expect(m.cursor).toBe(0);
  });

  it('up from CONTINUE wraps to ABANDON', () => {
    const m = createPauseMenu();
    tickPauseMenu(m, edges({ up: true }));
    expect(m.cursor).toBe(1);
  });

  it('confirm routes by cursor', () => {
    const m = createPauseMenu();
    expect(tickPauseMenu(m, edges({ confirm: true }))).toBe('continue');
    m.cursor = 1;
    expect(tickPauseMenu(m, edges({ confirm: true }))).toBe('abandon');
  });

  it('pause edge resumes regardless of cursor, and wins over confirm', () => {
    const m = createPauseMenu();
    m.cursor = 1;
    expect(tickPauseMenu(m, edges({ pause: true }))).toBe('continue');
    expect(tickPauseMenu(m, edges({ pause: true, confirm: true }))).toBe('continue');
  });

  it('no edges → null, cursor unmoved', () => {
    const m = createPauseMenu();
    expect(tickPauseMenu(m, edges())).toBeNull();
    expect(m.cursor).toBe(0);
  });

  it('pauseMenuMoved detects cursor change', () => {
    expect(pauseMenuMoved(0, 1)).toBe(true);
    expect(pauseMenuMoved(1, 1)).toBe(false);
  });
});
