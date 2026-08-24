// 640x480 back-buffer contract: all game drawing targets `ctx`; present()
// scales to the screen canvas by the largest fractional fill that fits,
// letterboxed (smoothing stays off — pixelated look, slightly uneven pixel
// rows accepted at non-integer scales).
export const WIDTH = 640;
export const HEIGHT = 480;

export interface Presentation { scale: number; x: number; y: number }

export function computePresentation(screenW: number, screenH: number): Presentation {
  const scale = Math.min(screenW / WIDTH, screenH / HEIGHT);
  return {
    scale,
    x: (screenW - WIDTH * scale) / 2,
    y: (screenH - HEIGHT * scale) / 2,
  };
}

export interface Camera { x: number; y: number }

export interface Renderer {
  ctx: CanvasRenderingContext2D;
  // World-space view origin. The renderer never applies it; game draw code
  // subtracts it (draw at pos - camera). Owned/reset by the active scene.
  camera: Camera;
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
    camera: { x: 0, y: 0 },
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
