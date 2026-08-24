import { describe, expect, it } from 'vitest';
import { createInput } from '../../engine/input';
import type { Sequencer, Song } from '../../engine/sequencer';
import { createTitleScene } from './title';

function stubSequencer(): Sequencer & { played: Song[]; stopped: number } {
  const s = {
    played: [] as Song[],
    stopped: 0,
    play(song: Song) { s.played.push(song); },
    stop() { s.stopped++; },
    playing: () => s.played.length > s.stopped,
  };
  return s;
}

function makeScene() {
  const input = createInput();
  const seq = stubSequencer();
  let starts = 0;
  const scene = createTitleScene({
    input,
    audio: { unlock() {}, blip() {}, noise() {}, context: () => null },
    sequencer: seq,
    water: { tileSize: 16, tiles: [], pickTile: () => 0 },
    seed: 0xc0ffee,
    onStart: () => starts++,
  });
  return { input, seq, scene, starts: () => starts };
}

describe('title scene flow', () => {
  it('first key starts the music, second key starts the game', () => {
    const { input, seq, scene, starts } = makeScene();
    scene.enter();
    scene.update(1 / 60);
    expect(seq.played).toHaveLength(0);
    input.onKey('Space', true);
    scene.update(1 / 60);
    expect(seq.played).toHaveLength(1);
    expect(starts()).toBe(0);
    input.onKey('Space', true);
    scene.update(1 / 60);
    expect(seq.stopped).toBe(1);
    expect(starts()).toBe(1);
  });

  it('enter() resets so re-entering replays the flow', () => {
    const { input, seq, scene, starts } = makeScene();
    scene.enter();
    input.onKey('KeyA', true);
    scene.update(1 / 60);
    input.onKey('KeyA', true);
    scene.update(1 / 60);
    expect(starts()).toBe(1);
    scene.enter(); // back from a run
    input.onKey('KeyA', true);
    scene.update(1 / 60);
    expect(seq.played).toHaveLength(2); // music starts again, no game start
    expect(starts()).toBe(1);
  });

  it('enter() drains a stale anyKey latch so the first update does not auto-start', () => {
    const { input, seq, scene } = makeScene();
    // Simulate a latch left over from the key that ended the previous run,
    // set before enter() runs (mirrors returning to the title mid-frame).
    input.onKey('KeyQ', true);
    scene.enter();
    scene.update(1 / 60);
    expect(seq.played).toHaveLength(0);
  });

  it('notifyForfeit shows the forfeit line for 240 ticks after enter', () => {
    const { scene } = makeScene();
    scene.notifyForfeit();
    scene.enter();
    expect(scene.debugForfeitTicks()).toBe(240);
    for (let i = 0; i < 240; i++) scene.update(1 / 60);
    expect(scene.debugForfeitTicks()).toBe(0);
  });

  it('enter without notifyForfeit shows no forfeit line', () => {
    const { scene } = makeScene();
    scene.enter();
    expect(scene.debugForfeitTicks()).toBe(0);
  });

  it('forfeit flag is consumed — a second enter does not re-show it', () => {
    const { scene } = makeScene();
    scene.notifyForfeit();
    scene.enter();
    scene.enter();
    expect(scene.debugForfeitTicks()).toBe(0);
  });
});
