// 640x480 back-buffer contract: all game drawing targets `ctx`; present()
// scales to the screen canvas by the largest fractional fill that fits,
// letterboxed, via a sharp-bilinear two-pass: an integer upscale with
// smoothing off (crisp pixel grid), then a bilinear fit to the fractional
// screen size (smoothing on) to avoid nearest-neighbor shimmer/warping as
// content scrolls at a non-integer scale. Exact integer scales skip the
// second pass and stay perfectly crisp.
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

// The integer upscale factor for the sharp-bilinear intermediate pass:
// the smallest whole number >= scale, floored at 1x.
export function upscaleFactor(scale: number): number {
  return Math.max(1, Math.ceil(scale));
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

  // Intermediate canvas for the sharp-bilinear pass: buf is drawn onto it
  // at an integer factor (smoothing off), then it is drawn onto the screen
  // at the fractional fit scale (smoothing on). Resized lazily only when
  // the needed integer factor changes.
  const mid = document.createElement('canvas');
  const midCtx = mid.getContext('2d');
  if (!midCtx) throw new Error('Canvas 2D context unavailable');
  let midFactor = 0;

  return {
    ctx,
    camera: { x: 0, y: 0 },
    resize() {
      screen.width = window.innerWidth;
      screen.height = window.innerHeight;
    },
    present() {
      const { scale, x, y } = computePresentation(screen.width, screen.height);
      screenCtx.fillStyle = '#000';
      screenCtx.fillRect(0, 0, screen.width, screen.height);

      const k = upscaleFactor(scale);
      if (k === scale) {
        // Exact integer scale: single crisp pass, no smoothing needed.
        screenCtx.imageSmoothingEnabled = false;
        screenCtx.drawImage(buf, x, y, WIDTH * scale, HEIGHT * scale);
        return;
      }

      if (midFactor !== k) {
        mid.width = WIDTH * k;
        mid.height = HEIGHT * k;
        midFactor = k;
      }
      midCtx.imageSmoothingEnabled = false;
      midCtx.drawImage(buf, 0, 0, WIDTH * k, HEIGHT * k);

      screenCtx.imageSmoothingEnabled = true;
      screenCtx.drawImage(mid, x, y, WIDTH * scale, HEIGHT * scale);
    },
  };
}
