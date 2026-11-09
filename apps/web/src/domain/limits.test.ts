import { afterEach, describe, expect, it } from 'vitest';
import { defaultFormValues, parseForm, pointBudget } from '../application/formModel';
import { setLocale } from '../i18n/locale';
import { defaultRequest } from './defaults';
import type { ServerLimits } from './limits';
import { CONTRACT_LIMITS, limitsDuration, parseLimits } from './limits';
import { validateRequest } from './validation';

const HOSTED: ServerLimits = {
  ...CONTRACT_LIMITS,
  maxDurationMs: 5000,
  minStepMs: 0.01,
  maxFrequencyHz: 100,
  maxUnitsPerType: 120,
  maxTotalUnits: 120,
  maxOutputPoints: 100_000,
  maxUnitEventsDurationMs: 5000,
};

afterEach(() => setLocale('pt-BR'));

describe('server limits', () => {
  it('parses the API answer and keeps the contract for anything missing or malformed', () => {
    expect(parseLimits({ ...HOSTED })).toEqual(HOSTED);
    expect(parseLimits({ maxDurationMs: 5000, maxOutputPoints: null, minStepMs: -1, maxFrequencyHz: 'x' })).toEqual({
      ...CONTRACT_LIMITS,
      maxDurationMs: 5000,
    });
    expect(parseLimits(null)).toEqual(CONTRACT_LIMITS);
    expect(limitsDuration(HOSTED)).toBe(true);
    expect(limitsDuration(CONTRACT_LIMITS)).toBe(false);
  });

  it('says in both languages that the server limits the duration', () => {
    const req = defaultRequest();
    req.stimulus.durationMs = 6000;
    expect(validateRequest(req, undefined, HOSTED)).toEqual([
      { field: 'stimulus.durationMs', message: 'este servidor limita a duração a 5000 ms' },
    ]);
    setLocale('en');
    expect(validateRequest(req, undefined, HOSTED)).toEqual([
      { field: 'stimulus.durationMs', message: 'this server limits the duration to 5000 ms' },
    ]);
    expect(validateRequest(req)).toEqual([]); // the same run is fine on a server without limits
  });

  it('checks the step, frequency and units against the limits', () => {
    const req = defaultRequest('ORIGINAL');
    req.stimulus.stepMs = 0.005;
    req.stimulus.frequencyHz = 150;
    req.unitsPerType = { S: 100, FR: 15, FF: 15 };
    req.outputStepMs = 0.01;
    expect(validateRequest(req, undefined, HOSTED).map((e) => e.field)).toEqual([
      'stimulus.stepMs',
      'stimulus.frequencyHz',
      'unitsPerType',
    ]);
  });

  it('raises the output step to the server cap of points and asks for the 3D events only within its limit', () => {
    expect(pointBudget(HOSTED)).toBe(100_000);
    expect(pointBudget({ ...HOSTED, maxOutputPoints: 20_000 })).toBe(20_000);
    expect(pointBudget(CONTRACT_LIMITS)).toBe(100_000);
    const values = { ...defaultFormValues(), 'stimulus.durationMs': '5000', outputStepMs: '0.01' };
    const r = parseForm(values, [], { ...HOSTED, maxOutputPoints: 20_000 });
    expect(r.ok && r.request.outputStepMs).toBe(0.25);
    const forearm = { ...defaultFormValues(), muscle: 'FLEXOR_CARPI_RADIALIS', 'stimulus.durationMs': '4000' };
    const withEvents = parseForm(forearm, [], HOSTED);
    expect(withEvents.ok && withEvents.request.output).toEqual({ unitEvents: true });
    const without = parseForm(forearm, [], { ...HOSTED, maxUnitEventsDurationMs: 3000 });
    expect(without.ok && without.request.output).toBeUndefined();
  });
});
