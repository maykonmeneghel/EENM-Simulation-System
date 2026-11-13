import type { StimulatorSettings } from '../domain/stimulator';
import type { Excitability } from '../domain/electrode';
import { excitability } from '../domain/electrode';
import { CONSTANTS } from '../domain/modelEquations';
import type { FieldPath, FormValues } from './formModel';
import { electrodeActive, electrodeInput } from './formModel';

/**
 * The electrode's G (and the calibrated rheobases) of the form, for the recruitment shown before running: null when the
 * run has no skin electrode (G = 1), `'invalid'` while an electrode value is not a number.
 */
export function formExcitability(values: FormValues): Excitability | null | 'invalid' {
  if (!electrodeActive(values)) return null;
  const input = electrodeInput(values);
  const x = input
    ? excitability(values.muscle, input, { tauSdMs: CONSTANTS.tauSdMs, rheobaseMin: CONSTANTS.rheobaseMin, rheobaseSpread: CONSTANTS.rheobaseSpread })
    : null;
  return x ?? 'invalid';
}

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

