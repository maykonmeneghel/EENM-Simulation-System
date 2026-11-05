import { describe, expect, it } from 'vitest';
import {
  axonRecruitment,
  conductionDelays,
  forceWeights,
  junctionGain,
  junctionLambda,
  normalisedForce,
  pulseWidthMs,
  rateGain,
  rateRegimeLimits,
  fatigueRate,
  poolValue,
  selectedUnitIndices,
  simulatedSpan,
  stagesFor,
  temperatureFactor,
  TYPE_RANGES,
  twitch,
  twitchShape,
  typeParameterSpans,
} from './modelEquations';

describe('model equations — derived values', () => {
  it('stages per variant follow model-equations.md', () => {
    expect(stagesFor('ORIGINAL')).toEqual(['1', '2a', '3', '4', '5a', '8a']);
    expect(stagesFor('LITERATURE')).toEqual(['1', '2b', '3', '4', '5b', '6', '7', '8b']);
  });

  it('PW = D/(100 f): 20 % at 40 Hz → 5 ms; 1.2 % → 0.3 ms', () => {
    expect(pulseWidthMs(40, 20)).toBeCloseTo(5, 12);
    expect(pulseWidthMs(40, 1.2)).toBeCloseTo(0.3, 12);
    expect(pulseWidthMs(0, 20)).toBeNaN();
  });

  it('φ = 3^((T − 6.3)/10)', () => {
    expect(temperatureFactor(6.3)).toBe(1);
    expect(temperatureFactor(16.3)).toBeCloseTo(3, 12);
  });

  it('Weiss threshold range at 0.3 ms is exactly 56.9 … 102.1 (exact I_rh,min and R)', () => {
    const r = axonRecruitment(153, 0.3)!;
    expect(r.thresholdMin).toBeCloseTo(56.9, 10);
    expect(r.thresholdMax).toBeCloseTo(102.1, 10);
    expect(r.status).toBe('all');
    expect(r.fraction).toBe(1);
  });

  it('recruitment status: partial and none', () => {
    const mid = axonRecruitment(80, 0.3)!;
    expect(mid.status).toBe('partial');
    expect(mid.fraction).toBeCloseTo((80 - 56.9) / (102.1 - 56.9), 10);
    expect(axonRecruitment(56.8, 0.3)!.status).toBe('none');
    expect(axonRecruitment(102.1, 0.3)!.status).toBe('all');
    expect(axonRecruitment(50, 0.3)!.fraction).toBe(0);
    // A long pulse lowers the threshold: 5 ms → I_rh,min·1.0918 ≈ 24.55
    expect(axonRecruitment(30, 5)!.status).toBe('partial');
    expect(axonRecruitment(100, NaN)).toBeNull();
  });

  it('conduction delays for v = 44 and 53 m/s', () => {
    const lit = conductionDelays('LITERATURE', 80, 1000, 0.01);
    expect(lit.map((d) => d.velocity)).toEqual([44, 53]);
    expect(lit[0]!.ms).toBeCloseTo((0.8 / 44) * 1000, 9);
    expect(lit[1]!.ms).toBeCloseTo((0.8 / 53) * 1000, 9);
    expect(lit[0]!.samples).toBeCloseTo(((0.8 / 44) * 1000) / 0.01, 6);
    // LITERATURE does not depend on duration; ORIGINAL scales with T (Q4).
    expect(conductionDelays('LITERATURE', 80, 30000, 0.01)[0]!.ms).toBeCloseTo(lit[0]!.ms, 9);
    const orig = conductionDelays('ORIGINAL', 80, 2000, 0.01);
    expect(orig[0]!.ms).toBeCloseTo((0.8 / 44) * 2000, 9);
  });

  it('junction gain 0.070·λ/2·e^(−x/λ)', () => {
    const lambda = Math.sqrt(1 / 0.07);
    expect(junctionLambda()).toBeCloseTo(lambda, 12);
    expect(junctionGain(80)).toBeCloseTo(((0.07 * lambda) / 2) * Math.exp(-0.8 / lambda), 12);
  });

  it('twitch peaks at P when t = T for any m', () => {
    expect(twitch(10, 2, 10, 1)).toBeCloseTo(2, 12);
    expect(twitch(10, 2, 10, 3.9461)).toBeCloseTo(2, 12);
    expect(twitch(5, 1, 10, 3.9461)).toBeLessThan(twitch(5, 1, 10, 1));
    expect(twitch(0, 1, 10, 1)).toBe(0);
  });

  it('rate saturation NF and g', () => {
    expect(normalisedForce(0.4)).toBeCloseTo(0.12, 12);
    expect(normalisedForce(1)).toBeCloseTo(1 - Math.exp(-2), 12);
    expect(rateGain(0.2)).toBeCloseTo(1, 12);
    expect(rateGain(1)).toBeCloseTo((1 - Math.exp(-2)) / 0.3, 12);
    expect(rateRegimeLimits(25)).toEqual({ kneeTkMs: 10, pauseTkMs: 6.25 });
  });

  it('8b weights = N_pool / N_sim (soleus 800/50/50 as 106/7/7)', () => {
    const w = forceWeights({ S: 800, FR: 50, FF: 50 }, { S: 106, FR: 7, FF: 7 });
    expect(w.S).toBeCloseTo(800 / 106, 12);
    expect(w.FR).toBeCloseTo(50 / 7, 12);
    expect(forceWeights({ S: 800, FR: 50, FF: 50 }, { S: 10, FR: 0, FF: 1 }).FR).toBeNull();
  });
});

describe('model equations — per-type unit parameters', () => {
  it('linear spread across the pool', () => {
    expect(poolValue(TYPE_RANGES.S.mttpMs, 800, 0)).toBe(110);
    expect(poolValue(TYPE_RANGES.S.mttpMs, 800, 799)).toBe(100);
    expect(poolValue(TYPE_RANGES.FF.mt, 50, 49)).toBeCloseTo(0.491, 12);
  });

  it('selected units: first ones (ORIGINAL) or slice centres (LITERATURE)', () => {
    expect(selectedUnitIndices('ORIGINAL', 800, 5)).toEqual([0, 1, 2, 3, 4]);
    expect(selectedUnitIndices('LITERATURE', 50, 7)).toEqual([3, 10, 17, 25, 32, 39, 46]);
    expect(selectedUnitIndices('LITERATURE', 800, 0)).toEqual([]);
  });

  it('spans: ORIGINAL S 5 of 800 stays near the first value; unknown count → whole pool', () => {
    const sp = simulatedSpan(TYPE_RANGES.S.mttpMs, 'ORIGINAL', 800, 5)!;
    expect(sp.from).toBe(110);
    expect(sp.to).toBeCloseTo(110 - (10 * 4) / 799, 10);
    expect(simulatedSpan(TYPE_RANGES.S.mttpMs, 'LITERATURE', 800, null)).toEqual({ from: 110, to: 100 });
    expect(simulatedSpan(TYPE_RANGES.S.mttpMs, 'ORIGINAL', 800, 0)).toBeNull();
  });

  it('FAT_k spans 0.0125 %/s (weakest) to 0.0125·180 = 2.25 %/s (strongest)', () => {
    expect(fatigueRate(0.103)).toBeCloseTo(0.0125, 12);
    expect(fatigueRate(0.491)).toBeCloseTo(2.25, 12);
  });

  it('typeParameterSpans: T_k ×1.2772 in LITERATURE, delays from APAT', () => {
    const pool = { S: 800, FR: 50, FF: 50 };
    const lit = typeParameterSpans('LITERATURE', pool, null, 80, 1000);
    expect(lit.S.tkMs!.from).toBeCloseTo(110 * 1.2772, 10);
    expect(lit.S.tkMs!.to).toBeCloseTo(100 * 1.2772, 10);
    expect(lit.S.delayMs!.from).toBeCloseTo((0.8 / 44) * 1000, 10);
    expect(lit.FF.delayMs!.to).toBeCloseTo((0.8 / 53) * 1000, 10);
    expect(lit.FF.fatigue!.to).toBeCloseTo(2.25, 10);
    const orig = typeParameterSpans('ORIGINAL', pool, { S: 5, FR: 0, FF: 2 }, 80, 2000);
    expect(orig.S.tkMs!.from).toBe(110);
    expect(orig.FR.mt).toBeNull();
    expect(orig.S.delayMs!.from).toBeCloseTo((0.8 / 44) * 2000, 10);
  });

  it('calibration targets: twitch constants of model_options.TWITCH_CALIBRATION, no effect on ORIGINAL', () => {
    expect(twitchShape('LITERATURE')).toEqual({ m: 3.9461, timeScale: 1.2772 });
    expect(twitchShape('LITERATURE', 'SINGLE_UNIT')).toEqual({ m: 2.0862, timeScale: 0.7426 });
    expect(twitchShape('ORIGINAL', 'SINGLE_UNIT')).toEqual({ m: 1, timeScale: 1 });
    const pool = { S: 800, FR: 50, FF: 50 };
    const unit = typeParameterSpans('LITERATURE', pool, null, 80, 1000, 'SINGLE_UNIT');
    expect(unit.S.tkMs!.from).toBeCloseTo(110 * 0.7426, 10);
  });
});
