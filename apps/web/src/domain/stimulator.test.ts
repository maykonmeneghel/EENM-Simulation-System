import { describe, expect, it } from 'vitest';
import fixture from './stimulator.fixture.json';
import type { StimulatorSettings } from './stimulator';
import {
  changePoints,
  envelope,
  envelopeOutline,
  stepped,
  envelopeWindowMs,
  pulseOutline,
  pulseRecruitment,
  stimulatorCurrent,
  stimulatorProblems,
} from './stimulator';

type Case = { settings: Record<string, number | string>; samples: [number, number, number][] };

function toSettings(raw: Record<string, number | string>): StimulatorSettings {
  return {
    frequencyHz: raw.frequency_hz as number,
    pulseWidthUs: raw.pulse_width_us as number,
    amplitude: raw.amplitude as number,
    waveform: (raw.waveform as StimulatorSettings['waveform']) ?? 'MONOPHASIC',
    durationMs: raw.duration_ms as number,
    trainOnMs: (raw.train_on_ms as number) ?? null,
    trainPeriodMs: (raw.train_period_ms as number) ?? null,
    rampUpMs: (raw.ramp_up_ms as number) ?? 0,
    rampDownMs: (raw.ramp_down_ms as number) ?? 0,
  };
}

const base: StimulatorSettings = toSettings((fixture as unknown as Record<string, Case>)['mono-40Hz-300us']!.settings);

describe('stimulator preview = engine', () => {
  for (const [name, c] of Object.entries(fixture as unknown as Record<string, Case>)) {
    it(`matches stimulus_current and envelope of the engine: ${name}`, () => {
      const s = toSettings(c.settings);
      for (const [t, current, env] of c.samples) {
        expect(stimulatorCurrent(t, s), `I(${t})`).toBeCloseTo(current, 9);
        expect(envelope(t, s), `env(${t})`).toBeCloseTo(env, 9);
      }
    });
  }
});

describe('stimulator scopes', () => {
  it('pulse outline: one phase, or +1 then -1 for the same width', () => {
    const mono = pulseOutline(base).points;
    expect(mono).toContainEqual([0, 1]);
    expect(mono).toContainEqual([300, 0]);
    const bi = pulseOutline({ ...base, waveform: 'BIPHASIC_SYMMETRIC' }).points;
    expect(bi).toContainEqual([300, -1]);
    expect(bi).toContainEqual([600, 0]);
  });

  it('envelope outline: ramps and off time of every train in the window', () => {
    const s = { ...base, durationMs: 10_000, trainOnMs: 2000, trainPeriodMs: 4000, rampUpMs: 500, rampDownMs: 1000 };
    const pts = envelopeOutline(s);
    expect(pts).toContainEqual([500, 120]);
    expect(pts).toContainEqual([1000, 120]);
    expect(pts).toContainEqual([2000, 0]);
    expect(pts).toContainEqual([4500, 120]);
    expect(pts).toContainEqual([8500, 120]); // third train: the window is the whole 10 s run
    expect(Math.max(...pts.map((p) => p[0]))).toBeLessThanOrEqual(10_000);
  });

  it('envelope outline keeps the plateau to the end of a train without ramp down, then drops', () => {
    const s = { ...base, durationMs: 6000, trainOnMs: 2000, trainPeriodMs: 3000, rampUpMs: 500, rampDownMs: 0 };
    const pts = envelopeOutline(s);
    expect(pts.slice(0, 4)).toEqual([
      [0, 0],
      [500, 120],
      [2000, 120],
      [2000, 0],
    ]);
    // every outline point is the engine envelope just inside the train (or 0 at the drop)
    for (const [t, y] of pts) {
      const inside = Math.min(envelope(Math.max(0, t - 1e-6), s), envelope(t, s) || envelope(t - 1e-6, s));
      expect(y === 0 || Math.abs(y - s.amplitude * inside) < 1e-3).toBe(true);
    }
  });

  it('without ramps every train is a step: vertical rise from zero and vertical drop (no line between trains)', () => {
    const s = { ...base, durationMs: 1000, trainOnMs: 105, trainPeriodMs: 775, rampUpMs: 0, rampDownMs: 0 };
    const pts = envelopeOutline(s);
    expect(pts).toEqual([
      [0, 0],
      [0, 120],
      [105, 120],
      [105, 0],
      [775, 0],
      [775, 120],
      [880, 120],
      [880, 0],
    ]);
    const steps = stepped([[0, 0], [25, 1], [50, 1], [75, 0]]);
    expect(steps).toEqual([[0, 0], [25, 0], [25, 1], [50, 1], [75, 1], [75, 0]]); // edges are vertical
  });

  it('scope scales are fixed: the span does not follow the pulse width or the train times', () => {
    const widths = [100, 300, 1000].map((w) => pulseOutline({ ...base, pulseWidthUs: w }).spanUs);
    expect(new Set(widths).size).toBe(1);
    const trains = { ...base, durationMs: 10_000, trainOnMs: 1000, rampUpMs: 0 };
    expect(envelopeWindowMs({ ...trains, trainPeriodMs: 2000 })).toBe(envelopeWindowMs({ ...trains, trainPeriodMs: 5000 }));
  });

  it('the envelope window is the whole run, so a 50 % on time fills half of it', () => {
    const s = { ...base, amplitude: 153, durationMs: 120_000, trainOnMs: 60_000, trainPeriodMs: 120_000, rampUpMs: 0, rampDownMs: 0 };
    expect(envelopeWindowMs(s)).toBe(120_000);
    const pts = envelopeOutline(s);
    expect(pts).toContainEqual([60_000, 153]);
    expect(pts).toContainEqual([60_000, 0]);
  });

  it('recruitment trace of a long run keeps every short train (no pulse skipped), as change points only', () => {
    const s = { ...base, amplitude: 153, durationMs: 120_000, trainOnMs: 100, trainPeriodMs: 1000, rampUpMs: 0, rampDownMs: 0 };
    const trace = changePoints(pulseRecruitment(s, envelopeWindowMs(s), Infinity).map((p) => [p.tMs, p.fraction]));
    const rises = trace.filter((p, i) => i > 0 && p[1] === 1 && trace[i - 1]![1] === 0).length;
    expect(rises).toBe(119); // trains 2..120 rise from 0 (the first starts at 1; no pulse at the run’s end)
    expect(trace.length).toBeLessThan(300);
  });

  it('recruitment follows the ramp: none, then partial, then all units', () => {
    const s = { ...base, amplitude: 153, rampUpMs: 200, durationMs: 400 };
    const f = pulseRecruitment(s).map((p) => p.fraction);
    expect(f[0]).toBe(0);
    expect(f.some((x) => x > 0 && x < 1)).toBe(true);
    expect(f.at(-1)).toBe(1);
  });

  it('reports pulses longer than the period and ramps longer than the on time', () => {
    expect(stimulatorProblems(base)).toEqual([]);
    expect(stimulatorProblems({ ...base, pulseWidthUs: 13_000, waveform: 'BIPHASIC_SYMMETRIC' })).toHaveLength(1);
    expect(stimulatorProblems({ ...base, rampUpMs: 150, rampDownMs: 100 })).toHaveLength(1);
  });
});
