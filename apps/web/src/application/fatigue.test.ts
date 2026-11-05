import { describe, expect, it } from 'vitest';
import type { ChunkEvent } from '../domain/simulation';
import { FatigueBuffer, trainPeaks } from './fatigue';

const chunk = (fatigue: ChunkEvent['fatigue']): ChunkEvent => ({
  type: 'chunk',
  progress: 0.1,
  timeMs: [0],
  stimulus: [0],
  force: { total: [0], S: [0], FR: [0], FF: [0] },
  emg: [0],
  fatigue,
});

describe('trainPeaks', () => {
  // three trains of 330 ms every 1000 ms; peaks 10, 9, 8 (the third reached after its last pulse)
  const t: number[] = [];
  const f: number[] = [];
  for (let ms = 0; ms <= 3000; ms += 10) {
    t.push(ms);
    const k = Math.floor(ms / 1000);
    const within = ms - 1000 * k;
    f.push(within <= 340 ? [10, 9, 8, 0][k]! * (within / 340) : 0);
  }

  it('peak of each complete train relative to the first', () => {
    const p = trainPeaks(t, f, 330, 1000);
    expect(p.map((x) => x.train)).toEqual([1, 2, 3]);
    expect(p.map((x) => x.ratio)).toEqual([1, 0.9, 0.8]);
  });

  it('leaves out the train still being streamed', () => {
    const cut = t.findIndex((x) => x === 2200);
    expect(trainPeaks(t.slice(0, cut), f.slice(0, cut), 330, 1000)).toHaveLength(2);
  });

  it('no trains or no data → nothing', () => {
    expect(trainPeaks([], [], 330, 1000)).toEqual([]);
    expect(trainPeaks(t, f, 0, 1000)).toEqual([]);
  });
});

describe('FatigueBuffer', () => {
  it('stores one point per chunk, a type without units as NaN, and ignores chunks without fatigue', () => {
    const b = new FatigueBuffer();
    b.append(chunk({ timeMs: 5, muscle: 0.99, S: 1, FR: null, FF: 0.9 }));
    b.append(chunk(null));
    b.append(chunk(undefined));
    b.append(chunk({ timeMs: 10, muscle: 0.98, S: 1, FR: null, FF: 0.8 }));
    const v = b.view();
    expect(Array.from(v.timeMs)).toEqual([5, 10]);
    expect(Array.from(v.FF)).toEqual([0.9, 0.8]);
    expect(Number.isNaN(v.FR[0])).toBe(true);
    b.reset();
    expect(b.length).toBe(0);
  });
});
