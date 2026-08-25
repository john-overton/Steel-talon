import { describe, expect, it } from 'vitest';
import { createSpawnMenu, tickSpawnMenu, type SpawnMenuEdges } from './spawnmenu';

const idle = (): SpawnMenuEdges => ({ toggle: false, up: false, down: false, confirm: false, close: false });

describe('spawn menu', () => {
  it('toggle opens with the cursor reset, toggle again closes', () => {
    const s = createSpawnMenu();
    expect(s.open).toBe(false);
    tickSpawnMenu(s, { ...idle(), toggle: true }, 6);
    expect(s.open).toBe(true);
    expect(s.cursor).toBe(0);
    tickSpawnMenu(s, { ...idle(), toggle: true }, 6);
    expect(s.open).toBe(false);
  });

  it('up/down wrap over the entry count', () => {
    const s = createSpawnMenu();
    tickSpawnMenu(s, { ...idle(), toggle: true }, 3);
    tickSpawnMenu(s, { ...idle(), up: true }, 3);
    expect(s.cursor).toBe(2); // wrapped
    tickSpawnMenu(s, { ...idle(), down: true }, 3);
    expect(s.cursor).toBe(0);
  });

  it('confirm returns the cursor index and stays open for repeat spawns', () => {
    const s = createSpawnMenu();
    tickSpawnMenu(s, { ...idle(), toggle: true }, 6);
    tickSpawnMenu(s, { ...idle(), down: true }, 6);
    expect(tickSpawnMenu(s, { ...idle(), confirm: true }, 6)).toBe(1);
    expect(s.open).toBe(true);
  });

  it('close closes; input while closed is a no-op returning none', () => {
    const s = createSpawnMenu();
    tickSpawnMenu(s, { ...idle(), toggle: true }, 6);
    tickSpawnMenu(s, { ...idle(), close: true }, 6);
    expect(s.open).toBe(false);
    expect(tickSpawnMenu(s, { ...idle(), up: true, confirm: true }, 6)).toBe('none');
    expect(s.cursor).toBe(0);
  });
});
