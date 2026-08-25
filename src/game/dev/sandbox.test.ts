import { describe, expect, it } from 'vitest';
import { createInput } from '../../engine/input';
import { mulberry32 } from '../../engine/rng';
import { createWorld } from '../entities';
import { createDevKeys } from './keys';
import { createSandboxHooks } from './sandbox';
import { SANDBOX_SPAWNS } from './spawns';

describe('sandbox hooks', () => {
  it('is transparent while the menu is closed', () => {
    const hooks = createSandboxHooks(createInput(), createDevKeys());
    const w = createWorld(mulberry32(1));
    expect(hooks.tick(w, 320, 1000)).toBe(false);
    expect(w.enemies.countAlive()).toBe(0);
  });

  it('Tab opens (frozen), Enter spawns the selected entry at the player lane, Tab closes', () => {
    const input = createInput();
    const devKeys = createDevKeys();
    const hooks = createSandboxHooks(input, devKeys);
    const w = createWorld(mulberry32(1));

    devKeys.onKey('Tab', true);
    expect(hooks.tick(w, 320, 1000)).toBe(true); // open = frozen

    input.onKey('Enter', true);
    expect(hooks.tick(w, 320, 1000)).toBe(true); // spawn happens, stays open
    input.onKey('Enter', false);
    expect(w.enemies.countAlive() + w.pickups.countAlive()).toBe(1);

    devKeys.onKey('Tab', true);
    expect(hooks.tick(w, 320, 1000)).toBe(true); // closing tick still frozen (swallows the edge)
    expect(hooks.tick(w, 320, 1000)).toBe(false); // next tick runs free
  });

  it('cursor navigation selects other registry entries', () => {
    const input = createInput();
    const devKeys = createDevKeys();
    const hooks = createSandboxHooks(input, devKeys);
    const w = createWorld(mulberry32(1));
    devKeys.onKey('Tab', true);
    hooks.tick(w, 320, 1000);
    input.onKey('ArrowDown', true);
    hooks.tick(w, 320, 1000); // cursor -> 1 (DELTA)
    input.onKey('ArrowDown', false);
    input.onKey('Enter', true);
    hooks.tick(w, 320, 1000);
    let kind = '';
    w.enemies.forEachAlive((e) => { kind = e.enemyKind; });
    expect(kind).toBe(SANDBOX_SPAWNS[1].label.toLowerCase()); // 'delta'
  });
});
