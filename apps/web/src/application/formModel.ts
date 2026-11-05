import {
  CLINICAL_AMPLITUDE,
  CLINICAL_PULSE_MS,
  defaultRequest,
  MAX_OUTPUT_STEP_MS,
  MAX_POINTS_PER_SERIES,
} from '../domain/defaults';
import type {
  FieldError,
  Geometry,
  InjectionSite,
  ModelVariant,
  ModulationShape,
  ModulationTarget,
  MuscleId,
  MusclePreset,
  SimulationRequest,
  Waveform,
} from '../domain/simulation';
import { validateRequest } from '../domain/validation';

/**
 * Form state: every SimulationRequest field as a string, keyed by its contract path
 * (the same path problem+json uses in `errors[].field`), so server errors map 1:1 to inputs.
 * Two UI flags decide whether optional groups are sent at all.
 */
export const FIELD_PATHS = [
  'modelVariant',
  'stimulus.durationMs',
  'stimulus.stepMs',
  'stimulus.frequencyHz',
  'stimulus.dutyCyclePercent',
  'stimulus.amplitude',
  'stimulus.waveform',
  'stimulus.trainOnMs',
  'stimulus.trainPeriodMs',
  'stimulus.modulation.target',
  'stimulus.modulation.shape',
  'stimulus.modulation.peakTimeMs',
  'muscle',
  'unitsPerType.S',
  'unitsPerType.FR',
  'unitsPerType.FF',
  'axonLengthPercent',
  'temperatureCelsius',
  'injectionSite',
  'somaGeometry',
  'dendriteGeometry',
  'seed',
  'outputStepMs',
] as const;
export type FieldPath = (typeof FIELD_PATHS)[number];

export interface FormFlags {
  /** Send explicit `unitsPerType`. Always true for ORIGINAL; LITERATURE defaults to automatic. */
  manualUnits: boolean;
  /** Send `trainOnMs` / `trainPeriodMs`. */
  trainsEnabled: boolean;
}
export type FormValues = Record<FieldPath, string> & FormFlags;

/** Example train shown when the user enables intermittent trains. */
export const DEFAULT_TRAIN = { onMs: 330, periodMs: 1000 };

/** Fields the LITERATURE variant ignores (motoneuron compartments are not simulated). */
export const LITERATURE_INACTIVE_FIELDS: readonly FieldPath[] = [
  'injectionSite',
  'somaGeometry',
  'dendriteGeometry',
  'temperatureCelsius',
];

const str = (x: number | null | undefined) => (x === null || x === undefined ? '' : String(x));

export function toFormValues(r: SimulationRequest = defaultRequest()): FormValues {
  const s = r.stimulus;
  const units = r.unitsPerType ?? defaultRequest('ORIGINAL').unitsPerType!;
  const trainsEnabled = s.trainOnMs !== null || s.trainPeriodMs !== null;
  return {
    modelVariant: r.modelVariant,
    'stimulus.durationMs': String(s.durationMs),
    'stimulus.stepMs': String(s.stepMs),
    'stimulus.frequencyHz': String(s.frequencyHz),
    'stimulus.dutyCyclePercent': String(s.dutyCyclePercent),
    'stimulus.amplitude': String(s.amplitude),
    'stimulus.waveform': s.waveform,
    'stimulus.trainOnMs': trainsEnabled ? str(s.trainOnMs) : String(DEFAULT_TRAIN.onMs),
    'stimulus.trainPeriodMs': trainsEnabled ? str(s.trainPeriodMs) : String(DEFAULT_TRAIN.periodMs),
    'stimulus.modulation.target': s.modulation.target,
    'stimulus.modulation.shape': s.modulation.shape,
    'stimulus.modulation.peakTimeMs': str(s.modulation.peakTimeMs),
    muscle: r.muscle,
    'unitsPerType.S': String(units.S),
    'unitsPerType.FR': String(units.FR),
    'unitsPerType.FF': String(units.FF),
    axonLengthPercent: String(r.axonLengthPercent),
    temperatureCelsius: String(r.temperatureCelsius),
    injectionSite: r.injectionSite,
    somaGeometry: r.somaGeometry,
    dendriteGeometry: r.dendriteGeometry,
    seed: String(r.seed),
    outputStepMs: String(r.outputStepMs),
    manualUnits: r.unitsPerType !== undefined,
    trainsEnabled,
  };
}

/** Defaults of a variant (ORIGINAL: 5/2/2 sent explicitly; LITERATURE: automatic units). */
export function defaultFormValues(variant: ModelVariant = 'ORIGINAL'): FormValues {
  return toFormValues(defaultRequest(variant));
}

/** Switch variant keeping the user's values; resets the unit-count mode to the variant default. */
export function changeVariant(values: FormValues, variant: ModelVariant): FormValues {
  return { ...values, modelVariant: variant, manualUnits: variant === 'ORIGINAL' };
}

/** Inputs that are disabled for the current values (and why it matters to the request). */
export function inactiveFields(values: FormValues): ReadonlySet<FieldPath> {
  const out = new Set<FieldPath>();
  if (values['stimulus.modulation.shape'] !== 'TRIANGLE') out.add('stimulus.modulation.peakTimeMs');
  if (!values.trainsEnabled) {
    out.add('stimulus.trainOnMs');
    out.add('stimulus.trainPeriodMs');
  }
  if (values.modelVariant === 'LITERATURE') {
    for (const f of LITERATURE_INACTIVE_FIELDS) out.add(f);
    if (!values.manualUnits) {
      out.add('unitsPerType.S');
      out.add('unitsPerType.FR');
      out.add('unitsPerType.FF');
    }
  }
  return out;
}

const parseNumber = (raw: string): number => {
  const t = raw.trim().replace(',', '.');
  return t === '' ? NaN : Number(t);
};
const round6 = (x: number) => Math.round(x * 1e6) / 1e6;

export interface ClinicalStimulus {
  values: FormValues;
  /** Pulse width actually obtained (ms); differs from 0.3 when the duty cycle had to be clamped. */
  pulseMs: number;
  clamped: boolean;
}

/**
 * Clinical pulses for LITERATURE: duty cycle giving a 0.3 ms pulse at the chosen frequency
 * (1.2 % at 40 Hz) and amplitude 153. Returns null if the frequency is not a valid number.
 * The contract's duty-cycle minimum (1 %) means frequencies below ~33 Hz get a longer pulse.
 */
export function applyClinicalStimulus(values: FormValues): ClinicalStimulus | null {
  const f = parseNumber(values['stimulus.frequencyHz']);
  if (!Number.isFinite(f) || f <= 0) return null;
  const ideal = round6((CLINICAL_PULSE_MS * f) / 10); // % = pulse / period × 100 = 0.3·f/1000·100
  const duty = Math.min(99, Math.max(1, ideal));
  return {
    values: {
      ...values,
      'stimulus.dutyCyclePercent': String(duty),
      'stimulus.amplitude': String(CLINICAL_AMPLITUDE),
    },
    pulseMs: round6(((duty / 100) * 1000) / f),
    clamped: duty !== ideal,
  };
}

/** Smallest multiple of `stepMs` that keeps `durationMs / out` ≤ the point budget (≤ 10 ms). */
export function minOutputStep(durationMs: number, stepMs: number): number {
  const needed = durationMs / MAX_POINTS_PER_SERIES;
  const multiples = Math.max(1, Math.ceil(round6(needed / stepMs)));
  return Math.min(MAX_OUTPUT_STEP_MS, round6(multiples * stepMs));
}

export interface OutputStepAdvice {
  points: number;
  suggestedMs: number;
}

/** Non-null when the chosen output step would exceed the per-series point budget. */
export function outputStepAdvice(values: FormValues): OutputStepAdvice | null {
  const duration = parseNumber(values['stimulus.durationMs']);
  const step = parseNumber(values['stimulus.stepMs']);
  const out = parseNumber(values.outputStepMs);
  if (![duration, step, out].every((x) => Number.isFinite(x) && x > 0)) return null;
  const points = Math.floor(duration / out) + 1;
  if (points <= MAX_POINTS_PER_SERIES + 1) return null;
  const suggestedMs = minOutputStep(duration, step);
  return suggestedMs > out ? { points, suggestedMs } : null;
}

export interface FormNotice {
  field: FieldPath;
  message: string;
}

export type FormResult =
  | { ok: true; request: SimulationRequest; notices: FormNotice[] }
  | { ok: false; errors: FieldError[] };

/**
 * Parse + validate the form into a request. Accepts a decimal comma ("6,3").
 * Omits `unitsPerType` for LITERATURE in automatic mode, sends train fields only when enabled,
 * and raises `outputStepMs` (with a notice) when the run would exceed the point budget.
 */
export function parseForm(values: FormValues, muscles: readonly MusclePreset[] = []): FormResult {
  const errors: FieldError[] = [];
  const notices: FormNotice[] = [];
  const num = (path: FieldPath): number => {
    const raw = values[path].trim();
    if (raw === '') {
      errors.push({ field: path, message: 'obrigatório' });
      return NaN;
    }
    const n = parseNumber(raw);
    if (!Number.isFinite(n)) errors.push({ field: path, message: 'deve ser um número' });
    return n;
  };

  const variant = values.modelVariant as ModelVariant;
  const shape = values['stimulus.modulation.shape'] as ModulationShape;
  const peakRaw = values['stimulus.modulation.peakTimeMs'].trim();
  // peakTimeMs is only meaningful for TRIANGLE; send null otherwise (contract default).
  const peakTimeMs =
    shape === 'TRIANGLE' && peakRaw !== '' ? num('stimulus.modulation.peakTimeMs') : null;
  const sendUnits = variant === 'ORIGINAL' || values.manualUnits;

  const request: SimulationRequest = {
    stimulus: {
      durationMs: num('stimulus.durationMs'),
      stepMs: num('stimulus.stepMs'),
      frequencyHz: num('stimulus.frequencyHz'),
      dutyCyclePercent: num('stimulus.dutyCyclePercent'),
      amplitude: num('stimulus.amplitude'),
      waveform: values['stimulus.waveform'] as Waveform,
      modulation: {
        target: values['stimulus.modulation.target'] as ModulationTarget,
        shape,
        peakTimeMs,
      },
      trainOnMs: values.trainsEnabled ? num('stimulus.trainOnMs') : null,
      trainPeriodMs: values.trainsEnabled ? num('stimulus.trainPeriodMs') : null,
    },
    modelVariant: variant,
    muscle: values.muscle as MuscleId,
    ...(sendUnits
      ? {
          unitsPerType: {
            S: num('unitsPerType.S'),
            FR: num('unitsPerType.FR'),
            FF: num('unitsPerType.FF'),
          },
        }
      : {}),
    axonLengthPercent: num('axonLengthPercent'),
    temperatureCelsius: num('temperatureCelsius'),
    injectionSite: values.injectionSite as InjectionSite,
    somaGeometry: values.somaGeometry as Geometry,
    dendriteGeometry: values.dendriteGeometry as Geometry,
    seed: num('seed'),
    outputStepMs: num('outputStepMs'),
  };

  // Parse errors first; range checks would only repeat "must be a number".
  const parseFailed = new Set(errors.map((e) => e.field));
  const muscle = muscles.find((m) => m.id === request.muscle);
  for (const e of validateRequest(request, muscle)) {
    if (!parseFailed.has(e.field)) errors.push(e);
  }
  if (errors.length > 0) return { ok: false, errors };

  const advice = outputStepAdvice(values);
  if (advice) {
    notices.push({
      field: 'outputStepMs',
      message:
        `Passo de saída ajustado de ${request.outputStepMs} para ${advice.suggestedMs} ms ` +
        `(seriam ${advice.points.toLocaleString('pt-BR')} pontos por série; limite ` +
        `${MAX_POINTS_PER_SERIES.toLocaleString('pt-BR')}).`,
    });
    request.outputStepMs = advice.suggestedMs;
  }
  return { ok: true, request, notices };
}

/** Splits errors into those attached to a known input and the rest (shown as a general list). */
export function partitionFieldErrors(errors: readonly FieldError[]): {
  byField: Partial<Record<FieldPath, string[]>>;
  general: FieldError[];
} {
  const known = new Set<string>(FIELD_PATHS);
  const byField: Partial<Record<FieldPath, string[]>> = {};
  const general: FieldError[] = [];
  for (const e of errors) {
    if (known.has(e.field)) (byField[e.field as FieldPath] ??= []).push(e.message);
    else general.push(e);
  }
  return { byField, general };
}

/**
 * Stepper arithmetic for numeric inputs: adds `delta` to the (pt-BR or dot) number in `raw`,
 * clamps at `min` and rounds to the decimals of the operands (no 0.30000000000000004).
 * An empty/invalid value starts from `min`.
 */
export function stepNumber(raw: string, delta: number, min = 0): string {
  const decimals = (x: number) => {
    const s = String(x);
    const i = s.indexOf('.');
    return i === -1 ? 0 : s.length - i - 1;
  };
  const current = parseNumber(raw);
  const base = Number.isFinite(current) ? current : min;
  const digits = Math.max(decimals(base), decimals(Math.abs(delta)));
  const next = Math.max(min, base + delta);
  return String(Number(next.toFixed(digits)));
}
