import { describe, expect, it } from 'vitest';
import fixture from './electrode.fixture.json';
import type { CalibrationRequest, Electrode } from './electrode';
import {
  DEFAULT_ELECTRODES,
  FAT_OPTIONS,
  centreDepolarisation,
  defaultElectrode,
  depolarisation,
  electrodeArea,
  equivalentRadius,
  excitability,
  peakDepolarisation,
} from './electrode';
import { CONSTANTS, axonRecruitment } from './modelEquations';
import { MUSCLES } from './simulation';

const BASE = { tauSdMs: CONSTANTS.tauSdMs, rheobaseMin: CONSTANTS.rheobaseMin, rheobaseSpread: CONSTANTS.rheobaseSpread };

interface FixtureElectrode {
  shape: 'RECTANGLE' | 'ROUND';
  widthCm: number | null;
  lengthCm: number | null;
  diameterCm: number | null;
  fatThicknessCm: number;
  axonDepthCm: number;
}

describe('electrode factor G (kept equal to the engine by electrode.fixture.json)', () => {
  it('has the engine’s default electrode for every muscle', () => {
    expect(DEFAULT_ELECTRODES).toEqual(fixture.defaults);
  });

  it('finds the same peak of the activating function as the engine', () => {
    for (const p of fixture.peaks) expect(peakDepolarisation(p.radiusCm, p.depthCm).peak).toBeCloseTo(p.peak, 9);
  });

  it('gives the engine’s G for every electrode of the fixture', () => {
    for (const f of fixture.factors) {
      const x = excitability(f.muscle, { electrode: f.electrode as FixtureElectrode as Electrode, effectModel: 'HALF_SPACE_AF', calibration: null }, BASE);
      expect(x!.g, `${f.muscle} ${JSON.stringify(f.electrode)}`).toBeCloseTo(f.g, 9);
    }
  });

  it('gives the engine’s calibrated thresholds (mA)', () => {
    for (const c of fixture.calibrated) {
      const electrode = (c.electrode as FixtureElectrode | null) ?? defaultElectrode(c.muscle);
      const x = excitability(c.muscle, { electrode, effectModel: 'HALF_SPACE_AF', calibration: c.calibration as CalibrationRequest }, { ...BASE, tauSdMs: c.tauSdMs });
      expect(x!.unit).toBe('MA');
      expect(x!.g).toBeCloseTo(c.g, 9);
      const r = axonRecruitment(0, c.pulseWidthMs, c.tauSdMs, x)!;
      expect(r.thresholdMin).toBeCloseTo(c.thresholdMin, 9);
      expect(r.thresholdMax).toBeCloseTo(c.thresholdMax, 9);
    }
  });

  it('V1: the numeric activating function at the centre matches the closed form', () => {
    for (const [a, d] of [
      [0.5, 1],
      [2.8, 1.25],
      [3.8, 1.25],
      [1.25, 0.35],
    ] as const)
      expect(Math.abs(depolarisation(0, a, d) / centreDepolarisation(a, d) - 1)).toBeLessThan(1e-5);
  });

  it('G is exactly 1 at each muscle’s default electrode, so a default run keeps today’s thresholds', () => {
    for (const m of MUSCLES) {
      const x = excitability(m, { electrode: defaultElectrode(m), effectModel: 'HALF_SPACE_AF', calibration: null }, BASE)!;
      expect(x.g, m).toBe(1);
      const r = axonRecruitment(100, 0.3, CONSTANTS.tauSdMs, x)!;
      expect(r).toEqual(axonRecruitment(100, 0.3)); // 56.9 … 102.1, as before
    }
  });

  it('a larger electrode or thicker fat raises the threshold; “no effect” keeps G = 1', () => {
    const soleus = defaultElectrode('SOLEUS');
    const g = (e: Electrode) => excitability('SOLEUS', { electrode: e, effectModel: 'HALF_SPACE_AF', calibration: null }, BASE)!.g;
    expect(g({ ...soleus, lengthCm: 9 })).toBeGreaterThan(1.5);
    expect(g({ ...soleus, fatThicknessCm: 2 })).toBeGreaterThan(1);
    expect(g({ ...soleus, fatThicknessCm: 0.25 })).toBeLessThan(1);
    const none = excitability('SOLEUS', { electrode: { ...soleus, lengthCm: 9 }, effectModel: 'NONE', calibration: null }, BASE)!;
    expect(none.g).toBe(1);
  });

  it('a round pad of the same area gives the same G (shape enters only through the area)', () => {
    const square: Electrode = { ...defaultElectrode('SOLEUS'), widthCm: 4, lengthCm: 4 };
    const disk: Electrode = { ...square, shape: 'ROUND', widthCm: null, lengthCm: null, diameterCm: 2 * equivalentRadius(16) };
    expect(electrodeArea(disk)).toBeCloseTo(16, 12);
    const g = (e: Electrode) => excitability('SOLEUS', { electrode: e, effectModel: 'HALF_SPACE_AF', calibration: null }, BASE)!.g;
    expect(g(disk)).toBeCloseTo(g(square), 12);
  });

  it('every muscle has a sourced default fat thickness that is the default electrode’s', () => {
    for (const m of MUSCLES) expect(FAT_OPTIONS[m][0]!.valueCm, m).toBe(DEFAULT_ELECTRODES[m].fatThicknessCm);
    expect(FAT_OPTIONS.FLEXOR_CARPI_RADIALIS[0]!.citation).toBe('Doğan 2022');
    expect(FAT_OPTIONS.EXTENSOR_CARPI_RADIALIS[0]!.provenance).toBe('INHERITED');
  });
});
