/** Decimals that tell ticks `incr` apart (1 → 0, 0.25 → 2, 0.0005 → 4). */
export function tickDecimals(incr: number): number {
  if (!(incr > 0) || !Number.isFinite(incr)) return 0;
  for (let d = 0; d < 12; d++) {
    const scaled = incr * 10 ** d;
    if (Math.abs(scaled - Math.round(scaled)) < 1e-6 * Math.max(1, scaled)) return d;
  }
  return 12;
}
