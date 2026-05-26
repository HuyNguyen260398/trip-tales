const MAX_SCALE = 1.12;

/** Scale factor for a Ken-Burns effect at progress `t` (0..1) through a segment. */
export function kenBurnsScale(zoomIn: boolean, t: number): number {
  const p = Math.min(1, Math.max(0, t));
  return zoomIn ? 1 + (MAX_SCALE - 1) * p : MAX_SCALE - (MAX_SCALE - 1) * p;
}
