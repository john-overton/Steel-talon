import { describe, expect, it } from 'vitest';
import { createInput } from './input';

describe('createInput', () => {
  it('starts with everything released', () => {
    const { state } = createInput();
    expect(state).toEqual({
      up: false, down: false, left: false, right: false,
      fire: false, special: false, start: false,
      weapon1: false, weapon2: false, weapon3: false, weapon4: false,
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
      weapon1: false, weapon2: false, weapon3: false, weapon4: false,
    });
  });
});

describe('weapon keys', () => {
  it('Digit and Numpad rows both map to weapon slots', () => {
    const input = createInput();
    input.onKey('Digit1', true);
    input.onKey('Numpad3', true);
    expect(input.state.weapon1).toBe(true);
    expect(input.state.weapon3).toBe(true);
    input.onKey('Digit1', false);
    expect(input.state.weapon1).toBe(false);
  });
});

describe('consumeAnyKey', () => {
  it('reports a keydown once, then resets', () => {
    const input = createInput();
    expect(input.consumeAnyKey()).toBe(false);
    input.onKey('KeyQ', true); // unbound key still counts
    expect(input.consumeAnyKey()).toBe(true);
    expect(input.consumeAnyKey()).toBe(false);
  });

  it('keyups do not count', () => {
    const input = createInput();
    input.onKey('KeyZ', false);
    expect(input.consumeAnyKey()).toBe(false);
  });
});

describe('attach', () => {
  it('a pointerdown gesture sets the anyKey latch (arcade coin-drop)', () => {
    const input = createInput();
    const handlers: Record<string, (e: unknown) => void> = {};
    const stubTarget = {
      addEventListener(type: string, fn: (e: unknown) => void) {
        handlers[type] = fn;
      },
    };
    input.attach(stubTarget as unknown as EventTarget);
    expect(handlers.pointerdown).toBeDefined();
    handlers.pointerdown({});
    expect(input.consumeAnyKey()).toBe(true);
  });
});
