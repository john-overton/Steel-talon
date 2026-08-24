// Circle-vs-circle, squared distances, strict inequality — no sqrt
// (engine spec §7).
export function circlesOverlap(
  ax: number, ay: number, ar: number,
  bx: number, by: number, br: number,
): boolean {
  const dx = bx - ax;
  const dy = by - ay;
  const r = ar + br;
  return dx * dx + dy * dy < r * r;
}
