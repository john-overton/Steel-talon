import { describe, expect, it } from 'vitest';
import { createInput } from '../../engine/input';
import { mulberry32 } from '../../engine/rng';
import type { Sequencer, Song } from '../../engine/sequencer';
import { LEVEL_LENGTH } from '../waves';
import { createTopScene, type SandboxHooks } from './top';

const DT = 1 / 60;

function makeScene(sandbox?: SandboxHooks) {
  const input = createInput();
  const camera = { x: 0, y: 0 };
  const exits: Array<[number, number]> = [];
  const abandons: number[] = [];
  const stops: number[] = [];
  let stopCount = 0;
  const seq: Sequencer = {
    play(_s: Song) {},
    stop() {
      stopCount++;
      stops.push(stopCount);
    },
    playing: () => false,
  };
  const scene = createTopScene({
    input,
    audio: { unlock() {}, blip() {}, noise() {}, context: () => null },
    sequencer: seq,
    camera,
    water: { tileSize: 16, tiles: [], pickTile: () => 0 },
    makeRng: () => mulberry32(0xc0ffee),
    onExit: (s, sal) => exits.push([s, sal]),
    onAbandon: () => abandons.push(1),
    sandbox,
  });
  return { input, camera, scene, exits, abandons, stops };
}

describe('top scene', () => {
  it('enter() resets the camera to the bottom of the strip', () => {
    const { camera, scene } = makeScene();
    scene.enter();
    expect(camera.y).toBe(LEVEL_LENGTH - 480);
    expect(camera.x).toBe(0);
  });

  it('the camera scrolls up and clamps at 0', () => {
    const { camera, scene } = makeScene();
    scene.enter();
    const y0 = camera.y;
    for (let i = 0; i < 60; i++) scene.update(DT);
    expect(camera.y).toBeCloseTo(y0 - 120, 0);
  });

  it('a full 3-minute run reaches the outro and exits ~5s later', () => {
    const { scene, exits } = makeScene();
    scene.enter();
    // 180s of scroll + 6s of outro margin; nothing shoots the player in
    // this stub run (no input), so survival depends on dodging — the
    // seeded script may kill the player instead. Either exit is valid;
    // the scene must ALWAYS exit within the bound.
    for (let i = 0; i < (186 + 60) * 60 && exits.length === 0; i++) scene.update(DT);
    expect(exits).toHaveLength(1);
  }, 30_000);

  it('the chopper rides the scroll: screen-relative y holds with no input', () => {
    const { camera, scene } = makeScene();
    scene.enter();
    const screenY0 = scene.debugPlayerY() - camera.y;
    for (let i = 0; i < 300; i++) scene.update(DT);
    const screenY1 = scene.debugPlayerY() - camera.y;
    expect(screenY1).toBeCloseTo(screenY0, 5);
  });

  it('re-entering starts a fresh run with the same seed → same script', () => {
    const { camera, scene } = makeScene();
    scene.enter();
    for (let i = 0; i < 600; i++) scene.update(DT);
    const midY = camera.y;
    scene.enter();
    expect(camera.y).toBe(LEVEL_LENGTH - 480);
    for (let i = 0; i < 600; i++) scene.update(DT);
    expect(camera.y).toBe(midY); // deterministic replay
  });
});

describe('pause', () => {
  it('Escape pauses: world state freezes, resume continues exactly', () => {
    const { input, scene } = makeScene();
    scene.enter();
    for (let i = 0; i < 60; i++) scene.update(DT);
    const yBefore = scene.debugPlayerY();
    input.onKey('Escape', true);
    scene.update(DT);
    input.onKey('Escape', false);
    // 120 paused ticks: nothing moves
    for (let i = 0; i < 120; i++) scene.update(DT);
    expect(scene.debugPlayerY()).toBe(yBefore);
    // Escape again resumes; scroll rides once more
    input.onKey('Escape', true);
    scene.update(DT);
    input.onKey('Escape', false);
    for (let i = 0; i < 60; i++) scene.update(DT);
    expect(scene.debugPlayerY()).not.toBe(yBefore);
  });

  it('abandon calls onAbandon, never onExit, and stops music', () => {
    const { input, scene, exits, abandons, stops } = makeScene();
    scene.enter();
    for (let i = 0; i < 60; i++) scene.update(DT);
    // Pause.
    input.onKey('Escape', true);
    scene.update(DT);
    input.onKey('Escape', false);
    // Cursor down to ABANDON RUN.
    input.onKey('ArrowDown', true);
    scene.update(DT);
    input.onKey('ArrowDown', false);
    scene.update(DT);
    // Confirm.
    input.onKey('Enter', true);
    scene.update(DT);
    input.onKey('Enter', false);

    expect(abandons).toHaveLength(1);
    expect(exits).toHaveLength(0);
    expect(stops.length).toBeGreaterThan(0);
  });

  it('Escape during gameover overlay does nothing', () => {
    const { input, scene } = makeScene();
    scene.enter();
    // No input at all: the seeded script (0xc0ffee) reliably kills the
    // stationary chopper well within this bound.
    for (let i = 0; i < 8000 && scene.debugOverlay() !== 'gameover'; i++) scene.update(DT);
    expect(scene.debugOverlay()).toBe('gameover');

    input.onKey('Escape', true);
    scene.update(DT);
    input.onKey('Escape', false);
    expect(scene.debugOverlay()).toBe('gameover');
  });
});

function makeSandboxHooks(): { hooks: SandboxHooks; calls: Array<[number, number]>; frozen: { value: boolean } } {
  const calls: Array<[number, number]> = [];
  const frozen = { value: false };
  return {
    hooks: {
      tick(_w, playerX, camY) { calls.push([playerX, camY]); return frozen.value; },
      draw() {},
    },
    calls, frozen,
  };
}

describe('sandbox mode', () => {
  it('freezes scroll and skips the wave script', () => {
    const { hooks } = makeSandboxHooks();
    const { camera, scene } = makeScene(hooks);
    scene.enter();
    const y0 = camera.y;
    for (let i = 0; i < 600; i++) scene.update(DT);
    expect(camera.y).toBe(y0);            // no scroll
    expect(scene.debugOverlay()).toBe('playing'); // never completes
  });

  it('starts with the full arsenal and missiles pinned at 9', () => {
    const { hooks } = makeSandboxHooks();
    const { scene, input } = makeScene(hooks);
    scene.enter();
    expect(scene.debugRun().missileAmmo).toBe(9); // pinned at enter()
    input.onKey('Digit2', true); scene.update(DT); input.onKey('Digit2', false);
    expect(scene.debugSelected()).toBe(2); // miniguns owned from tick 0
    input.onKey('Digit3', true); scene.update(DT); input.onKey('Digit3', false);
    expect(scene.debugSelected()).toBe(3); // rockets owned too
    input.onKey('Digit4', true); scene.update(DT); input.onKey('Digit4', false);
    expect(scene.debugSelected()).toBe(4); // missiles owned via the ammo pin
  });

  it('re-pins missiles at 9 every tick, so firing never drains them', () => {
    const { hooks } = makeSandboxHooks();
    const { scene, input } = makeScene(hooks);
    scene.enter();
    input.onKey('Digit4', true); scene.update(DT); input.onKey('Digit4', false);
    input.onKey('KeyZ', true); // fire
    for (let i = 0; i < 300; i++) scene.update(DT);
    input.onKey('KeyZ', false);
    expect(scene.debugRun().missileAmmo).toBe(9); // per-tick re-pin
  });

  it('a frozen tick advances nothing world-side', () => {
    const { hooks, frozen } = makeSandboxHooks();
    const { scene, camera, input } = makeScene(hooks);
    scene.enter();
    const y0 = camera.y;
    const playerY0 = scene.debugPlayerY();

    // Held movement input proves the early return, not just the pinned
    // scroll: an unfrozen sandbox tick still moves the chopper.
    input.onKey('ArrowDown', true);
    frozen.value = true;
    for (let i = 0; i < 60; i++) scene.update(DT);
    expect(camera.y).toBe(y0);
    expect(scene.debugPlayerY()).toBe(playerY0);

    frozen.value = false;
    for (let i = 0; i < 60; i++) scene.update(DT);
    input.onKey('ArrowDown', false);
    expect(scene.debugPlayerY()).toBeGreaterThan(playerY0);
  });

  it('death respawns in place instead of ending the run', () => {
    // drive damage via debugDamage() seam; hp exhaustion must not
    // reach the gameover overlay in sandbox mode
    const { hooks } = makeSandboxHooks();
    const { scene, stops } = makeScene(hooks);
    scene.enter();
    // 20 real hits = 6 full life losses (3 hp each) plus 2. Without the
    // respawn-in-place branch this reaches 'gameover' with lives 0.
    for (let i = 0; i < 20; i++) scene.debugDamage();
    expect(scene.debugOverlay()).toBe('playing');
    expect(scene.debugRun().lives).toBe(3); // restored, never drained
    expect(scene.debugRun().hp).toBe(1);    // 2 hits into the 7th life
    expect(scene.debugRun().invulnTicks).toBeGreaterThan(0); // mercy window
    expect(stops).toHaveLength(0);          // music never stopped
  });

  it('outside sandbox the same damage path still ends the run', () => {
    const { scene, stops } = makeScene(); // no sandbox hooks
    scene.enter();
    for (let i = 0; i < 20; i++) scene.debugDamage();
    expect(scene.debugOverlay()).toBe('gameover');
    expect(scene.debugRun().lives).toBe(0);
    expect(stops.length).toBeGreaterThan(0);
  });

  it('the sandbox tick sees the live player x and camera y', () => {
    const { hooks, calls } = makeSandboxHooks();
    const { scene, camera } = makeScene(hooks);
    scene.enter();
    scene.update(DT);
    expect(calls).toHaveLength(1);
    expect(calls[0][0]).toBe(320); // WIDTH / 2 at enter()
    expect(calls[0][1]).toBe(camera.y);
  });
});
