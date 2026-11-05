import { describe, expect, it } from 'vitest';
import type { MusclePreset, StartedEvent } from '../domain/simulation';
import { defaultRequest } from '../domain/defaults';
import { defaultFormValues } from './formModel';
import { buildModelSnapshot, twitchCurve } from './modelView';

const soleus: MusclePreset = { id: 'SOLEUS', label: 'Sóleo', poolSize: { S: 800, FR: 50, FF: 50 } };
const started: StartedEvent = {
  type: 'started', simulationId: 'x', durationMs: 1000, outputStepMs: 0.1,
  motorUnits: { S: 106, FR: 7, FF: 7 }, muscle: 'SOLEUS',
};

describe('buildModelSnapshot', () => {
  it('ORIGINAL defaults: PW 5 ms, f 0.04 kHz, explicit 5/2/2 units', () => {
    const s = buildModelSnapshot({ values: defaultFormValues('ORIGINAL'), muscles: [soleus] });
    expect(s.stages).toEqual(['1', '2a', '3', '4', '5a', '8a']);
    expect(s.stimulus.fKHz).toBe(0.04);
    expect(s.stimulus.pwMs).toBeCloseTo(5, 12);
    expect(s.units).toEqual({ source: 'form', counts: { S: 5, FR: 2, FF: 2 } });
    expect(s.motoneuron.phi).toBe(1);
  });

  it('LITERATURE clinical values: all recruited, delays for 44/53 m/s', () => {
    const v = { ...defaultFormValues('LITERATURE'), 'stimulus.dutyCyclePercent': '1.2', 'stimulus.amplitude': '153' };
    const s = buildModelSnapshot({ values: v, muscles: [soleus] });
    expect(s.stimulus.pwMs).toBeCloseTo(0.3, 12);
    expect(s.recruitment?.status).toBe('all');
    expect(s.conduction.delays.map((d) => Math.round(d.ms * 100) / 100)).toEqual([18.18, 15.09]);
    expect(s.rate.isiMs).toBe(25);
  });

  it('LITERATURE automatic units: "auto" until a matching run reports them', () => {
    const v = defaultFormValues('LITERATURE');
    expect(buildModelSnapshot({ values: v, muscles: [soleus] }).units.source).toBe('auto');
    expect(buildModelSnapshot({ values: v, muscles: [soleus] }).weights).toBeNull();
    const s = buildModelSnapshot({ values: v, muscles: [soleus], lastRequest: defaultRequest('LITERATURE'), lastStarted: started });
    expect(s.units).toEqual({ source: 'started', counts: { S: 106, FR: 7, FF: 7 } });
    expect(s.weights?.S).toBeCloseTo(800 / 106, 12);
    expect(s.weights?.FF).toBeCloseTo(50 / 7, 12);
  });

  it('ignores a started event from another variant or muscle', () => {
    const v = defaultFormValues('LITERATURE');
    expect(buildModelSnapshot({ values: v, muscles: [soleus], lastRequest: defaultRequest('ORIGINAL'), lastStarted: started }).units.source).toBe('auto');
    expect(buildModelSnapshot({ values: { ...v, muscle: 'TIBIALIS_ANTERIOR' }, muscles: [soleus], lastRequest: defaultRequest('LITERATURE'), lastStarted: started }).units.source).toBe('auto');
  });

  it('invalid inputs become NaN instead of throwing', () => {
    const s = buildModelSnapshot({ values: { ...defaultFormValues(), 'stimulus.pulseWidthUs': 'abc' }, muscles: [] });
    expect(s.stimulus.pwMs).toBeNaN();
    // stimulator mode: the pulse width no longer depends on the frequency
    const f = buildModelSnapshot({ values: { ...defaultFormValues(), 'stimulus.frequencyHz': '20' }, muscles: [] });
    expect(f.stimulus.pwMs).toBe(0.3);
    expect(s.recruitment).toBeNull();
  });
});

describe('twitchCurve', () => {
  it('peaks at 1 at x = T (ORIGINAL) and x = 1.2772 T (LITERATURE)', () => {
    const peak = (c: Array<[number, number]>) => c.reduce((a, b) => (b[1] > a[1] ? b : a));
    expect(peak(twitchCurve('ORIGINAL', 500))[0]).toBeCloseTo(1, 1);
    expect(peak(twitchCurve('LITERATURE', 500))[0]).toBeCloseTo(1.2772, 1);
    expect(peak(twitchCurve('LITERATURE', 500, 5, 'SINGLE_UNIT'))[0]).toBeCloseTo(0.7426, 1);
  });
});
