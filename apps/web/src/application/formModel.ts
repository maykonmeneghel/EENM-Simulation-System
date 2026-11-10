import { defaultRequest, MAX_OUTPUT_STEP_MS, MAX_POINTS_PER_SERIES, STIMULATOR_DEFAULTS } from '../domain/defaults';
import type {
  CalibrationTarget,
  ConditionId,
  ConditionInfo,
  CurrentScale,
  FieldError,
  ThresholdRule,
  Geometry,
  InjectionSite,
  ModelVariant,
  ModulationShape,
  ModulationTarget,
  MuscleId,
  MusclePreset,
  SimulationRequest,
  StimulationSite,
  Waveform,
  WristPassiveModel,
  WristPeakForce,
} from '../domain/simulation';
import type { ServerLimits } from '../domain/limits';
import { CONTRACT_LIMITS } from '../domain/limits';
import { validateRequest } from '../domain/validation';
import { fmtNumber, tr } from '../i18n/locale';

/**
 * Form state: every SimulationRequest field as a string, keyed by its contract path
 * (the same path problem+json uses in `errors[].field`), so server errors map 1:1 to inputs.
 * Two UI flags decide whether optional groups are sent at all.
 */
export const FIELD_PATHS = [
  'modelVariant',
  'calibrationTarget',
  'stimulationSite',
  'condition',
  'stimulus.durationMs',
  'stimulus.stepMs',
  'stimulus.frequencyHz',
  'stimulus.dutyCyclePercent',
  'stimulus.amplitude',
  'stimulus.waveform',
  'stimulus.pulseWidthUs',
  'stimulus.trainOnMs',
  /** UI field: the request's trainPeriodMs = on + off (a stimulator sets on and off times). */
  'stimulus.trainOffMs',
  'stimulus.rampUpMs',
  'stimulus.rampDownMs',
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
  'centralDrive.backgroundNa',
  'centralDrive.voluntaryNa',
  'centralDrive.noiseCv',
  'centralDrive.currentScale',
  'centralDrive.thresholdRule',
  'centralDrive.tremor.frequencyHz',
  'centralDrive.tremor.amplitudeNa',
  'centralDrive.electrodeFraction',
  'joint.peakForce',
  'joint.passive',
] as const;
export type FieldPath = (typeof FIELD_PATHS)[number];

export interface FormFlags {
  /** Send explicit `unitsPerType`. Always true for ORIGINAL; LITERATURE defaults to automatic. */
  manualUnits: boolean;
  /** Send `trainOnMs` / `trainPeriodMs`. */
  trainsEnabled: boolean;
  /** Descending drive into the motoneurons (the Parkinson tremor turns it on by itself). */
  driveEnabled: boolean;
}
/** Chosen adjustments of the condition; null = leave them to the engine's defaults. */
export interface FormExtras {
  conditionAdjustments: readonly string[] | null;
}
export type FormValues = Record<FieldPath, string> & FormFlags & FormExtras;

/** Example train shown when the user enables intermittent trains (Burke's 330 ms every 1 s). */
export const DEFAULT_TRAIN = { onMs: 330, offMs: 670 };

/** Inputs of the motoneuron compartments (only with the stimulus in the motoneuron pool). */
export const MOTONEURON_FIELDS: readonly FieldPath[] = ['injectionSite', 'somaGeometry', 'dendriteGeometry', 'temperatureCelsius'];

/** Descending-drive inputs (active with the drive on or the Parkinson tremor). */
export const DRIVE_FIELDS: readonly FieldPath[] = [
  'centralDrive.backgroundNa',
  'centralDrive.voluntaryNa',
  'centralDrive.noiseCv',
  'centralDrive.currentScale',
  'centralDrive.thresholdRule',
  'centralDrive.electrodeFraction',
];
export const TREMOR_FIELDS: readonly FieldPath[] = ['centralDrive.tremor.frequencyHz', 'centralDrive.tremor.amplitudeNa'];

/** Defaults of the drive (Gallego 2015; tremor 4,4 Hz, Dideriksen 2017). */
export const DRIVE_DEFAULTS = {
  backgroundNa: 3.5,
  voluntaryNa: 0,
  noiseCv: 0.2,
  currentScale: 'PUBLISHED',
  thresholdRule: 'CISI_KOHN_2008',
  tremorFrequencyHz: 4.4,
  tremorAmplitudeNa: 3,
  electrodeFraction: 0.9,
} as const;

/** Wrist model choices (engine `domain/wrist_joint.py`): the verified full-text values. */
export const WRIST_DEFAULTS = { peakForce: 'SAUL_2015', passive: 'LINEAR' } as const;
/** Wrist inputs: they act only on forearm runs of the LITERATURE model (the ones with a joint). */
export const WRIST_FIELDS: readonly FieldPath[] = ['joint.peakForce', 'joint.passive'];

/** The Parkinson resting tremor is chosen (condition PARKINSON with PD_TREMOR on; it is off by default). */
export function tremorActive(values: FormValues): boolean {
  return values.condition === 'PARKINSON' && (values.conditionAdjustments ?? []).includes('PD_TREMOR');
}

/** The motoneurons are simulated: stimulus in the pool (invasive) or a central drive (either mode). */
export function driveActive(values: FormValues): boolean {
  return values.modelVariant === 'LITERATURE' && (values.driveEnabled || tremorActive(values));
}

/** Server error paths shown on another input. */
const FIELD_ALIASES: Readonly<Record<string, FieldPath>> = { 'stimulus.trainPeriodMs': 'stimulus.trainOffMs' };

const str = (x: number | null | undefined) => (x === null || x === undefined ? '' : String(x));

export function toFormValues(r: SimulationRequest = defaultRequest()): FormValues {
  const s = r.stimulus;
  const units = r.unitsPerType ?? defaultRequest('ORIGINAL').unitsPerType!;
  const trainsEnabled = s.trainOnMs !== null || s.trainPeriodMs !== null;
  return {
    modelVariant: r.modelVariant,
    calibrationTarget: r.calibrationTarget,
    stimulationSite: r.stimulationSite,
    condition: r.condition,
    conditionAdjustments: r.conditionAdjustments ?? null,
    'stimulus.durationMs': String(s.durationMs),
    'stimulus.stepMs': String(s.stepMs),
    'stimulus.frequencyHz': String(s.frequencyHz),
    'stimulus.dutyCyclePercent': String(s.dutyCyclePercent),
    'stimulus.amplitude': String(s.amplitude),
    'stimulus.waveform': s.waveform,
    'stimulus.pulseWidthUs': str(s.pulseWidthUs ?? STIMULATOR_DEFAULTS.pulseWidthUs),
    'stimulus.trainOnMs': trainsEnabled ? str(s.trainOnMs) : String(DEFAULT_TRAIN.onMs),
    'stimulus.trainOffMs':
      trainsEnabled && s.trainOnMs !== null && s.trainPeriodMs !== null
        ? String(s.trainPeriodMs - s.trainOnMs)
        : String(DEFAULT_TRAIN.offMs),
    'stimulus.rampUpMs': str(s.rampUpMs ?? 0),
    'stimulus.rampDownMs': str(s.rampDownMs ?? 0),
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
    driveEnabled: r.centralDrive?.enabled ?? false,
    'centralDrive.backgroundNa': String(r.centralDrive?.backgroundNa ?? DRIVE_DEFAULTS.backgroundNa),
    'centralDrive.voluntaryNa': String(r.centralDrive?.voluntaryNa ?? DRIVE_DEFAULTS.voluntaryNa),
    'centralDrive.noiseCv': String(r.centralDrive?.noiseCv ?? DRIVE_DEFAULTS.noiseCv),
    'centralDrive.currentScale': r.centralDrive?.currentScale ?? DRIVE_DEFAULTS.currentScale,
    'centralDrive.thresholdRule': r.centralDrive?.thresholdRule ?? DRIVE_DEFAULTS.thresholdRule,
    'centralDrive.tremor.frequencyHz': String(r.centralDrive?.tremor.frequencyHz ?? DRIVE_DEFAULTS.tremorFrequencyHz),
    'centralDrive.tremor.amplitudeNa': String(r.centralDrive?.tremor.amplitudeNa ?? DRIVE_DEFAULTS.tremorAmplitudeNa),
    'centralDrive.electrodeFraction': String(r.centralDrive?.electrodeFraction ?? DRIVE_DEFAULTS.electrodeFraction),
    'joint.peakForce': r.joint?.peakForce ?? WRIST_DEFAULTS.peakForce,
    'joint.passive': r.joint?.passive ?? WRIST_DEFAULTS.passive,
  };
}

/** Defaults of the app (the corrected model, automatic units, stimulator pulses). */
/** A new seed for the "sortear" button: a whole number from 0 to 999 999 (short enough to note and type back). */
export function randomSeed(random: () => number = Math.random): string {
  return String(Math.floor(random() * 1_000_000));
}

export function defaultFormValues(variant: ModelVariant = 'LITERATURE'): FormValues {
  return toFormValues(defaultRequest(variant));
}

/** Inputs that are disabled for the current values (and why it matters to the request). */
export function inactiveFields(values: FormValues): ReadonlySet<FieldPath> {
  const out = new Set<FieldPath>();
  if (values['stimulus.modulation.shape'] !== 'TRIANGLE') out.add('stimulus.modulation.peakTimeMs');
  if (!values.trainsEnabled) {
    out.add('stimulus.trainOnMs');
    out.add('stimulus.trainOffMs');
  }
  if (values.modelVariant === 'LITERATURE') {
    // the Booth motoneuron's settings apply only with the stimulus in the pool and no drive (the drive goes into Cisi &
    // Kohn motoneurons, whose geometry is that of their paper)
    if (values.stimulationSite !== 'MOTONEURON_POOL' || driveActive(values)) for (const f of MOTONEURON_FIELDS) out.add(f);
    if (!driveActive(values)) for (const f of DRIVE_FIELDS) out.add(f);
    if (values.stimulationSite === 'MOTONEURON_POOL') out.add('centralDrive.electrodeFraction');
    if (!FOREARM_MUSCLES.has(values.muscle)) for (const f of WRIST_FIELDS) out.add(f);
    if (!tremorActive(values)) for (const f of TREMOR_FIELDS) out.add(f);
    if (!values.manualUnits) {
      out.add('unitsPerType.S');
      out.add('unitsPerType.FR');
      out.add('unitsPerType.FF');
    }
  } else {
    for (const f of [...DRIVE_FIELDS, ...TREMOR_FIELDS, ...WRIST_FIELDS]) out.add(f);
  }
  return out;
}

const parseNumber = (raw: string): number => {
  const t = raw.trim().replace(',', '.');
  return t === '' ? NaN : Number(t);
};
const round6 = (x: number) => Math.round(x * 1e6) / 1e6;

/** Samples per series the app aims to stay under: the chart budget, or the server's cap when lower. */
export function pointBudget(limits: ServerLimits = CONTRACT_LIMITS): number {
  return Math.min(MAX_POINTS_PER_SERIES, limits.maxOutputPoints ?? Infinity);
}

/** Smallest multiple of `stepMs` that keeps `durationMs / out` ≤ the point budget (≤ 10 ms). */
export function minOutputStep(durationMs: number, stepMs: number, budget: number = MAX_POINTS_PER_SERIES): number {
  const needed = durationMs / budget;
  const multiples = Math.max(1, Math.ceil(round6(needed / stepMs)));
  return Math.min(MAX_OUTPUT_STEP_MS, round6(multiples * stepMs));
}

export interface OutputStepAdvice {
  points: number;
  suggestedMs: number;
}

/** Non-null when the chosen output step would exceed the per-series point budget. */
export function outputStepAdvice(values: FormValues, limits: ServerLimits = CONTRACT_LIMITS): OutputStepAdvice | null {
  const budget = pointBudget(limits);
  const duration = parseNumber(values['stimulus.durationMs']);
  const step = parseNumber(values['stimulus.stepMs']);
  const out = parseNumber(values.outputStepMs);
  if (![duration, step, out].every((x) => Number.isFinite(x) && x > 0)) return null;
  const points = Math.floor(duration / out) + 1;
  if (points <= budget + 1) return null;
  const suggestedMs = minOutputStep(duration, step, budget);
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
/** Muscles the 3D step draws (it replays their runs). */
const FOREARM_MUSCLES: ReadonlySet<string> = new Set(['FLEXOR_CARPI_RADIALIS', 'EXTENSOR_CARPI_RADIALIS']);

export function parseForm(
  values: FormValues,
  muscles: readonly MusclePreset[] = [],
  limits: ServerLimits = CONTRACT_LIMITS,
): FormResult {
  const errors: FieldError[] = [];
  const notices: FormNotice[] = [];
  const num = (path: FieldPath): number => {
    const raw = values[path].trim();
    if (raw === '') {
      errors.push({ field: path, message: tr({ 'pt-BR': 'obrigatório', en: 'required' }) });
      return NaN;
    }
    const n = parseNumber(raw);
    if (!Number.isFinite(n)) errors.push({ field: path, message: tr({ 'pt-BR': 'deve ser um número', en: 'must be a number' }) });
    return n;
  };

  const variant = values.modelVariant as ModelVariant;
  const shape = values['stimulus.modulation.shape'] as ModulationShape;
  const peakRaw = values['stimulus.modulation.peakTimeMs'].trim();
  // peakTimeMs is only meaningful for TRIANGLE; send null otherwise (contract default).
  const peakTimeMs =
    shape === 'TRIANGLE' && peakRaw !== '' ? num('stimulus.modulation.peakTimeMs') : null;
  const sendUnits = variant === 'ORIGINAL' || values.manualUnits;
  const trainOn = values.trainsEnabled ? num('stimulus.trainOnMs') : null;
  const trainOff = values.trainsEnabled ? num('stimulus.trainOffMs') : null;

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
      trainOnMs: trainOn,
      trainPeriodMs: trainOn !== null && trainOff !== null ? trainOn + trainOff : null,
      ...(variant === 'LITERATURE'
        ? {
            pulseWidthUs: num('stimulus.pulseWidthUs'),
            rampUpMs: num('stimulus.rampUpMs'),
            rampDownMs: num('stimulus.rampDownMs'),
          }
        : {}),
    },
    modelVariant: variant,
    calibrationTarget: values.calibrationTarget as CalibrationTarget,
    stimulationSite: values.stimulationSite as StimulationSite,
    condition: values.condition as ConditionId,
    ...(values.conditionAdjustments !== null ? { conditionAdjustments: [...values.conditionAdjustments] } : {}),
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
    // the 3D step replays forearm runs; the engine streams per-unit events up to 30 s (or the server's limit)
    ...(FOREARM_MUSCLES.has(values.muscle) && num('stimulus.durationMs') <= limits.maxUnitEventsDurationMs
      ? { output: { unitEvents: true } }
      : {}),
    // the wrist turns only on forearm runs of the corrected model
    ...(variant === 'LITERATURE' && FOREARM_MUSCLES.has(values.muscle)
      ? {
          joint: {
            peakForce: values['joint.peakForce'] as WristPeakForce,
            passive: values['joint.passive'] as WristPassiveModel,
          },
        }
      : {}),
    ...(driveActive(values)
      ? {
          centralDrive: {
            enabled: values.driveEnabled,
            backgroundNa: num('centralDrive.backgroundNa'),
            voluntaryNa: num('centralDrive.voluntaryNa'),
            noiseCv: num('centralDrive.noiseCv'),
            currentScale: values['centralDrive.currentScale'] as CurrentScale,
            thresholdRule: values['centralDrive.thresholdRule'] as ThresholdRule,
            tremor: {
              frequencyHz: num('centralDrive.tremor.frequencyHz'),
              amplitudeNa: num('centralDrive.tremor.amplitudeNa'),
            },
            electrodeFraction: num('centralDrive.electrodeFraction'),
          },
        }
      : {}),
  };

  // Parse errors first; range checks would only repeat "must be a number".
  const parseFailed = new Set(errors.map((e) => e.field));
  const muscle = muscles.find((m) => m.id === request.muscle);
  for (const e of validateRequest(request, muscle, limits)) {
    if (!parseFailed.has(e.field)) errors.push(e);
  }
  if (errors.length > 0) return { ok: false, errors };

  const advice = outputStepAdvice(values, limits);
  if (advice) {
    notices.push({
      field: 'outputStepMs',
      message: tr({
        'pt-BR':
          `Passo de saída ajustado de ${request.outputStepMs} para ${advice.suggestedMs} ms ` +
          `(seriam ${fmtNumber(advice.points)} pontos por série; limite ${fmtNumber(pointBudget(limits))}).`,
        en:
          `Output step raised from ${request.outputStepMs} to ${advice.suggestedMs} ms ` +
          `(it would be ${fmtNumber(advice.points)} points per series; limit ${fmtNumber(pointBudget(limits))}).`,
      }),
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
    const field = FIELD_ALIASES[e.field] ?? e.field;
    if (known.has(field)) (byField[field as FieldPath] ??= []).push(e.message);
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

/** Switch condition: its default adjustments (from the engine catalog) become the explicit choice. */
export function changeCondition(values: FormValues, condition: ConditionId, catalog: readonly ConditionInfo[]): FormValues {
  const info = catalog.find((c) => c.id === condition);
  const chosen = info ? info.adjustments.filter((a) => a.default && a.available).map((a) => a.id) : null;
  return { ...values, condition, conditionAdjustments: chosen };
}

/** Turn one adjustment on or off (starting from the condition's defaults when nothing was chosen yet). */
export function toggleAdjustment(
  values: FormValues,
  id: string,
  on: boolean,
  catalog: readonly ConditionInfo[],
): FormValues {
  const info = catalog.find((c) => c.id === values.condition);
  const current =
    values.conditionAdjustments ?? (info?.adjustments.filter((a) => a.default && a.available).map((a) => a.id) ?? []);
  const next = on ? [...new Set([...current, id])] : current.filter((x) => x !== id);
  // keep the catalog order
  const order = info?.adjustments.map((a) => a.id) ?? next;
  return { ...values, conditionAdjustments: order.filter((x) => next.includes(x)) };
}
