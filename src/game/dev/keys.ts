// Dev-only key latches (F1/F2/Tab). Separate from engine input so the
// engine's binding table never carries dev keys into the prod build.
export type DevKey = 'sandbox' | 'explorer' | 'menu';

const BINDINGS: Record<string, DevKey> = { F1: 'sandbox', F2: 'explorer', Tab: 'menu' };

export interface DevKeys {
  onKey(code: string, down: boolean): void;
  consume(key: DevKey): boolean;
  attach(target: EventTarget): void;
}

export function createDevKeys(): DevKeys {
  const latched: Record<DevKey, boolean> = { sandbox: false, explorer: false, menu: false };
  const onKey = (code: string, down: boolean): void => {
    const key = BINDINGS[code];
    if (key && down) latched[key] = true;
  };
  return {
    onKey,
    consume(key) {
      const seen = latched[key];
      latched[key] = false;
      return seen;
    },
    attach(target) {
      target.addEventListener('keydown', (e) => {
        const ke = e as KeyboardEvent;
        if (BINDINGS[ke.code]) ke.preventDefault(); // Tab must not move focus
        onKey(ke.code, true);
      });
    },
  };
}
