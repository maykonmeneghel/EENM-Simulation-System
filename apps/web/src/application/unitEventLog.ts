import type { ChunkEvent } from '../domain/simulation';

/** Every per-unit event of the current run (`chunk.unitEvents`), kept in growing typed arrays. */
export class UnitEventLog {
  private _sample = new Float64Array(1024);
  private _unit = new Int32Array(1024);
  private _kind = new Int8Array(1024);
  private _origin = new Float64Array(1024);
  private _length = 0;
  /** Changes on every append or reset, so views can tell the log moved on. */
  version = 0;

  get length(): number {
    return this._length;
  }

  reset(): void {
    this._length = 0;
    this.version++;
  }

  append(chunk: ChunkEvent): void {
    const e = chunk.unitEvents;
    if (!e || e.sample.length === 0) return;
    const n = e.sample.length;
    this.reserve(this._length + n);
    for (let i = 0; i < n; i++) {
      const j = this._length + i;
      this._sample[j] = e.sample[i]!;
      this._unit[j] = e.unit[i]!;
      this._kind[j] = e.kind[i]!;
      this._origin[j] = e.origin[i]!;
    }
    this._length += n;
    this.version++;
  }

  /** Views of the first `length` events (valid until the next append). */
  columns(): { sample: Float64Array; unit: Int32Array; kind: Int8Array; origin: Float64Array } {
    const n = this._length;
    return {
      sample: this._sample.subarray(0, n),
      unit: this._unit.subarray(0, n),
      kind: this._kind.subarray(0, n),
      origin: this._origin.subarray(0, n),
    };
  }

  private reserve(n: number): void {
    if (n <= this._sample.length) return;
    const size = Math.max(n, this._sample.length * 2);
    const grow = <T extends Float64Array | Int32Array | Int8Array>(a: T, make: (k: number) => T): T => {
      const b = make(size);
      b.set(a.subarray(0, this._length));
      return b;
    };
    this._sample = grow(this._sample, (k) => new Float64Array(k));
    this._unit = grow(this._unit, (k) => new Int32Array(k));
    this._kind = grow(this._kind, (k) => new Int8Array(k));
    this._origin = grow(this._origin, (k) => new Float64Array(k));
  }
}
