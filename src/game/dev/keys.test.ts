import { describe, expect, it } from 'vitest';
import { createDevKeys } from './keys';

describe('dev keys', () => {
  it('latches F1/F2/Tab and consumes each press exactly once', () => {
    const k = createDevKeys();
    expect(k.consume('sandbox')).toBe(false);
    k.onKey('F1', true);
    expect(k.consume('sandbox')).toBe(true);
    expect(k.consume('sandbox')).toBe(false); // consumed
    k.onKey('F2', true);
    k.onKey('Tab', true);
    expect(k.consume('explorer')).toBe(true);
    expect(k.consume('menu')).toBe(true);
  });

  it('keyup and unbound keys do not latch', () => {
    const k = createDevKeys();
    k.onKey('F1', false);
    k.onKey('KeyQ', true);
    expect(k.consume('sandbox')).toBe(false);
    expect(k.consume('explorer')).toBe(false);
    expect(k.consume('menu')).toBe(false);
  });
});
