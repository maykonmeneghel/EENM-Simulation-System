import { describe, expect, it } from 'vitest';
import { savedFixture } from '../domain/savedSimulation.fixture';
import { commonGrid, compareSource, comparisonCsv, differingFields, resample } from './comparison';

describe('comparison', () => {
  it('one grid for every run: to the longest, at the finest output step, coarser past the point limit', () => {
    const runs = [{ run: { durationMs: 10, outputStepMs: 1 } }, { run: { durationMs: 20, outputStepMs: 0.5 } }];
    const g = commonGrid(runs);
    expect(g.stepMs).toBe(0.5);
    expect(g.timeMs.length).toBe(41);
    expect(g.timeMs.at(-1)).toBe(20);
    const capped = commonGrid(runs, 11);
    expect(capped.timeMs.length).toBe(11);
    expect(capped.timeMs.at(-1)).toBeCloseTo(20);
  });

  it('resamples linearly, and a shorter run ends (null) instead of dropping to zero', () => {
    expect(resample([0, 2, 4], [0, 4, 8], [0, 1, 3, 4, 5])).toEqual([0, 2, 6, 8, null]);
    expect(resample([0, 1], [1, NaN], [0, 1])).toEqual([1, null]);
  });

  it('force in % of each run’s own maximum when every run has one; else model units', () => {
    const a = savedFixture({ id: 'a' }, 5, 1, 1); // max 10 → total 0..4 = 0..40 %
    const b = savedFixture({ id: 'b' }, 3, 1, 2); // ends at 2 ms
    const grid = commonGrid([a, b]);
    const src = compareSource([a, b], { kind: 'series', key: 'total' }, grid);
    expect(src.percent).toBe(true);
    expect(src.view().a).toEqual([0, 10, 20, 30, 40]);
    expect(src.view().b).toEqual([0, 20, 40, null, null]);
    const noMax = savedFixture({ id: 'c', run: { ...a.run, maxForce: null } });
    expect(compareSource([a, noMax], { kind: 'series', key: 'total' }, grid).percent).toBe(false);
    expect(compareSource([a], { kind: 'fatigue', key: 'muscle' }, grid).view().a).toEqual([1, 0.975, 0.95, 0.925, 0.9]);
  });

  it('lists only the settings that differ', () => {
    const a = savedFixture({ id: 'a' });
    const b = savedFixture({ id: 'b', request: { ...a.request, seed: 7, stimulus: { ...a.request.stimulus, amplitude: 99 } } });
    expect(differingFields([a, b])).toEqual([
      { key: 'stimulus.amplitude', values: [String(a.request.stimulus.amplitude), '99'] },
      { key: 'seed', values: [String(a.request.seed), '7'] },
    ]);
    expect(differingFields([a, a])).toEqual([]);
    expect(differingFields([a])).toEqual([]);
  });

  it('CSV: time and one column per run, empty where a run has ended, names quoted when needed', () => {
    const csv = comparisonCsv({ timeMs: [0, 1], a: [1, 2], b: [3, null] }, [{ id: 'a', name: 'A, 40 Hz' }, { id: 'b', name: 'B' }]);
    expect(csv).toBe('time_ms,"A, 40 Hz",B\n0,1,3\n1,2,');
  });
});
