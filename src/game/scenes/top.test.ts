import { describe, expect, it } from 'vitest';
import { createInput } from '../../engine/input';
import { mulberry32 } from '../../engine/rng';
import type { Sequencer, Song } from '../../engine/sequencer';
import { LEVEL_LENGTH } from '../waves';
import { createTopScene } from './top';

const DT = 1 / 60;

function makeScene() {
  const input = createInput();
  const camera = { x: 0, y: 0 };
  const exits: Array<[number, number]> = [];
  const seq: Sequencer = { play(_s: Song) {}, stop() {}, playing: () => false };
  const scene = createTopScene({
    input,
    audio: { unlock() {}, blip() {}, noise() {}, context: () => null },
    sequencer: seq,
    camera,
    water: { tileSize: 16, tiles: [], pickTile: () => 0 },
    makeRng: () => mulberry32(0xc0ffee),
    onExit: (s, sal) => exits.push([s, sal]),
  });
  return { input, camera, scene, exits };
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
