import { describe, expect, it } from 'vitest';
import { createPool } from './pool';

interface Thing { alive: boolean; n: number; }
const factory = (): Thing => ({ alive: false, n: 0 });

describe('createPool', () => {
  it('allocates size items up front, all dead', () => {
    const pool = createPool(4, factory);
    expect(pool.items).toHaveLength(4);
    expect(pool.countAlive()).toBe(0);
  });

  it('spawn marks an item alive and returns it', () => {
    const pool = createPool(2, factory);
    const a = pool.spawn();
    expect(a?.alive).toBe(true);
    expect(pool.countAlive()).toBe(1);
  });

  it('spawn returns undefined when exhausted', () => {
    const pool = createPool(2, factory);
    pool.spawn();
    pool.spawn();
    expect(pool.spawn()).toBeUndefined();
  });

  it('reuses dead slots without allocating', () => {
    const pool = createPool(2, factory);
    const a = pool.spawn()!;
    pool.spawn();
    a.alive = false;
    const c = pool.spawn();
    expect(c).toBe(a); // same object, recycled
    expect(pool.items).toHaveLength(2);
  });

  it('forEachAlive visits only living items', () => {
    const pool = createPool(3, factory);
    const a = pool.spawn()!;
    a.n = 7;
    const visited: number[] = [];
    pool.forEachAlive((t) => visited.push(t.n));
    expect(visited).toEqual([7]);
  });

  it('reset kills everything', () => {
    const pool = createPool(3, factory);
    pool.spawn();
    pool.spawn();
    pool.reset();
    expect(pool.countAlive()).toBe(0);
  });

  it('factory items are forced dead even if created alive', () => {
    const pool = createPool(2, () => ({ alive: true }));
    expect(pool.countAlive()).toBe(0);
  });
});
