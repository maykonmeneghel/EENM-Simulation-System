import type { ChunkEvent } from '../domain/simulation';

export const FATIGUE_KEYS = ['timeMs', 'muscle', 'S', 'FR', 'FF'] as const;
export type FatigueKey = (typeof FATIGUE_KEYS)[number];

/** One fatigue snapshot per chunk, columnar like `SeriesBuffer` (a type with no units is stored as NaN). */
export class FatigueBuffer {
  private columns: Record<FatigueKey, number[]> = empty();

  get length(): number {
    return this.columns.timeMs.length;
  }

  reset(): void {
    this.columns = empty();
  }

  append(chunk: ChunkEvent): void {
    const f = chunk.fatigue;
    if (!f) return;
    const c = this.columns;
    c.timeMs.push(f.timeMs);
    c.muscle.push(f.muscle);
    c.S.push(f.S ?? NaN);
    c.FR.push(f.FR ?? NaN);
    c.FF.push(f.FF ?? NaN);
  }

  view(): Record<FatigueKey, Float64Array> {
    const out = {} as Record<FatigueKey, Float64Array>;
    for (const k of FATIGUE_KEYS) out[k] = Float64Array.from(this.columns[k]);
    return out;
  }
}

function empty(): Record<FatigueKey, number[]> {
  return { timeMs: [], muscle: [], S: [], FR: [], FF: [] };
}

export interface TrainPeak {
  /** 1-based train number. */
  train: number;
  startMs: number;
  peak: number;
  /** Peak / first train's peak: the fatigue index measured clinically (Chang & Shields 2011). */
  ratio: number;
}

/**
 * Peak force of every train whose on time is complete in the data, relative to the first train. A train still
 * being streamed is left out so its partial peak does not read as fatigue.
 */
export function trainPeaks(
  timeMs: ArrayLike<number>,
  force: ArrayLike<number>,
  trainOnMs: number,
  trainPeriodMs: number,
): TrainPeak[] {
  const n = timeMs.length;
  if (n === 0 || !(trainOnMs > 0) || !(trainPeriodMs >= trainOnMs)) return [];
  const last = timeMs[n - 1]!;
  const out: TrainPeak[] = [];
  let i = 0;
  for (let k = 0; ; k++) {
    const start = k * trainPeriodMs;
    // the force keeps rising briefly after the last pulse: look until the next train starts
    const end = start + trainPeriodMs;
    if (end > last + 1e-9) break;
    let peak = 0;
    while (i < n && timeMs[i]! < end) {
      if (timeMs[i]! >= start) peak = Math.max(peak, force[i]!);
      i++;
    }
    out.push({ train: k + 1, startMs: start, peak, ratio: NaN });
  }
  const first = out[0]?.peak ?? 0;
  for (const p of out) p.ratio = first > 0 ? p.peak / first : NaN;
  return out;
}

/**
 * Chang & Shields 2011 (Neurorehabil Neural Repair 25:423, full text): soleus fatigue index after 120 trains of
 * 20 Hz, 330 ms every 1 s — 0.89 ± 0.08 (SD) acute SCI, 0.19 ± 0.06 chronic SCI. Valid only for that protocol.
 */
export const SHIELDS_PROTOCOL = { frequencyHz: 20, trainOnMs: 330, trainPeriodMs: 1000, trains: 120 } as const;
export const SHIELDS_REFERENCE = { acute: { mean: 0.89, sd: 0.08 }, chronic: { mean: 0.19, sd: 0.06 } } as const;
