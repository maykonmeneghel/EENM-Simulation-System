import type { UnitAnatomy } from '../domain/simulation';
import { UNIT_EVENT_KIND as K } from '../domain/simulation';
import { activeSpikes, buildReplay, recentFlashes } from './replay';

const STEP = 0.025; // ms: soma → electrode 600 samples (15 ms), electrode → muscle 60 (1.5 ms)
const unit: UnitAnatomy = {
  motoneuron: 'CISI_KOHN_2008',
  type: ['S'],
  poolIndex: [0],
  somaDiameterUm: [77.5],
  dendriteDiameterUm: [41.5],
  dendriteLengthMm: [5.5],
  conductionMs: [16.5],
  toElectrodeMs: [15],
  toMuscleMs: [1.5],
  weight: [1],
  axonRheobase: [30],
};
const F = 15 / 16.5;

function events(rows: [sample: number, kind: number, origin?: number][]) {
  return {
    sample: rows.map((r) => r[0]),
    unit: rows.map(() => 0),
    kind: rows.map((r) => r[1]),
    origin: rows.map((r) => r[2] ?? -1),
  };
}

describe('buildReplay', () => {
  it('carries a central spike to the electrode, then to the muscle arrival the engine logged', () => {
    const r = buildReplay(events([[0, K.SOMA_SPIKE], [600, K.CENTRAL_PASSED, 0], [660, K.MUSCLE_ARRIVAL]]), unit, STEP, F, 100);
    const [toElectrode, toMuscle] = r.spikes;
    expect(toElectrode).toMatchObject({ kind: 'central', t0: 0, t1: 15, s0: 0, s1: F, annihilated: false });
    expect(toMuscle).toMatchObject({ kind: 'central', t0: 15, t1: 16.5, s0: F, s1: 1 });
    expect(activeSpikes(r, 7.5)).toEqual([{ spike: toElectrode, s: F / 2 }]); // half-way at half the time
  });

  it('ends the central spike where it is when the FES pulse annihilates it, with no antidromic spike (decision 4a)', () => {
    const r = buildReplay(
      events([[0, K.SOMA_SPIKE], [300, K.FES_FIRE], [300, K.COLLISION, 0], [360, K.MUSCLE_ARRIVAL]]),
      unit,
      STEP,
      F,
      100,
    );
    const central = r.spikes.find((s) => s.kind === 'central')!;
    expect(central).toMatchObject({ t1: 7.5, s1: F / 2, annihilated: true }); // 300 of the 600 samples
    expect(r.spikes.filter((s) => s.kind === 'antidromic')).toHaveLength(0);
    expect(r.spikes.find((s) => s.kind === 'fes')).toMatchObject({ t0: 7.5, t1: 9, s0: F, s1: 1 });
    expect(r.flashes.map((f) => f.kind).sort()).toEqual(['arrival', 'collision', 'fire', 'soma']);
  });

  it('sends the antidromic spike of an FES pulse to the soma, where it resets the motoneuron', () => {
    const r = buildReplay(
      events([[40, K.SOMA_SPIKE], [100, K.FES_FIRE], [160, K.MUSCLE_ARRIVAL], [700, K.ANTIDROMIC_RESET, 700]]),
      unit,
      STEP,
      F,
      100,
    );
    const anti = r.spikes.find((s) => s.kind === 'antidromic')!;
    expect(anti).toMatchObject({ t0: 2.5, t1: 17.5, s0: F, s1: 0, annihilated: false });
    expect(r.flashes.some((f) => f.kind === 'reset' && f.t === 17.5 && f.s === 0)).toBe(true);
    expect(r.pulses).toEqual([2.5]);
  });

  it('draws no antidromic spike in FES-only runs, which do not model one', () => {
    const r = buildReplay(events([[100, K.FES_FIRE], [760, K.MUSCLE_ARRIVAL]]), unit, STEP, F, 100);
    expect(r.spikes.map((s) => s.kind)).toEqual(['fes']);
    expect(r.spikes[0]).toMatchObject({ t0: 2.5, t1: 19 }); // ends where the force pipeline put the arrival
  });

  it('draws the soma → muscle spike back from its arrival when only arrivals were logged', () => {
    const r = buildReplay(events([[1000, K.MUSCLE_ARRIVAL]]), { ...unit, toElectrodeMs: null, toMuscleMs: null }, STEP, null, 100);
    expect(r.spikes).toEqual([{ unit: 0, kind: 'central', t0: 25 - 16.5, t1: 25, s0: 0, s1: 1, annihilated: false }]);
  });

  it('lists the flashes of a recent window', () => {
    const r = buildReplay(events([[100, K.FES_FIRE], [104, K.FES_BLOCKED], [760, K.MUSCLE_ARRIVAL]]), unit, STEP, F, 100);
    expect(recentFlashes(r, 2.7, 0.5).map((f) => f.kind)).toEqual(['fire', 'blocked']);
    expect(recentFlashes(r, 10, 0.5)).toEqual([]);
  });
});
