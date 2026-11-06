/**
 * Stimulator mode of the stimulus (engine `domain/stimulus.py`: `pulse_width_us`, ramps, BIPHASIC_SYMMETRIC),
 * computed in the browser for the Estimulador view. Kept equal to the engine by `stimulator.fixture.json`
 * (`validation/stimulator_fixture.py`).
 */
import { axonRecruitment } from './modelEquations';
import { tr } from '../i18n/locale';

export type StimulatorWaveform = 'MONOPHASIC' | 'BIPHASIC_SYMMETRIC';

export interface StimulatorSettings {
  frequencyHz: number;
  pulseWidthUs: number;
  amplitude: number;
  waveform: StimulatorWaveform;
  durationMs: number;
  /** Both null = continuous stimulation. */
  trainOnMs: number | null;
  trainPeriodMs: number | null;
  rampUpMs: number;
  rampDownMs: number;
}

const EPS_MS = 1e-9;

export const periodMs = (s: Pick<StimulatorSettings, 'frequencyHz'>) => 1000 / s.frequencyHz;
export const pulseWidthMs = (s: Pick<StimulatorSettings, 'pulseWidthUs'>) => s.pulseWidthUs / 1000;
/** Length of one train, or of the whole run without trains. */
export const onTimeMs = (s: StimulatorSettings) => s.trainOnMs ?? s.durationMs;

/** Engine `envelope`: 0 between trains, linear ramps at the start and end of each train, else 1. */
export function envelope(t: number, s: StimulatorSettings): number {
  const within = s.trainPeriodMs !== null ? t % s.trainPeriodMs : t;
  const on = onTimeMs(s);
  if (s.trainPeriodMs !== null && within >= on) return 0;
  let level = 1;
  if (s.rampUpMs > 0 && within < s.rampUpMs) level = within / s.rampUpMs;
  if (s.rampDownMs > 0 && within > on - s.rampDownMs) level = Math.min(level, Math.max(0, (on - within) / s.rampDownMs));
  return level;
}

/** +1 for the pulse width at the start of each period, -1 for the next width if biphasic, else 0. */
export function carrier(t: number, s: StimulatorSettings): number {
  const period = periodMs(s);
  const within = t - period * Math.floor(t / period + EPS_MS);
  const width = pulseWidthMs(s);
  if (within < width - EPS_MS) return 1;
  if (s.waveform === 'BIPHASIC_SYMMETRIC' && within < 2 * width - EPS_MS) return -1;
  return 0;
}

/** Engine `stimulus_current` in stimulator mode. */
export function stimulatorCurrent(t: number, s: StimulatorSettings): number {
  const level = envelope(t, s);
  return level === 0 ? 0 : level * s.amplitude * carrier(t, s);
}

/** Problems that make the settings impossible (the API reports the same ones), in the current locale. */
export function stimulatorProblems(s: StimulatorSettings): string[] {
  const out: string[] = [];
  const phases = s.waveform === 'BIPHASIC_SYMMETRIC' ? 2 : 1;
  if (phases * s.pulseWidthUs >= periodMs(s) * 1000) {
    out.push(
      phases === 2
        ? tr({ 'pt-BR': 'As duas fases do pulso não cabem no período.', en: 'The two phases of the pulse do not fit in the period.' })
        : tr({ 'pt-BR': 'O pulso não cabe no período.', en: 'The pulse does not fit in the period.' }),
    );
  }
  if (s.rampUpMs + s.rampDownMs > onTimeMs(s)) {
    out.push(tr({ 'pt-BR': 'Rampa de subida + descida maior que o tempo ligado.', en: 'Ramp up + ramp down longer than the on time.' }));
  }
  return out;
}

export type Point = [number, number];

/** Fixed time span of the pulse scope (µs): the longest biphasic pulse (2 × 1000 µs) plus margins. */
export const PULSE_SCOPE_US = { lead: 100, span: 2300 } as const;

/**
 * Exact outline of one pulse for the "pulse" scope, x in µs from the pulse onset, y normalised to ±1:
 * baseline before and after, vertical edges, both phases if biphasic. The span is fixed (not fitted to the
 * pulse), so changing the width visibly changes the trace; the next pulse is drawn if it starts in the span.
 */
export function pulseOutline(s: StimulatorSettings): { points: Point[]; spanUs: number } {
  const w = s.pulseWidthUs;
  const phases = s.waveform === 'BIPHASIC_SYMMETRIC' ? 2 : 1;
  const spanUs = PULSE_SCOPE_US.span;
  const lead = PULSE_SCOPE_US.lead;
  const pts: Point[] = [
    [-lead, 0],
    [0, 0],
    [0, 1],
    [w, 1],
  ];
  if (phases === 2) pts.push([w, -1], [2 * w, -1], [2 * w, 0]);
  else pts.push([w, 0]);
  const next = periodMs(s) * 1000;
  if (next < spanUs - lead) pts.push([next, 0], [next, 1], [Math.min(next + w, spanUs - lead), 1]);
  else pts.push([spanUs - lead, 0]);
  return { points: pts, spanUs };
}

/** Window the envelope scope shows: the whole run, at most 20 s (fixed, so on/off/ramp changes are visible). */
export function envelopeWindowMs(s: StimulatorSettings): number {
  return Math.min(s.durationMs, 20_000);
}

/** Exact corner points of the amplitude envelope (×amplitude) over [0, windowMs]. */
export function envelopeOutline(s: StimulatorSettings, windowMs = envelopeWindowMs(s)): Point[] {
  const on = onTimeMs(s);
  const cycle = s.trainPeriodMs ?? Infinity;
  /** Ramp level inside a train, taken from inside at the edges (the train's last instant is still on). */
  const ramp = (u: number) => {
    let level = 1;
    if (s.rampUpMs > 0 && u < s.rampUpMs) level = u / s.rampUpMs;
    if (s.rampDownMs > 0 && u > on - s.rampDownMs) level = Math.min(level, Math.max(0, (on - u) / s.rampDownMs));
    return level;
  };
  const pts: Point[] = [];
  for (let start = 0; start < windowMs; start += cycle) {
    const end = Math.min(start + on, windowMs);
    pts.push([start, 0]); // the train starts from zero: a vertical edge without a ramp-up (not a line from the last train)
    const corners = [start, start + s.rampUpMs, start + on - s.rampDownMs, start + on];
    for (const c of corners) if (c >= start && c <= end) pts.push([c, s.amplitude * ramp(c - start)]);
    if (end < start + on) pts.push([end, s.amplitude * ramp(end - start)]);
    if (!Number.isFinite(cycle)) break;
    pts.push([end, 0]); // vertical drop when the train switches off
  }
  // coinciding corners (a zero-length ramp) give repeated points
  return pts.filter((p, i) => i === 0 || p[0] !== pts[i - 1]![0] || p[1] !== pts[i - 1]![1]);
}

/** A step trace through the points: each value holds until the next point (recruitment changes pulse by pulse). */
export function stepped(points: readonly Point[]): Point[] {
  const out: Point[] = [];
  points.forEach((p, i) => {
    const previous = points[i - 1];
    if (previous && previous[1] !== p[1]) out.push([p[0], previous[1]]); // hold, then a vertical edge
    out.push(p);
  });
  return out;
}

export interface PulseRecruitment {
  tMs: number;
  amplitude: number;
  /** Fraction of motor axons the pulse recruits (Weiss law, linear rheobase spread). */
  fraction: number;
}

/** Amplitude and recruited fraction of every pulse in the window (for the recruitment trace). */
export function pulseRecruitment(s: StimulatorSettings, windowMs = envelopeWindowMs(s), maxPulses = 4000): PulseRecruitment[] {
  const period = periodMs(s);
  const stride = Math.max(1, Math.ceil(windowMs / period / maxPulses));
  const out: PulseRecruitment[] = [];
  for (let k = 0; k * period <= windowMs; k += stride) {
    const t = k * period;
    const amplitude = s.amplitude * envelope(t, s);
    const r = axonRecruitment(amplitude, pulseWidthMs(s));
    out.push({ tMs: t, amplitude, fraction: amplitude > 0 && r ? r.fraction * (r.status === 'none' ? 0 : 1) : 0 });
  }
  return out;
}
