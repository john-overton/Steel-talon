// Dev tools entry: only ever loaded via a DEV-guarded dynamic import in
// main.ts, so the whole src/game/dev/ tree is absent from prod builds.
import type { AudioSystem } from '../../engine/audio';
import type { InputSource } from '../../engine/input';
import type { Camera } from '../../engine/renderer';
import type { Scene } from '../../engine/scene';
import type { Sequencer } from '../../engine/sequencer';
import type { Tilemap } from '../../engine/tilemap';
import { createExplorerScene } from './explorer';
import { createDevKeys } from './keys';
import { createSandboxScene } from './sandbox';

export interface DevToolsDeps {
  input: InputSource;
  audio: AudioSystem;
  sequencer: Sequencer;
  camera: Camera;
  water: Tilemap;
  makeRng(): () => number;
  switchTo(s: Scene): void;
  toTitle(): void;
}

export interface DevTools {
  poll(): 'sandbox' | 'explorer' | null;
  open(screen: 'sandbox' | 'explorer'): void;
}

export function createDevTools(deps: DevToolsDeps): DevTools {
  const devKeys = createDevKeys();
  devKeys.attach(window);
  const sandbox = createSandboxScene({
    input: deps.input,
    audio: deps.audio,
    sequencer: deps.sequencer,
    camera: deps.camera,
    water: deps.water,
    makeRng: deps.makeRng,
    devKeys,
    onExit: () => deps.toTitle(),
  });
  const explorer = createExplorerScene({ input: deps.input, onExit: () => deps.toTitle() });
  return {
    poll() {
      if (devKeys.consume('sandbox')) return 'sandbox';
      if (devKeys.consume('explorer')) return 'explorer';
      return null;
    },
    open(screen) {
      deps.switchTo(screen === 'sandbox' ? sandbox : explorer);
    },
  };
}
