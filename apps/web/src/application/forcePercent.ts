import type { SeriesBuffer } from './seriesBuffer';

/** Force columns shown as % of the maximal force; the other columns pass through. */
export const FORCE_KEYS = ['total', 'S', 'FR', 'FF'] as const;

/** Usable maximal force (> 0 and finite), or null when the run has none (ORIGINAL or an older engine). */
export function maxForceOf(maxForce: number | null | undefined): number | null {
  return typeof maxForce === 'number' && Number.isFinite(maxForce) && maxForce > 0 ? maxForce : null;
}

export const toPercent = (value: number, maxForce: number) => (value / maxForce) * 100;

/** A chart source over the series buffer whose force columns are % of `maxForce`. */
export function percentSource(buffer: SeriesBuffer, maxForce: number) {
  return {
    view() {
      const v = buffer.view();
      const out: Record<string, Float64Array> = { ...v };
      for (const k of FORCE_KEYS) {
        const col = v[k];
        const scaled = new Float64Array(col.length);
        for (let i = 0; i < col.length; i++) scaled[i] = (col[i]! / maxForce) * 100;
        out[k] = scaled;
      }
      return out as { timeMs: Float64Array } & Record<string, Float64Array>;
    },
  };
}
