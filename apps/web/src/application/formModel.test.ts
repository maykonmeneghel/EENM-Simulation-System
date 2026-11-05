import { describe, expect, it } from 'vitest';
import { defaultRequest } from '../domain/defaults';
import type { MusclePreset } from '../domain/simulation';
import type { FormValues } from './formModel';
import {
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

const manual = (v: FormValues = toFormValues()) => ({ ...v, manualUnits: true });

describe('form model — defaults', () => {
  it('the app defaults to the corrected model driven like a stimulator', () => {
    const req = requestOf(defaultFormValues());
    expect(req.modelVariant).toBe('LITERATURE');
    expect(req.stimulus).toMatchObject({
      pulseWidthUs: 300,
      waveform: 'BIPHASIC_SYMMETRIC',
      amplitude: 153,
      rampUpMs: 0,
      rampDownMs: 0,
      trainOnMs: null,
      trainPeriodMs: null,
    });
    expect(req.calibrationTarget).toBe('WHOLE_MUSCLE');
    expect(JSON.parse(JSON.stringify(req))).not.toHaveProperty('unitsPerType');
  });

  it('ORIGINAL contract defaults still round-trip (no stimulator fields)', () => {
    const r = parseForm(defaultFormValues('ORIGINAL'), [soleus]);
    expect(r).toEqual({ ok: true, request: defaultRequest('ORIGINAL'), notices: [] });
  });

  it('manual counts send unitsPerType', () => {
    const v = { ...manual(), 'unitsPerType.S': '150' };
    expect(requestOf(v).unitsPerType).toEqual({ S: 150, FR: 2, FF: 2 });
  });

  it('automatic units hide the counts; trains off disable on / off times', () => {
    const off = inactiveFields(defaultFormValues());
    for (const f of ['unitsPerType.S', 'stimulus.trainOnMs', 'stimulus.trainOffMs'] as const) expect(off.has(f)).toBe(true);
    expect(inactiveFields(manual()).has('unitsPerType.S')).toBe(false);
    expect(off.has('calibrationTarget')).toBe(false);
  });

  it('calibration target is sent with the request', () => {
    const parsed = parseForm({ ...defaultFormValues(), calibrationTarget: 'SINGLE_UNIT' }, [soleus]);
    expect(parsed.ok && parsed.request.calibrationTarget).toBe('SINGLE_UNIT');
  });
});

describe('form model — stimulator', () => {
  it.each([
    ['stimulus.pulseWidthUs', '10'],
    ['stimulus.pulseWidthUs', '1001'],
    ['stimulus.rampUpMs', '-1'],
    ['stimulus.rampDownMs', '60001'],
  ] as const)('rejects %s = %s', (path, value) => {
    expect(fields(parseForm({ ...toFormValues(), [path]: value }))).toContain(path);
  });

  it('both phases of a biphasic pulse must fit in the period', () => {
    // only reachable above the 200 Hz limit: 2 × 1000 µs fits in 5000 µs
    const v = { ...toFormValues(), 'stimulus.frequencyHz': '600', 'stimulus.pulseWidthUs': '1000' };
    expect(fields(parseForm(v))).toEqual(['stimulus.frequencyHz', 'stimulus.pulseWidthUs']);
    expect(fields(parseForm({ ...v, 'stimulus.waveform': 'MONOPHASIC' }))).toEqual(['stimulus.frequencyHz']);
  });

  it('ramps must fit in the on time (the run, or each train)', () => {
    expect(fields(parseForm({ ...toFormValues(), 'stimulus.rampUpMs': '600', 'stimulus.rampDownMs': '500' }))).toEqual([
      'stimulus.rampUpMs',
    ]);
    const trains = { ...toFormValues(), trainsEnabled: true, 'stimulus.rampUpMs': '200', 'stimulus.rampDownMs': '200' };
    expect(fields(parseForm(trains))).toEqual(['stimulus.rampUpMs']); // 330 ms on
    expect(requestOf({ ...trains, 'stimulus.rampDownMs': '100' }).stimulus).toMatchObject({ rampUpMs: 200, rampDownMs: 100 });
  });

  it('server errors on trainPeriodMs are shown on the off-time input', () => {
    const { byField } = partitionFieldErrors([{ field: 'stimulus.trainPeriodMs', message: 'x' }]);
    expect(byField['stimulus.trainOffMs']).toEqual(['x']);
  });
});

describe('form model — parsing and validation', () => {
  it('accepts a decimal comma', () => {
    expect(requestOf({ ...toFormValues(), axonLengthPercent: '80,5' }).axonLengthPercent).toBe(80.5);
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
    expect(fields(parseForm({ ...manual(), [path]: value }))).toContain(path);
  });

  it('accepts the new upper bounds: 300000 ms duration and 200 units per type', () => {
    const v = { ...manual(), 'stimulus.durationMs': '300000', 'unitsPerType.S': '200' };
    const req = requestOf(v, [soleus]);
    expect(req.stimulus.durationMs).toBe(300000);
    expect(req.unitsPerType?.S).toBe(200);
    expect(fields(parseForm({ ...manual(), 'unitsPerType.S': '201' }))).toEqual(['unitsPerType.S']);
  });

  it('requires at least one motor unit', () => {
    const r = parseForm({ ...manual(), 'unitsPerType.S': '0', 'unitsPerType.FR': '0', 'unitsPerType.FF': '0' });
    expect(fields(r)).toEqual(['unitsPerType']);
  });

  it("caps units by the selected muscle's pool size", () => {
    const v = { ...manual(), muscle: 'TIBIALIS_ANTERIOR', 'unitsPerType.S': '4' };
    expect(fields(parseForm(v, [soleus, tiny]))).toEqual(['unitsPerType.S', 'unitsPerType.FR', 'unitsPerType.FF']);
  });

  it('does not validate unit counts in LITERATURE automatic mode', () => {
    const v = { ...defaultFormValues('LITERATURE'), 'unitsPerType.S': '9999' };
    expect(parseForm(v).ok).toBe(true);
  });

  it('peakTimeMs is required for TRIANGLE and must be inside the duration (ORIGINAL)', () => {
    const tri = { ...defaultFormValues('ORIGINAL'), 'stimulus.modulation.shape': 'TRIANGLE' };
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
  const trains = (on: string, off: string, duration = '1000') => ({
    ...toFormValues(),
    trainsEnabled: true,
    'stimulus.trainOnMs': on,
    'stimulus.trainOffMs': off,
    'stimulus.durationMs': duration,
  });

  it('disabled → both null; the form prefills 330 on / 670 off for when they are enabled', () => {
    const v = toFormValues();
    expect(v.trainsEnabled).toBe(false);
    expect([v['stimulus.trainOnMs'], v['stimulus.trainOffMs']]).toEqual(['330', '670']);
    const req = requestOf(v);
    expect([req.stimulus.trainOnMs, req.stimulus.trainPeriodMs]).toEqual([null, null]);
  });

  it('enabled → on and period = on + off', () => {
    const req = requestOf(trains('330', '670'));
    expect([req.stimulus.trainOnMs, req.stimulus.trainPeriodMs]).toEqual([330, 1000]);
  });

  it('off = 0 is allowed (on = period)', () => {
    expect(parseForm(trains('500', '0')).ok).toBe(true);
  });

  it('round-trips a request with trains to on / off', () => {
    const v = toFormValues({ ...requestOf(trains('2000', '3000', '10000')) });
    expect([v['stimulus.trainOnMs'], v['stimulus.trainOffMs']]).toEqual(['2000', '3000']);
  });

  it.each([
    ['0', '1000', 'stimulus.trainOnMs'],
    ['330', '1670', 'stimulus.trainPeriodMs'],
    ['', '1000', 'stimulus.trainOnMs'],
    ['330', '', 'stimulus.trainOffMs'],
  ])('rejects on=%s off=%s', (on, off, field) => {
    expect(fields(parseForm(trains(on, off)))).toContain(field);
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
