import { describe, expect, it } from 'vitest';
import { createLoop, STEP } from './loop';

function harness() {
  const calls: string[] = [];
  const loop = createLoop(
    (dt) => calls.push(`u${dt.toFixed(4)}`),
    () => calls.push('r'),
  );
  return { calls, loop };
}

describe('createLoop', () => {
  it('runs zero updates on the first frame, renders once', () => {
    const { calls, loop } = harness();
    loop.frame(0);
    expect(calls).toEqual(['r']);
  });

  it('runs one update per elapsed STEP', () => {
    const { calls, loop } = harness();
    loop.frame(0);
    loop.frame(STEP * 3);
    expect(calls.filter((c) => c.startsWith('u'))).toHaveLength(3);
  });

  it('accumulates fractional frames until a full step fits', () => {
    const { calls, loop } = harness();
    loop.frame(0);
    loop.frame(STEP * 0.6); // 0.6 steps — no update yet
    expect(calls.filter((c) => c.startsWith('u'))).toHaveLength(0);
    loop.frame(STEP * 1.2); // now 1.2 accumulated — one update
    expect(calls.filter((c) => c.startsWith('u'))).toHaveLength(1);
  });

  it('clamps a huge frame gap to 250ms (background tab)', () => {
    const { calls, loop } = harness();
    loop.frame(0);
    loop.frame(10_000);
    // 250ms clamp / STEP = 15 updates. Asserted as a literal because
    // Math.floor(250 / STEP) is 14 in floating point (250 / STEP === 14.999999999999998).
    expect(calls.filter((c) => c.startsWith('u'))).toHaveLength(15);
  });

  it('always passes dt = STEP/1000 seconds', () => {
    const { calls, loop } = harness();
    loop.frame(0);
    loop.frame(STEP);
    expect(calls[1]).toBe(`u${(STEP / 1000).toFixed(4)}`);
  });

  it('renders exactly once per frame call', () => {
    const { calls, loop } = harness();
    loop.frame(0);
    loop.frame(STEP * 5);
    expect(calls.filter((c) => c === 'r')).toHaveLength(2);
  });
});
