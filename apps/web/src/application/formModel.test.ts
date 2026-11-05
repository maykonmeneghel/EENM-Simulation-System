import { describe, expect, it } from 'vitest';
import { defaultRequest } from '../domain/defaults';
import type { MusclePreset } from '../domain/simulation';
import type { FormValues } from './formModel';
import {
  applyClinicalStimulus,
  changeVariant,
  defaultFormValues,
  inactiveFields,
  minOutputStep,
  stepNumber,
  outputStepAdvice,
  parseForm,
  partitionFieldErrors,
  toFormValues,
} from './formModel';

const soleus: MusclePreset = { id: 'SOLEUS', label: 'Soleus', poolSize: { S: 800, FR: 50, FF: 50 } };
const tiny: MusclePreset = { id: 'TIBIALIS_ANTERIOR', label: 'TA', poolSize: { S: 3, FR: 1, FF: 1 } };
const fields = (r: ReturnType<typeof parseForm>) => (r.ok ? [] : r.errors.map((e) => e.field));
const requestOf = (v: FormValues, m: MusclePreset[] = [soleus]) => {
  const r = parseForm(v, m);
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  return r.request;
};

describe('form model — defaults per variant', () => {
  it('ORIGINAL defaults round-trip to the contract defaults (explicit 5/2/2, no trains)', () => {
    const r = parseForm(defaultFormValues('ORIGINAL'), [soleus]);
    expect(r).toEqual({ ok: true, request: defaultRequest('ORIGINAL'), notices: [] });
    expect(defaultRequest().modelVariant).toBe('ORIGINAL');
  });

  it('LITERATURE defaults omit unitsPerType (automatic 120 units)', () => {
    const v = defaultFormValues('LITERATURE');
    expect(v.manualUnits).toBe(false);
    const req = requestOf(v);
    expect(req.modelVariant).toBe('LITERATURE');
    expect('unitsPerType' in req).toBe(false);
    expect(JSON.parse(JSON.stringify(req))).not.toHaveProperty('unitsPerType');
  });

  it('LITERATURE with manual counts sends unitsPerType', () => {
    const v = { ...defaultFormValues('LITERATURE'), manualUnits: true, 'unitsPerType.S': '150' };
    expect(requestOf(v).unitsPerType).toEqual({ S: 150, FR: 2, FF: 2 });
  });

  it('ORIGINAL always sends unitsPerType, even if the manual flag is off', () => {
    expect(requestOf({ ...defaultFormValues('ORIGINAL'), manualUnits: false }).unitsPerType).toEqual({ S: 5, FR: 2, FF: 2 });
  });

  it('changeVariant keeps user values and resets the unit mode', () => {
    const v = { ...defaultFormValues(), 'stimulus.frequencyHz': '30' };
    const lit = changeVariant(v, 'LITERATURE');
    expect(lit).toMatchObject({ modelVariant: 'LITERATURE', manualUnits: false, 'stimulus.frequencyHz': '30' });
    expect(changeVariant(lit, 'ORIGINAL').manualUnits).toBe(true);
  });

  it('LITERATURE disables motoneuron-only fields and automatic unit inputs', () => {
    const lit = inactiveFields(defaultFormValues('LITERATURE'));
    for (const f of ['injectionSite', 'somaGeometry', 'dendriteGeometry', 'temperatureCelsius', 'unitsPerType.S'] as const) {
      expect(lit.has(f)).toBe(true);
    }
    const orig = inactiveFields(defaultFormValues('ORIGINAL'));
    expect(orig.has('temperatureCelsius')).toBe(false);
    expect(orig.has('unitsPerType.S')).toBe(false);
    expect(orig.has('stimulus.trainOnMs')).toBe(true);
  });

  it('calibration target: whole muscle by default, sent with the request, inactive for ORIGINAL', () => {
    expect(defaultFormValues('LITERATURE').calibrationTarget).toBe('WHOLE_MUSCLE');
    const single = { ...defaultFormValues('LITERATURE'), calibrationTarget: 'SINGLE_UNIT' };
    const parsed = parseForm(single, [soleus]);
    expect(parsed.ok && parsed.request.calibrationTarget).toBe('SINGLE_UNIT');
    expect(changeVariant(single, 'ORIGINAL').calibrationTarget).toBe('SINGLE_UNIT');
    expect(inactiveFields(defaultFormValues('ORIGINAL')).has('calibrationTarget')).toBe(true);
    expect(inactiveFields(single).has('calibrationTarget')).toBe(false);
  });
});

describe('form model — parsing and validation', () => {
  it('accepts a decimal comma', () => {
    expect(requestOf({ ...toFormValues(), temperatureCelsius: '36,5' }).temperatureCelsius).toBe(36.5);
  });

  it('reports empty and non-numeric inputs once', () => {
    const r = parseForm({ ...toFormValues(), 'stimulus.amplitude': '', seed: 'abc' });
    expect(r.ok).toBe(false);
    expect(fields(r)).toEqual(['stimulus.amplitude', 'seed']);
  });

  it.each([
    ['stimulus.durationMs', '5'],
    ['stimulus.durationMs', '300001'],
    ['stimulus.stepMs', '0.001'],
    ['stimulus.frequencyHz', '0'],
    ['stimulus.frequencyHz', '201'],
    ['stimulus.dutyCyclePercent', '100'],
    ['stimulus.amplitude', '-1'],
    ['stimulus.amplitude', '501'],
    ['unitsPerType.FR', '1.5'],
    ['axonLengthPercent', '0'],
    ['temperatureCelsius', '46'],
    ['seed', '-1'],
    ['outputStepMs', '11'],
    ['outputStepMs', '0.005'],
    ['outputStepMs', '0.015'],
  ] as const)('rejects %s = %s', (path, value) => {
    expect(fields(parseForm({ ...toFormValues(), [path]: value }))).toContain(path);
  });

  it('accepts the new upper bounds: 300000 ms duration and 200 units per type', () => {
    const v = { ...toFormValues(), 'stimulus.durationMs': '300000', 'unitsPerType.S': '200' };
    const req = requestOf(v, [soleus]);
    expect(req.stimulus.durationMs).toBe(300000);
    expect(req.unitsPerType?.S).toBe(200);
    expect(fields(parseForm({ ...toFormValues(), 'unitsPerType.S': '201' }))).toEqual(['unitsPerType.S']);
  });

  it('requires at least one motor unit', () => {
    const r = parseForm({ ...toFormValues(), 'unitsPerType.S': '0', 'unitsPerType.FR': '0', 'unitsPerType.FF': '0' });
    expect(fields(r)).toEqual(['unitsPerType']);
  });

  it("caps units by the selected muscle's pool size", () => {
    const v = { ...toFormValues(), muscle: 'TIBIALIS_ANTERIOR', 'unitsPerType.S': '4' };
    expect(fields(parseForm(v, [soleus, tiny]))).toEqual(['unitsPerType.S', 'unitsPerType.FR', 'unitsPerType.FF']);
  });

  it('does not validate unit counts in LITERATURE automatic mode', () => {
    const v = { ...defaultFormValues('LITERATURE'), 'unitsPerType.S': '9999' };
    expect(parseForm(v).ok).toBe(true);
  });

  it('peakTimeMs is required for TRIANGLE and must be inside the duration', () => {
    const tri = { ...toFormValues(), 'stimulus.modulation.shape': 'TRIANGLE' };
    expect(fields(parseForm(tri))).toEqual(['stimulus.modulation.peakTimeMs']);
    expect(fields(parseForm({ ...tri, 'stimulus.modulation.peakTimeMs': '1000' }))).toEqual(['stimulus.modulation.peakTimeMs']);
    expect(requestOf({ ...tri, 'stimulus.modulation.peakTimeMs': '500' }).stimulus.modulation.peakTimeMs).toBe(500);
  });

  it('sends peakTimeMs = null when the shape is not TRIANGLE', () => {
    expect(requestOf({ ...toFormValues(), 'stimulus.modulation.peakTimeMs': '300' }).stimulus.modulation.peakTimeMs).toBeNull();
  });

  it('partitions server errors into known inputs and general ones', () => {
    const { byField, general } = partitionFieldErrors([
      { field: 'stimulus.frequencyHz', message: 'a' },
      { field: 'stimulus.frequencyHz', message: 'b' },
      { field: 'unitsPerType', message: 'c' },
    ]);
    expect(byField['stimulus.frequencyHz']).toEqual(['a', 'b']);
    expect(general).toEqual([{ field: 'unitsPerType', message: 'c' }]);
  });
});

describe('form model — intermittent trains', () => {
  const trains = (on: string, period: string, duration = '1000') => ({
    ...toFormValues(),
    trainsEnabled: true,
    'stimulus.trainOnMs': on,
    'stimulus.trainPeriodMs': period,
    'stimulus.durationMs': duration,
  });

  it('disabled → both null; the form prefills 330 / 1000 for when they are enabled', () => {
    const v = toFormValues();
    expect(v.trainsEnabled).toBe(false);
    expect([v['stimulus.trainOnMs'], v['stimulus.trainPeriodMs']]).toEqual(['330', '1000']);
    const req = requestOf(v);
    expect([req.stimulus.trainOnMs, req.stimulus.trainPeriodMs]).toEqual([null, null]);
  });

  it('enabled → both sent', () => {
    const req = requestOf(trains('330', '1000'));
    expect([req.stimulus.trainOnMs, req.stimulus.trainPeriodMs]).toEqual([330, 1000]);
  });

  it('on = period is allowed', () => {
    expect(parseForm(trains('500', '500')).ok).toBe(true);
  });

  it.each([
    ['0', '1000', 'stimulus.trainOnMs'],
    ['600', '500', 'stimulus.trainOnMs'],
    ['330', '2000', 'stimulus.trainPeriodMs'],
    ['', '1000', 'stimulus.trainOnMs'],
    ['330', '', 'stimulus.trainPeriodMs'],
  ])('rejects on=%s period=%s', (on, period, field) => {
    expect(fields(parseForm(trains(on, period)))).toContain(field);
  });
});

describe('form model — clinical stimulus', () => {
  it('gives a 0.3 ms pulse (1.2 % at 40 Hz) and amplitude 153', () => {
    const r = applyClinicalStimulus(defaultFormValues('LITERATURE'))!;
    expect(r.values['stimulus.dutyCyclePercent']).toBe('1.2');
    expect(r.values['stimulus.amplitude']).toBe('153');
    expect(r.pulseMs).toBe(0.3);
    expect(r.clamped).toBe(false);
  });

  it('scales with frequency', () => {
    const r = applyClinicalStimulus({ ...defaultFormValues('LITERATURE'), 'stimulus.frequencyHz': '100' })!;
    expect(r.values['stimulus.dutyCyclePercent']).toBe('3');
  });

  it('clamps to the 1 % minimum at low frequencies and reports the real pulse', () => {
    const r = applyClinicalStimulus({ ...defaultFormValues('LITERATURE'), 'stimulus.frequencyHz': '20' })!;
    expect(r.values['stimulus.dutyCyclePercent']).toBe('1');
    expect(r.clamped).toBe(true);
    expect(r.pulseMs).toBe(0.5);
  });

  it('returns null for an invalid frequency and never touches other fields', () => {
    expect(applyClinicalStimulus({ ...toFormValues(), 'stimulus.frequencyHz': 'x' })).toBeNull();
    const before = defaultFormValues('LITERATURE');
    const after = applyClinicalStimulus(before)!.values;
    expect({ ...after, 'stimulus.dutyCyclePercent': '', 'stimulus.amplitude': '' }).toEqual({
      ...before,
      'stimulus.dutyCyclePercent': '',
      'stimulus.amplitude': '',
    });
  });
});

describe('form model — output step for long runs', () => {
  it('no advice up to 100k points (10 s at 0.1 ms)', () => {
    expect(outputStepAdvice({ ...toFormValues(), 'stimulus.durationMs': '10000' })).toBeNull();
  });

  it('suggests the smallest multiple of the step keeping ≤ 100k points', () => {
    expect(minOutputStep(60000, 0.01)).toBe(0.6);
    expect(minOutputStep(300000, 0.01)).toBe(3);
    expect(minOutputStep(25000, 0.03)).toBe(0.27);
    expect(outputStepAdvice({ ...toFormValues(), 'stimulus.durationMs': '60000' })).toEqual({
      points: 600001,
      suggestedMs: 0.6,
    });
  });

  it('auto-raises outputStepMs on submit and explains why', () => {
    const r = parseForm({ ...toFormValues(), 'stimulus.durationMs': '300000' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.request.outputStepMs).toBe(3);
    expect(r.notices).toHaveLength(1);
    expect(r.notices[0]?.field).toBe('outputStepMs');
    expect(r.request.stimulus.durationMs / r.request.outputStepMs).toBeLessThanOrEqual(100000);
  });

  it('keeps a user value that is already coarse enough', () => {
    const r = parseForm({ ...toFormValues(), 'stimulus.durationMs': '300000', outputStepMs: '5' });
    expect(r.ok && r.request.outputStepMs).toBe(5);
    expect(r.ok && r.notices).toEqual([]);
  });
});

describe('stepNumber', () => {
  it('adds without float noise and clamps at the minimum', () => {
    expect(stepNumber('0.2', 0.1)).toBe('0.3');
    expect(stepNumber('1,2', 0.1)).toBe('1.3');
    expect(stepNumber('0.01', 0.005)).toBe('0.015');
    expect(stepNumber('0', -1)).toBe('0');
    expect(stepNumber('', 1)).toBe('1');
    expect(stepNumber('1000', -100)).toBe('900');
  });
});
