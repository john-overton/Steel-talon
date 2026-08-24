// 640x480 back-buffer contract: all game drawing targets `ctx`; present()
// scales to the screen canvas by the largest integer that fits, letterboxed.
export const WIDTH = 640;
export const HEIGHT = 480;

export interface Presentation { scale: number; x: number; y: number }

export function computePresentation(screenW: number, screenH: number): Presentation {
  const scale = Math.max(1, Math.floor(Math.min(screenW / WIDTH, screenH / HEIGHT)));
  return {
    scale,
    x: (screenW - WIDTH * scale) / 2,
    y: (screenH - HEIGHT * scale) / 2,
  };
}

export interface Renderer {
  ctx: CanvasRenderingContext2D;
  present(): void;
  resize(): void;
}

export function createRenderer(screen: HTMLCanvasElement): Renderer {
  const buf = document.createElement('canvas');
  buf.width = WIDTH;
  buf.height = HEIGHT;
  const ctx = buf.getContext('2d');
  const screenCtx = screen.getContext('2d');
  if (!ctx || !screenCtx) throw new Error('Canvas 2D context unavailable');
  ctx.imageSmoothingEnabled = false;

  return {
    ctx,
    resize() {
      screen.width = window.innerWidth;
      screen.height = window.innerHeight;
    },
    present() {
      const { scale, x, y } = computePresentation(screen.width, screen.height);
      screenCtx.imageSmoothingEnabled = false;
      screenCtx.fillStyle = '#000';
      screenCtx.fillRect(0, 0, screen.width, screen.height);
      screenCtx.drawImage(buf, x, y, WIDTH * scale, HEIGHT * scale);
    },
  };
}
