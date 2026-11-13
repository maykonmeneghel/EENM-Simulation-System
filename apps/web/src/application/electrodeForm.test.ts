import { describe, expect, it } from 'vitest';
import { defaultRequest } from '../domain/defaults';
import { parseExportFile, toExportFile } from '../domain/savedSimulation';
import { savedFixture } from '../domain/savedSimulation.fixture';
import type { SimulationRequest } from '../domain/simulation';
import { amplitudeUnit, differingFields } from './comparison';
import { padOf } from './anatomy3d';
import { changeMuscle, defaultFormValues, electrodeInput, inactiveFields, parseForm, toFormValues } from './formModel';

const ok = (r: ReturnType<typeof parseForm>) => {
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  return r.request;
};

/** A request saved before the electrode existed (no `electrode` field). */
const older = (): SimulationRequest => {
  const r = defaultRequest('LITERATURE');
  delete r.electrode;
  return r;
};

describe('electrode in the form and in saved runs', () => {
  it('sends the muscle’s default electrode with the derived effect on skin-surface LITERATURE runs only', () => {
    const r = ok(parseForm(defaultFormValues()));
    expect(r.electrode).toEqual({ shape: 'RECTANGLE', widthCm: 5, lengthCm: 5, fatThicknessCm: 0.75, axonDepthCm: 0.5, effectModel: 'HALF_SPACE_AF' });
    expect(ok(parseForm({ ...defaultFormValues(), stimulationSite: 'MOTONEURON_POOL' })).electrode).toBeUndefined();
    expect(ok(parseForm(defaultFormValues('ORIGINAL'))).electrode).toBeUndefined();
    expect(inactiveFields({ ...defaultFormValues(), stimulationSite: 'MOTONEURON_POOL' }).has('electrode.widthCm')).toBe(true);
  });

  it('switching muscle resets the electrode to the new muscle’s default and drops the calibration', () => {
    const v = changeMuscle({ ...defaultFormValues(), calibrationEnabled: true, 'electrode.widthCm': '9' }, 'FLEXOR_CARPI_RADIALIS');
    expect(v.calibrationEnabled).toBe(false);
    expect(ok(parseForm(v)).electrode).toEqual({ shape: 'ROUND', diameterCm: 2.5, fatThicknessCm: 0.56, axonDepthCm: 0.5, effectModel: 'HALF_SPACE_AF' });
    expect(ok(parseForm(changeMuscle(defaultFormValues(), 'GASTROCNEMIUS_MEDIAL'))).electrode).toMatchObject({ shape: 'ROUND', diameterCm: 5, fatThicknessCm: 0.75 });
  });

  it('a calibration round-trips through the form and puts the amplitude in mA', () => {
    const values = {
      ...defaultFormValues(),
      calibrationEnabled: true,
      'electrode.calibration.motorThresholdMa': '18',
      'electrode.calibration.fullRecruitmentMa': '',
      'electrode.calibration.pulseWidthUs': '300',
    };
    const r = ok(parseForm(values));
    expect(r.electrode!.calibration).toEqual({ motorThresholdMa: 18, fullRecruitmentMa: null, pulseWidthUs: 300, electrodeAreaCm2: 25 });
    expect(toFormValues(r).calibrationEnabled).toBe(true);
    expect(ok(parseForm(toFormValues(r)))).toEqual(r);
    expect(amplitudeUnit({ request: r })).toBe('MA');
    const bad = parseForm({ ...values, 'electrode.calibration.fullRecruitmentMa': '10' });
    expect(bad.ok).toBe(false);
  });

  it('rejects an electrode area outside 0.5–100 cm² in the form', () => {
    const r = parseForm({ ...defaultFormValues(), 'electrode.widthCm': '12', 'electrode.lengthCm': '12' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.map((e) => e.field)).toContain('electrode.widthCm');
  });

  it('a run saved before the electrode existed loads with the muscle’s default and does not differ from a new default run', () => {
    const old = savedFixture({ request: older() });
    const [back] = parseExportFile(JSON.stringify(toExportFile([old]))); // export v1, unchanged
    expect(back!.request.electrode).toBeUndefined();
    const form = toFormValues(back!.request);
    expect(electrodeInput(form)!.electrode).toMatchObject({ shape: 'RECTANGLE', widthCm: 5, lengthCm: 5, fatThicknessCm: 0.75 });
    expect(form['electrode.effectModel']).toBe('HALF_SPACE_AF'); // G = 1 at the default: the same math as when it ran
    expect(differingFields([back!, savedFixture({ id: 'b' })])).toEqual([]);
    expect(amplitudeUnit(back!)).toBe('MODEL_UNIT');
    const bigger = savedFixture({ id: 'c', request: { ...defaultRequest('LITERATURE'), electrode: { ...defaultRequest('LITERATURE').electrode!, lengthCm: 9 } } });
    expect(differingFields([back!, bigger]).map((d) => d.key)).toEqual(['electrode.lengthCm']);
  });

  it('the 3D pad takes the run’s electrode size and shape, else the 25 mm fallback', () => {
    expect(padOf({ electrode: null })).toMatchObject({ shape: 'ROUND', radiusM: 0.0125, fromRun: false });
    const rect = padOf({
      electrode: { shape: 'RECTANGLE', widthCm: 5, lengthCm: 9, diameterCm: null, areaCm2: 45, fatThicknessCm: 0.75, axonDepthCm: 0.5, effectModel: 'HALF_SPACE_AF', thresholdFactor: 1.95, calibration: null },
    });
    expect(rect).toMatchObject({ shape: 'RECTANGLE', lengthM: 0.09, widthM: 0.05, fromRun: true, thresholdFactor: 1.95 });
    const round = padOf({
      electrode: { shape: 'ROUND', widthCm: null, lengthCm: null, diameterCm: 5, areaCm2: 19.63, fatThicknessCm: 0.75, axonDepthCm: 0.5, effectModel: 'NONE', thresholdFactor: 1, calibration: null },
    });
    expect(round.radiusM).toBeCloseTo(0.025, 12);
  });
});
