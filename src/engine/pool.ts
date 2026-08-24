// Fixed-size object pool (engine spec §7): everything is allocated at
// creation; spawn() recycles dead slots and never allocates.
export interface Pool<T extends { alive: boolean }> {
  items: readonly T[];
  spawn(): T | undefined;
  forEachAlive(fn: (item: T) => void): void;
  countAlive(): number;
  reset(): void;
}

export function createPool<T extends { alive: boolean }>(
  size: number,
  factory: () => T,
): Pool<T> {
  const items: T[] = Array.from({ length: size }, () => {
    const item = factory();
    item.alive = false;
    return item;
  });
  return {
    items,
    spawn() {
      for (const item of items) {
        if (!item.alive) {
          item.alive = true;
          return item;
        }
      }
      return undefined;
    },
    forEachAlive(fn) {
      for (const item of items) if (item.alive) fn(item);
    },
    countAlive() {
      let n = 0;
      for (const item of items) if (item.alive) n++;
      return n;
    },
    reset() {
      for (const item of items) item.alive = false;
    },
  };
}
