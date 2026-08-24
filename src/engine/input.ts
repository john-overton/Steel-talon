// Keyboard polled into one state object; game code reads state, never events.
// Gamepad and touch are deferred (spec §6).
export interface Input {
  up: boolean; down: boolean; left: boolean; right: boolean;
  fire: boolean; special: boolean; start: boolean;
}

const BINDINGS: Record<string, keyof Input> = {
  ArrowUp: 'up', KeyW: 'up',
  ArrowDown: 'down', KeyS: 'down',
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
  KeyZ: 'fire', KeyJ: 'fire',
  KeyX: 'special', KeyK: 'special',
  Enter: 'start',
};

export interface InputSource {
  state: Input;
  onKey(code: string, down: boolean): void;
  attach(target: EventTarget): void;
}

export function createInput(): InputSource {
  const state: Input = {
    up: false, down: false, left: false, right: false,
    fire: false, special: false, start: false,
  };
  const onKey = (code: string, down: boolean): void => {
    const action = BINDINGS[code];
    if (action) state[action] = down;
  };
  return {
    state,
    onKey,
    attach(target) {
      target.addEventListener('keydown', (e) => onKey((e as KeyboardEvent).code, true));
      target.addEventListener('keyup', (e) => onKey((e as KeyboardEvent).code, false));
    },
  };
}
