import type { ChunkEvent } from '../domain/simulation';

export const SERIES_KEYS = ['timeMs', 'stimulus', 'total', 'S', 'FR', 'FF', 'emg'] as const;
export type SeriesKey = (typeof SERIES_KEYS)[number];
export type SeriesView = Record<SeriesKey, Float64Array>;

/**
 * Append-only columnar store for the streamed series. Uses growable Float64Arrays so that
 * appending a chunk is O(chunk) and views are zero-copy `subarray`s, ready for uPlot.
 */
export class SeriesBuffer {
  private columns: Record<SeriesKey, Float64Array>;
  private _length = 0;

  constructor(initialCapacity = 1024) {
    this.columns = allocate(Math.max(1, initialCapacity));
  }

  get length(): number {
    return this._length;
  }

  /** Clear and pre-size (e.g. from `started.durationMs / outputStepMs`). */
  reset(capacityHint = 1024): void {
    this.columns = allocate(Math.max(1, Math.ceil(capacityHint)));
    this._length = 0;
  }

  append(chunk: ChunkEvent): number {
    const n = chunk.timeMs.length;
    this.ensureCapacity(this._length + n);
    const at = this._length;
    const c = this.columns;
    c.timeMs.set(chunk.timeMs, at);
    c.stimulus.set(chunk.stimulus, at);
    c.total.set(chunk.force.total, at);
    c.S.set(chunk.force.S, at);
    c.FR.set(chunk.force.FR, at);
    c.FF.set(chunk.force.FF, at);
    c.emg.set(chunk.emg, at);
    this._length += n;
    return this._length;
  }

  /** Zero-copy views of the filled part. Do not keep them across appends (may be reallocated). */
  view(): SeriesView {
    const out = {} as SeriesView;
    for (const k of SERIES_KEYS) out[k] = this.columns[k].subarray(0, this._length);
    return out;
  }

  private ensureCapacity(needed: number): void {
    const cap = this.columns.timeMs.length;
    if (needed <= cap) return;
    let next = cap;
    while (next < needed) next *= 2;
    const grown = allocate(next);
    for (const k of SERIES_KEYS) grown[k].set(this.columns[k].subarray(0, this._length));
    this.columns = grown;
  }
}

function allocate(capacity: number): Record<SeriesKey, Float64Array> {
  const out = {} as Record<SeriesKey, Float64Array>;
  for (const k of SERIES_KEYS) out[k] = new Float64Array(capacity);
  return out;
}
