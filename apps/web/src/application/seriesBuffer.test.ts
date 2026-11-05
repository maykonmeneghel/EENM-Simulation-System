import { describe, expect, it } from 'vitest';
import type { ChunkEvent } from '../domain/simulation';
import { SeriesBuffer } from './seriesBuffer';

const chunk = (start: number, n: number): ChunkEvent => {
  const t = Array.from({ length: n }, (_, i) => start + i);
  return { type: 'chunk', progress: 1, timeMs: t, stimulus: t, force: { total: t, S: t, FR: t, FF: t }, emg: t };
};

describe('SeriesBuffer', () => {
  it('grows past its initial capacity and keeps order', () => {
    const b = new SeriesBuffer(2);
    b.append(chunk(0, 3));
    b.append(chunk(3, 5));
    expect(b.length).toBe(8);
    expect(Array.from(b.view().total)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it('reset empties it', () => {
    const b = new SeriesBuffer();
    b.append(chunk(0, 3));
    b.reset(10);
    expect(b.length).toBe(0);
    expect(b.view().timeMs.length).toBe(0);
  });
});
