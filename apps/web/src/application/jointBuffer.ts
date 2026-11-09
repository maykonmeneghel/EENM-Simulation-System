import type { ChunkEvent } from '../domain/simulation';

/** Wrist angle of the run on the output grid (`chunk.joint.angleDeg`), for the 3D step. */
export class JointBuffer {
  private _angle = new Float64Array(1024);
  private _length = 0;

  get length(): number {
    return this._length;
  }

  reset(): void {
    this._length = 0;
  }

  append(chunk: ChunkEvent): void {
    const a = chunk.joint?.angleDeg;
    if (!a || a.length === 0) return;
    if (this._length + a.length > this._angle.length) {
      const grown = new Float64Array(Math.max(this._length + a.length, this._angle.length * 2));
      grown.set(this._angle.subarray(0, this._length));
      this._angle = grown;
    }
    this._angle.set(a, this._length);
    this._length += a.length;
  }

  /** Angle (°) at output sample `i`, clamped to the recorded range; null before any sample. */
  at(i: number): number | null {
    if (this._length === 0) return null;
    return this._angle[Math.min(this._length - 1, Math.max(0, Math.round(i)))]!;
  }
}
