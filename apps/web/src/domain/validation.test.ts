import { describe, expect, it } from 'vitest';
import { defaultRequest } from './defaults';
import { validateRequest } from './validation';

const fields = (r: ReturnType<typeof defaultRequest>) => validateRequest(r).map((e) => e.field);

describe('validateRequest', () => {
  it('accepts both variant defaults', () => {
    expect(validateRequest(defaultRequest('ORIGINAL'))).toEqual([]);
    expect(validateRequest(defaultRequest('LITERATURE'))).toEqual([]);
  });

  it('train fields: both or neither', () => {
    const r = defaultRequest();
    r.stimulus.trainOnMs = 330;
    expect(fields(r)).toEqual(['stimulus.trainPeriodMs']);
    r.stimulus.trainOnMs = null;
    r.stimulus.trainPeriodMs = 1000;
    expect(fields(r)).toEqual(['stimulus.trainOnMs']);
  });

  it('train fields: 0 < on ≤ period ≤ durationMs', () => {
    const r = defaultRequest();
    r.stimulus.trainOnMs = 330;
    r.stimulus.trainPeriodMs = 1000;
    expect(fields(r)).toEqual([]);
    r.stimulus.trainPeriodMs = 1001;
    expect(fields(r)).toEqual(['stimulus.trainPeriodMs']);
  });

  it('missing unitsPerType is valid (variant default applies)', () => {
    const r = defaultRequest('ORIGINAL');
    delete r.unitsPerType;
    expect(validateRequest(r)).toEqual([]);
  });
});
