// Aim math for auto-aim and AI target leading (target-leading spec §1).
// Pure functions; runtime-dependency-free (type-only imports), so
// entities.ts can import intercept() without a cycle.
import type { Enemy, World } from './entities';
import type { RunState } from './run';

export const CHAIN_CONE = Math.PI / 4;          // ±45° chain gun traverse
export const MINIGUN_CONE = (5 * Math.PI) / 180; // ±5° minigun traverse

export interface AimPoint { x: number; y: number; }

// Reused across calls to avoid a per-shot allocation; callers must not
// retain the returned reference past their next call to this function.
const aimResult: AimPoint = { x: 0, y: 0 };

// Where to aim from (sx, sy) so a projectile at projSpeed meets a target
// at (tx, ty) moving at constant (tvx, tvy). Closed-form quadratic in
// flight time t; no positive solution (target outrunning the projectile,
// or stationary) falls back to the target's current position.
export function intercept(
  sx: number, sy: number, tx: number, ty: number,
  tvx: number, tvy: number, projSpeed: number,
): AimPoint {
  const rx = tx - sx;
  const ry = ty - sy;
  const a = tvx * tvx + tvy * tvy - projSpeed * projSpeed;
  const b = 2 * (rx * tvx + ry * tvy);
  const c = rx * rx + ry * ry;
  let t = -1;
  if (Math.abs(a) < 1e-6) {
    // Target speed ≈ projectile speed: at² drops out, t = -c/b if closing.
    if (b < 0) t = -c / b;
  } else {
    const disc = b * b - 4 * a * c;
    if (disc >= 0) {
      const sq = Math.sqrt(disc);
      const t1 = (-b - sq) / (2 * a);
      const t2 = (-b + sq) / (2 * a);
      const lo = Math.min(t1, t2);
      const hi = Math.max(t1, t2);
      t = lo > 0 ? lo : hi > 0 ? hi : -1;
    }
  }
  if (t > 0) {
    aimResult.x = tx + tvx * t;
    aimResult.y = ty + tvy * t;
  } else {
    aimResult.x = tx;
    aimResult.y = ty;
  }
  return aimResult;
}

// Nearest living enemy whose bearing from (x, y) lies within halfAngle of
// straight up (-Y, the chopper's fixed nose direction). atan2(dx, -dy) is
// 0 dead ahead, ±π directly behind, so the bearing test alone also culls
// everything behind the shooter. halfAngle = Math.PI degrades to a plain
// nearest-enemy scan (used by missile reticles).
export function coneTarget(w: World, x: number, y: number, halfAngle: number): Enemy | undefined {
  let best: Enemy | undefined;
  let bestDistSq = Infinity;
  w.enemies.forEachAlive((e) => {
    const dx = e.pos.x - x;
    const dy = e.pos.y - y;
    if (Math.abs(Math.atan2(dx, -dy)) > halfAngle) return;
    const distSq = dx * dx + dy * dy;
    if (distSq < bestDistSq) {
      bestDistSq = distSq;
      best = e;
    }
  });
  return best;
}

// Which enemy the HUD reticle marks: the selected weapon's current lock.
// Rockets are dumb — no reticle. Missiles home on the nearest enemy with
// no cone limit, so that is what they show.
export function reticleTarget(w: World, run: RunState, x: number, y: number): Enemy | undefined {
  switch (run.selected) {
    case 1: return coneTarget(w, x, y, CHAIN_CONE);
    case 2: return coneTarget(w, x, y, MINIGUN_CONE);
    case 4: return coneTarget(w, x, y, Math.PI);
    default: return undefined;
  }
}
