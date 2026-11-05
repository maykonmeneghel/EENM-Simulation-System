import type { StimulatorSettings } from '../domain/stimulator';
import type { FieldPath, FormValues } from './formModel';

/** Stimulus fields edited in the Estimulador view (errors on them are listed under "Estímulo" in the sidebar). */
export const STIMULATOR_PATHS: readonly FieldPath[] = [
  'stimulus.frequencyHz',
  'stimulus.pulseWidthUs',
  'stimulus.amplitude',
  'stimulus.waveform',
  'stimulus.trainOnMs',
  'stimulus.trainOffMs',
  'stimulus.rampUpMs',
  'stimulus.rampDownMs',
];

const parse = (raw: string) => {
  const t = raw.trim().replace(',', '.');
  return t === '' ? NaN : Number(t);
};

/** Stimulator settings from the form, or null while a value is not a valid number. */
export function settingsFromForm(v: FormValues): StimulatorSettings | null {
  const s: StimulatorSettings = {
    frequencyHz: parse(v['stimulus.frequencyHz']),
    pulseWidthUs: parse(v['stimulus.pulseWidthUs']),
    amplitude: parse(v['stimulus.amplitude']),
    waveform: v['stimulus.waveform'] === 'MONOPHASIC' ? 'MONOPHASIC' : 'BIPHASIC_SYMMETRIC',
    durationMs: parse(v['stimulus.durationMs']),
    trainOnMs: v.trainsEnabled ? parse(v['stimulus.trainOnMs']) : null,
    trainPeriodMs: v.trainsEnabled ? parse(v['stimulus.trainOnMs']) + parse(v['stimulus.trainOffMs']) : null,
    rampUpMs: parse(v['stimulus.rampUpMs']),
    rampDownMs: parse(v['stimulus.rampDownMs']),
  };
  const numbers = [s.frequencyHz, s.pulseWidthUs, s.amplitude, s.durationMs, s.rampUpMs, s.rampDownMs];
  if (s.trainOnMs !== null) numbers.push(s.trainOnMs, s.trainPeriodMs!);
  const positive = s.frequencyHz > 0 && s.pulseWidthUs > 0 && s.durationMs > 0 && s.amplitude >= 0;
  return numbers.every(Number.isFinite) && positive && (s.trainOnMs === null || s.trainOnMs > 0) ? s : null;
}

