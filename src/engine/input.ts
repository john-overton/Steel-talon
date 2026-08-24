// Keyboard polled into one state object; game code reads state, never events.
// Gamepad and touch are deferred (spec §6).
export interface Input {
  up: boolean; down: boolean; left: boolean; right: boolean;
  fire: boolean; special: boolean; start: boolean; pause: boolean;
  weapon1: boolean; weapon2: boolean; weapon3: boolean; weapon4: boolean;
}

const BINDINGS: Record<string, keyof Input> = {
  ArrowUp: 'up', KeyW: 'up',
  ArrowDown: 'down', KeyS: 'down',
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
  KeyZ: 'fire', KeyJ: 'fire',
  KeyX: 'special', KeyK: 'special',
  Enter: 'start', NumpadEnter: 'start',
  Escape: 'pause',
  Digit1: 'weapon1', Numpad1: 'weapon1',
  Digit2: 'weapon2', Numpad2: 'weapon2',
  Digit3: 'weapon3', Numpad3: 'weapon3',
  Digit4: 'weapon4', Numpad4: 'weapon4',
};

export interface InputSource {
  state: Input;
  onKey(code: string, down: boolean): void;
  /** True once per keydown (bound or not) seen since the previous call. */
  consumeAnyKey(): boolean;
  attach(target: EventTarget): void;
}

export function createInput(): InputSource {
  const state: Input = {
    up: false, down: false, left: false, right: false,
    fire: false, special: false, start: false, pause: false,
    weapon1: false, weapon2: false, weapon3: false, weapon4: false,
  };
  // Latched by any keydown so "press any key" prompts do not need their own bindings.
  let anyKey = false;
  const onKey = (code: string, down: boolean): void => {
    if (down) anyKey = true;
    const action = BINDINGS[code];
    if (action) state[action] = down;
  };
  return {
    state,
    onKey,
    consumeAnyKey() {
      const seen = anyKey;
      anyKey = false;
      return seen;
    },
    attach(target) {
      target.addEventListener('keydown', (e) => {
        const ke = e as KeyboardEvent;
        if (BINDINGS[ke.code]) ke.preventDefault(); // arrows must not scroll the page
        onKey(ke.code, true);
      });
      target.addEventListener('keyup', (e) => onKey((e as KeyboardEvent).code, false));
      // Arcade coin-drop: a click/tap counts as "PRESS ANY KEY" on the
      // title screen too — it only sets the anyKey latch, no bound action.
      target.addEventListener('pointerdown', () => {
        anyKey = true;
      });
      // Alt-tab with a key held would leave it stuck down: clear on blur.
      target.addEventListener('blur', () => {
        for (const key of Object.keys(state) as Array<keyof Input>) state[key] = false;
      });
    },
  };
}
