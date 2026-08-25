// Dev sandbox: the real TOP scene with waves off, scroll frozen, the full
// arsenal, and a Tab spawn palette that drops any registry entry in.
import type { AudioSystem } from '../../engine/audio';
import type { InputSource } from '../../engine/input';
import { HEIGHT, WIDTH, type Camera } from '../../engine/renderer';
import type { Scene } from '../../engine/scene';
import type { Sequencer } from '../../engine/sequencer';
import type { Tilemap } from '../../engine/tilemap';
import type { World } from '../entities';
import { PALETTE } from '../palette';
import { createTopScene, type SandboxHooks } from '../scenes/top';
import type { DevKeys } from './keys';
import { createSpawnMenu, tickSpawnMenu, type SpawnMenuEdges } from './spawnmenu';
import { SANDBOX_SPAWNS } from './spawns';

const SPAWN_Y_OFFSET = 48; // px below the camera's top edge

export function createSandboxHooks(input: InputSource, devKeys: DevKeys): SandboxHooks {
  const menu = createSpawnMenu();
  // Reused every tick — no allocation in the hot loop.
  const edges: SpawnMenuEdges = { toggle: false, up: false, down: false, confirm: false, close: false };
  const prev = { up: false, down: false, start: false, pause: false };
  return {
    tick(world: World, playerX: number, camY: number): boolean {
      const s = input.state;
      const wasOpen = menu.open;
      edges.toggle = devKeys.consume('menu');
      edges.up = s.up && !prev.up;
      edges.down = s.down && !prev.down;
      edges.confirm = s.start && !prev.start;
      edges.close = s.pause && !prev.pause;
      prev.up = s.up; prev.down = s.down; prev.start = s.start; prev.pause = s.pause;
      const action = tickSpawnMenu(menu, edges, SANDBOX_SPAWNS.length);
      if (action !== 'none') {
        SANDBOX_SPAWNS[action].spawn(world, playerX, camY + SPAWN_Y_OFFSET);
      }
      // The tick a close happens still freezes, so the closing keypress
      // never leaks into gameplay (Esc would otherwise open the pause menu).
      return menu.open || wasOpen;
    },
    draw(ctx: CanvasRenderingContext2D): void {
      if (!menu.open) {
        ctx.font = '10px monospace';
        ctx.fillStyle = PALETTE[22];
        ctx.fillText('SANDBOX — TAB: SPAWN MENU', 8, HEIGHT - 8);
        return;
      }
      const w = 220;
      const h = SANDBOX_SPAWNS.length * 18 + 40;
      const x = WIDTH - w - 16;
      const y = 48;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
      ctx.fillRect(x, y, w, h);
      ctx.font = '12px monospace';
      ctx.fillStyle = PALETTE[8];
      ctx.fillText('SPAWN', x + 12, y + 20);
      SANDBOX_SPAWNS.forEach((entry, i) => {
        ctx.fillStyle = menu.cursor === i ? PALETTE[8] : PALETTE[22];
        ctx.fillText((menu.cursor === i ? '> ' : '  ') + entry.label, x + 12, y + 40 + i * 18);
      });
    },
  };
}

export interface SandboxDeps {
  input: InputSource;
  audio: AudioSystem;
  sequencer: Sequencer;
  camera: Camera;
  water: Tilemap;
  makeRng(): () => number;
  devKeys: DevKeys;
  onExit(): void;
}

export function createSandboxScene(deps: SandboxDeps): Scene {
  return createTopScene({
    input: deps.input,
    audio: deps.audio,
    sequencer: deps.sequencer,
    camera: deps.camera,
    water: deps.water,
    makeRng: deps.makeRng,
    sandbox: createSandboxHooks(deps.input, deps.devKeys),
    onExit: () => deps.onExit(),
    onAbandon: () => deps.onExit(),
  });
}
