import { describe, expect, it } from 'vitest';
import { defaultRequest } from '../domain/defaults';
import type { MusclePreset } from '../domain/simulation';
import { parseForm, partitionFieldErrors, toFormValues } from './formModel';

const soleus: MusclePreset = { id: 'SOLEUS', label: 'Soleus', poolSize: { S: 800, FR: 50, FF: 50 } };
const tiny: MusclePreset = { id: 'TIBIALIS_ANTERIOR', label: 'TA', poolSize: { S: 3, FR: 1, FF: 1 } };
const fields = (r: ReturnType<typeof parseForm>) => (r.ok ? [] : r.errors.map((e) => e.field));

describe('form model', () => {
  it('defaults round-trip to the contract defaults', () => {
    expect(parseForm(toFormValues(), [soleus])).toEqual({ ok: true, request: defaultRequest() });
  });

  it('accepts a decimal comma', () => {
    const v = { ...toFormValues(), temperatureCelsius: '36,5' };
    const r = parseForm(v);
    expect(r.ok && r.request.temperatureCelsius).toBe(36.5);
  });

  it('reports empty and non-numeric inputs once', () => {
    const r = parseForm({ ...toFormValues(), 'stimulus.amplitude': '', seed: 'abc' });
    expect(r.ok).toBe(false);
    expect(fields(r)).toEqual(['stimulus.amplitude', 'seed']);
  });

  it.each([
    ['stimulus.durationMs', '5'],
    ['stimulus.durationMs', '5001'],
    ['stimulus.stepMs', '0.001'],
    ['stimulus.frequencyHz', '0'],
    ['stimulus.frequencyHz', '201'],
    ['stimulus.dutyCyclePercent', '100'],
    ['stimulus.amplitude', '-1'],
    ['stimulus.amplitude', '501'],
    ['unitsPerType.S', '51'],
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

  it('requires at least one motor unit', () => {
    const r = parseForm({ ...toFormValues(), 'unitsPerType.S': '0', 'unitsPerType.FR': '0', 'unitsPerType.FF': '0' });
    expect(fields(r)).toEqual(['unitsPerType']);
  });

  it("caps units by the selected muscle's pool size", () => {
    const v = { ...toFormValues(), muscle: 'TIBIALIS_ANTERIOR', 'unitsPerType.S': '4' };
    expect(fields(parseForm(v, [soleus, tiny]))).toEqual(['unitsPerType.S', 'unitsPerType.FR', 'unitsPerType.FF']);
  });

  it('peakTimeMs is required for TRIANGLE and must be inside the duration', () => {
    const tri = { ...toFormValues(), 'stimulus.modulation.shape': 'TRIANGLE' };
    expect(fields(parseForm(tri))).toEqual(['stimulus.modulation.peakTimeMs']);
    expect(fields(parseForm({ ...tri, 'stimulus.modulation.peakTimeMs': '1000' }))).toEqual(['stimulus.modulation.peakTimeMs']);
    const ok = parseForm({ ...tri, 'stimulus.modulation.peakTimeMs': '500' });
    expect(ok.ok && ok.request.stimulus.modulation.peakTimeMs).toBe(500);
  });

  it('sends peakTimeMs = null when the shape is not TRIANGLE', () => {
    const r = parseForm({ ...toFormValues(), 'stimulus.modulation.peakTimeMs': '300' });
    expect(r.ok && r.request.stimulus.modulation.peakTimeMs).toBeNull();
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
