import { describe, expect, it } from 'vitest';
import { createInput } from './input';

describe('createInput', () => {
  it('starts with everything released', () => {
    const { state } = createInput();
    expect(state).toEqual({
      up: false, down: false, left: false, right: false,
      fire: false, special: false, start: false,
    });
  });

  it('maps arrows and WASD to the same directions', () => {
    const input = createInput();
    input.onKey('ArrowUp', true);
    expect(input.state.up).toBe(true);
    input.onKey('ArrowUp', false);
    input.onKey('KeyW', true);
    expect(input.state.up).toBe(true);
    input.onKey('KeyA', true);
    input.onKey('ArrowRight', true);
    expect(input.state.left).toBe(true);
    expect(input.state.right).toBe(true);
  });

  it('maps Z/J to fire, X/K to special, Enter to start', () => {
    const input = createInput();
    input.onKey('KeyZ', true);
    input.onKey('KeyK', true);
    input.onKey('Enter', true);
    expect(input.state.fire).toBe(true);
    expect(input.state.special).toBe(true);
    expect(input.state.start).toBe(true);
    input.onKey('KeyZ', false);
    expect(input.state.fire).toBe(false);
    input.onKey('KeyJ', true);
    expect(input.state.fire).toBe(true);
  });

  it('ignores unmapped keys', () => {
    const input = createInput();
    input.onKey('KeyQ', true);
    expect(input.state).toEqual({
      up: false, down: false, left: false, right: false,
      fire: false, special: false, start: false,
    });
  });
});
