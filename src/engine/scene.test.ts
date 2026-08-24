import { describe, expect, it } from 'vitest';
import { createSceneManager, type Scene } from './scene';

function stubScene(): Scene & { entered: number; updated: number[]; drawn: number } {
  const s = {
    entered: 0,
    updated: [] as number[],
    drawn: 0,
    enter() { s.entered++; },
    update(dt: number) { s.updated.push(dt); },
    draw() { s.drawn++; },
  };
  return s;
}

describe('scene manager', () => {
  it('starts with no current scene and ignores update/draw', () => {
    const mgr = createSceneManager();
    expect(mgr.current).toBeNull();
    expect(() => mgr.update(1 / 60)).not.toThrow();
    expect(() => mgr.draw(null as unknown as CanvasRenderingContext2D)).not.toThrow();
  });

  it('switchTo sets current and calls enter() exactly once', () => {
    const mgr = createSceneManager();
    const a = stubScene();
    mgr.switchTo(a);
    expect(mgr.current).toBe(a);
    expect(a.entered).toBe(1);
  });

  it('update and draw delegate to the current scene', () => {
    const mgr = createSceneManager();
    const a = stubScene();
    mgr.switchTo(a);
    mgr.update(1 / 60);
    mgr.draw(null as unknown as CanvasRenderingContext2D);
    expect(a.updated).toEqual([1 / 60]);
    expect(a.drawn).toBe(1);
  });

  it('switching scenes enters the new scene and stops updating the old', () => {
    const mgr = createSceneManager();
    const a = stubScene();
    const b = stubScene();
    mgr.switchTo(a);
    mgr.switchTo(b);
    mgr.update(1 / 60);
    expect(b.entered).toBe(1);
    expect(a.updated).toHaveLength(0);
    expect(b.updated).toHaveLength(1);
  });
});
