import { defaultRequest } from '../domain/defaults';
import type {
  FieldError,
  Geometry,
  InjectionSite,
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
 */
export const FIELD_PATHS = [
  'stimulus.durationMs',
  'stimulus.stepMs',
  'stimulus.frequencyHz',
  'stimulus.dutyCyclePercent',
  'stimulus.amplitude',
  'stimulus.waveform',
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
export type FormValues = Record<FieldPath, string>;

export function toFormValues(r: SimulationRequest = defaultRequest()): FormValues {
  const s = r.stimulus;
  return {
    'stimulus.durationMs': String(s.durationMs),
    'stimulus.stepMs': String(s.stepMs),
    'stimulus.frequencyHz': String(s.frequencyHz),
    'stimulus.dutyCyclePercent': String(s.dutyCyclePercent),
    'stimulus.amplitude': String(s.amplitude),
    'stimulus.waveform': s.waveform,
    'stimulus.modulation.target': s.modulation.target,
    'stimulus.modulation.shape': s.modulation.shape,
    'stimulus.modulation.peakTimeMs':
      s.modulation.peakTimeMs === null ? '' : String(s.modulation.peakTimeMs),
    muscle: r.muscle,
    'unitsPerType.S': String(r.unitsPerType.S),
    'unitsPerType.FR': String(r.unitsPerType.FR),
    'unitsPerType.FF': String(r.unitsPerType.FF),
    axonLengthPercent: String(r.axonLengthPercent),
    temperatureCelsius: String(r.temperatureCelsius),
    injectionSite: r.injectionSite,
    somaGeometry: r.somaGeometry,
    dendriteGeometry: r.dendriteGeometry,
    seed: String(r.seed),
    outputStepMs: String(r.outputStepMs),
  };
}

export type FormResult =
  | { ok: true; request: SimulationRequest }
  | { ok: false; errors: FieldError[] };

/** Parse + validate the form. Accepts a decimal comma ("6,3") as well as a dot. */
export function parseForm(values: FormValues, muscles: readonly MusclePreset[] = []): FormResult {
  const errors: FieldError[] = [];
  const num = (path: FieldPath): number => {
    const raw = values[path].trim().replace(',', '.');
    if (raw === '') {
      errors.push({ field: path, message: 'obrigatório' });
      return NaN;
    }
    const n = Number(raw);
    if (!Number.isFinite(n)) errors.push({ field: path, message: 'deve ser um número' });
    return n;
  };

  const shape = values['stimulus.modulation.shape'] as ModulationShape;
  const peakRaw = values['stimulus.modulation.peakTimeMs'].trim();
  // peakTimeMs is only meaningful for TRIANGLE; send null otherwise (contract default).
  const peakTimeMs =
    shape === 'TRIANGLE' && peakRaw !== '' ? num('stimulus.modulation.peakTimeMs') : null;

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
    },
    muscle: values.muscle as MuscleId,
    unitsPerType: {
      S: num('unitsPerType.S'),
      FR: num('unitsPerType.FR'),
      FF: num('unitsPerType.FF'),
    },
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
  return errors.length === 0 ? { ok: true, request } : { ok: false, errors };
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
