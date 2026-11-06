import { describe, expect, it } from 'vitest';
import type { ChunkEvent } from '../domain/simulation';
import { maxForceOf, percentSource, toPercent } from './forcePercent';
import { SeriesBuffer } from './seriesBuffer';

describe('force as % of the maximal force', () => {
  it('scales only the force columns and keeps the buffer untouched', () => {
    const buffer = new SeriesBuffer();
    const chunk: ChunkEvent = {
      type: 'chunk',
      progress: 1,
      timeMs: [0, 1],
      stimulus: [153, 0],
      force: { total: [2.5, 5], S: [2, 4], FR: [0.25, 0.5], FF: [0.25, 0.5] },
      emg: [0.1, 0.2],
    };
    buffer.append(chunk);
    const v = percentSource(buffer, 5).view();
    expect(Array.from(v.total!)).toEqual([50, 100]);
    expect(Array.from(v.S!)).toEqual([40, 80]);
    expect(Array.from(v.stimulus!)).toEqual([153, 0]);
    expect(Array.from(v.emg!)).toEqual([0.1, 0.2]);
    expect(Array.from(buffer.view().total)).toEqual([2.5, 5]);
  });

  it('no usable maximum (ORIGINAL, older engine) → model units', () => {
    expect(maxForceOf(undefined)).toBeNull();
    expect(maxForceOf(null)).toBeNull();
    expect(maxForceOf(0)).toBeNull();
    expect(maxForceOf(5.1754)).toBe(5.1754);
    expect(toPercent(5.1699, 5.1754)).toBeCloseTo(99.89, 2);
  });
});
