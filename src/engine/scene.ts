// Scenes are the spec's { enter, update, draw } triple (engine spec §7).
// The manager is deliberately minimal: no stack, no transitions.
export interface Scene {
  enter(): void;
  update(dt: number): void;
  draw(ctx: CanvasRenderingContext2D): void;
}

export interface SceneManager {
  current: Scene | null;
  switchTo(s: Scene): void;
  update(dt: number): void;
  draw(ctx: CanvasRenderingContext2D): void;
}

export function createSceneManager(): SceneManager {
  const mgr: SceneManager = {
    current: null,
    switchTo(s) {
      mgr.current = s;
      s.enter();
    },
    update(dt) {
      mgr.current?.update(dt);
    },
    draw(ctx) {
      mgr.current?.draw(ctx);
    },
  };
  return mgr;
}
