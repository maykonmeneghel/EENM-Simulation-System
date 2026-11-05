/**
 * Constants and derived values of the neuromusculoskeletal model, transcribed from
 * docs/model-equations.md (the single source). Nothing here is fitted or invented: each
 * function is the closed form written in that document, evaluated with request fields.
 */
import type {
  CalibrationTarget,
  ModelVariant,
  MotorUnitType,
  MuscleId,
  StimulationSite,
  UnitsPerType,
} from './simulation';
import { MOTOR_UNIT_TYPES } from './simulation';

export type StageId = '1' | '2a' | '2b' | '3' | '4' | '5a' | '5b' | '6' | '7' | '8a' | '8b';

/** Stages used by each variant (model-equations.md, header). */
export const STAGES_BY_VARIANT: Record<ModelVariant, readonly StageId[]> = {
  ORIGINAL: ['1', '2a', '3', '4', '5a', '8a'],
  LITERATURE: ['1', '2b', '3', '4', '5b', '6', '7', '8b'],
};

/** LITERATURE with the stimulus in the motoneuron pool uses the motoneuron compartments (2a), not the axon layer. */
export function stagesFor(variant: ModelVariant, site: StimulationSite = 'SKIN_SURFACE'): readonly StageId[] {
  const stages = STAGES_BY_VARIANT[variant];
  return variant === 'LITERATURE' && site === 'MOTONEURON_POOL' ? stages.map((s) => (s === '2b' ? '2a' : s)) : stages;
}

// ---- constants (model-equations.md) ----
export const CONSTANTS = {
  /** §2a Conductances (mS/cm²) and reversal potentials (mV). */
  conductances: { gNa: 80, gK: 100, gCa: 14, gKCa: 6, gL: 0.51, gc: 0.1, gNaP: 0.1, gCaD: 0.25, C: 1 },
  reversal: { ENa: 55, EK: -80, EL: -60, ECa: 80 },
  /** §2a temperature factor reference (°C). */
  phiReferenceC: 6.3,
  /** §2b Weiss strength–duration (exact definitions, not rounded). */
  tauSdMs: 0.459,
  rheobaseMin: 56.9 / (1 + 0.459 / 0.3),
  rheobaseSpread: 102.1 / 56.9,
  /** §3 conduction. */
  junctionG: 0.07,
  conductionVelocitiesMs: [44, 53] as const,
  /** §4 MUAP window (ms). */
  muapWindowMs: 1.25,
  /** §6 rate saturation. */
  nfLinearSlope: 0.3,
  nfKnee: 0.4,
  /** §7 fatigue. */
  fatigueBase: 0.0125,
  fatigueRange: 180,
  fatigueContractionGain: 0.379,
  fatiguePauseNr: 0.25,
} as const;

const finite = (x: number) => Number.isFinite(x);

// ---- §1 stimulus ----
/** f in kHz (t in ms). */
export const frequencyKHz = (frequencyHz: number) => frequencyHz / 1000;

/** PW = D / (100·f) ms, f in kHz. */
export function pulseWidthMs(frequencyHz: number, dutyCyclePercent: number): number {
  const f = frequencyKHz(frequencyHz);
  return f > 0 ? dutyCyclePercent / (100 * f) : NaN;
}

// ---- §2a motoneuron ----
/** φ = 3^((T − 6.3)/10). */
export const temperatureFactor = (temperatureCelsius: number) =>
  Math.pow(3, (temperatureCelsius - CONSTANTS.phiReferenceC) / 10);

// ---- §2b motor axon ----
export type RecruitmentStatus = 'all' | 'partial' | 'none';

export interface AxonRecruitment {
  /** Amplitude needed by the lowest-rheobase axon: I_rh,min·(1 + τ/PW). */
  thresholdMin: number;
  /** Amplitude needed by the highest-rheobase axon: R·I_rh,min·(1 + τ/PW). */
  thresholdMax: number;
  status: RecruitmentStatus;
  /**
   * Fraction of axons whose threshold is ≤ A, treating the linear rheobase spread as continuous
   * (with N axons the real count is the nearest of k/(N−1) steps).
   */
  fraction: number;
}

export function axonRecruitment(amplitude: number, pwMs: number): AxonRecruitment | null {
  if (!finite(amplitude) || !finite(pwMs) || pwMs <= 0) return null;
  const sd = 1 + CONSTANTS.tauSdMs / pwMs;
  const thresholdMin = CONSTANTS.rheobaseMin * sd;
  const thresholdMax = CONSTANTS.rheobaseSpread * CONSTANTS.rheobaseMin * sd;

  // Relative tolerance so 102.1 counts as ≥ 56.9/(1+τ/0.3)·(102.1/56.9)·(1+τ/0.3) despite float rounding.
  const eps = 1e-9 * thresholdMax;
  const status: RecruitmentStatus =
    amplitude >= thresholdMax - eps ? 'all' : amplitude >= thresholdMin - eps ? 'partial' : 'none';
  const fraction = status === 'all' ? 1 : Math.min(1, Math.max(0, (amplitude - thresholdMin) / (thresholdMax - thresholdMin)));
  return { thresholdMin, thresholdMax, status, fraction };
}

// ---- §3 conduction ----
/** λ = √(1/0.070). */
export const junctionLambda = () => Math.sqrt(1 / CONSTANTS.junctionG);

/** x = axonLengthPercent / 100. */
export const axonLength = (axonLengthPercent: number) => axonLengthPercent / 100;

/** Junction gain 0.070·λ/2·e^(−x/λ) applied to V_s (ORIGINAL). */
export function junctionGain(axonLengthPercent: number): number {
  const lambda = junctionLambda();
  return ((CONSTANTS.junctionG * lambda) / 2) * Math.exp(-axonLength(axonLengthPercent) / lambda);
}

export interface ConductionDelay {
  velocity: number;
  samples: number;
  ms: number;
}

/**
 * Δ_k = x/v·T/δt samples (ORIGINAL, Q4) or x/v·1000/δt samples (LITERATURE); ms = samples·δt.
 */
export function conductionDelay(
  variant: ModelVariant,
  axonLengthPercent: number,
  durationMs: number,
  stepMs: number,
  velocity: number,
): ConductionDelay {
  const x = axonLength(axonLengthPercent);
  const scale = variant === 'ORIGINAL' ? durationMs : 1000;
  const samples = (x / velocity) * (scale / stepMs);
  return { velocity, samples, ms: samples * stepMs };
}

export function conductionDelays(
  variant: ModelVariant,
  axonLengthPercent: number,
  durationMs: number,
  stepMs: number,
): ConductionDelay[] {
  return CONSTANTS.conductionVelocitiesMs.map((v) =>
    conductionDelay(variant, axonLengthPercent, durationMs, stepMs, v),
  );
}

// ---- §5 twitch ----
/** h(t) = P·(t/T)^m·e^(m(1 − t/T)); m = 1 is the ORIGINAL (Fuglevand) form. */
export function twitch(t: number, P: number, T: number, m: number): number {
  if (t <= 0) return 0;
  const r = t / T;
  return P * Math.pow(r, m) * Math.exp(m * (1 - r));
}

/** §5b fitted twitch per calibration target (model_options.TWITCH_CALIBRATION; model-equations.md §5b). */
export const TWITCH_CALIBRATION: Record<
  CalibrationTarget,
  { timeScale: number; m: number; ctMs: number; hrtMs: number; fittedTo: string }
> = {
  WHOLE_MUSCLE: { timeScale: 1.2772, m: 3.9461, ctMs: 120.7, hrtMs: 97.3, fittedTo: 'twitch do tríceps sural humano' },
  SINGLE_UNIT: {
    timeScale: 0.7426,
    m: 2.0862,
    ctMs: 74.8,
    hrtMs: 78.6,
    fittedTo: 'twitch médio de unidades motoras humanas (Macefield 1996)',
  },
};

/** Twitch exponent and time scale per variant and calibration target (§5a / §5b). */
export function twitchShape(
  variant: ModelVariant,
  target: CalibrationTarget = 'WHOLE_MUSCLE',
): { m: number; timeScale: number } {
  if (variant === 'ORIGINAL') return { m: 1, timeScale: 1 };
  const { m, timeScale } = TWITCH_CALIBRATION[target];
  return { m, timeScale };
}

// ---- §6 rate saturation ----
/** Inter-stimulus interval (ms) of the pulse train: each pulse fires the recruited axons. */
export const interPulseIntervalMs = (frequencyHz: number) => 1000 / frequencyHz;

export function normalisedForce(nr: number): number {
  return nr <= CONSTANTS.nfKnee ? CONSTANTS.nfLinearSlope * nr : 1 - Math.exp(-2 * Math.pow(nr, 3));
}

/** g = NF(NR) / (0.3·NR). */
export function rateGain(nr: number): number {
  return nr > 0 ? normalisedForce(nr) / (CONSTANTS.nfLinearSlope * nr) : 1;
}

/** T_k at which NR = T_k/ISI reaches the knee (0.4) and the pause limit (0.25). */
export function rateRegimeLimits(isiMs: number): { kneeTkMs: number; pauseTkMs: number } {
  return { kneeTkMs: CONSTANTS.nfKnee * isiMs, pauseTkMs: CONSTANTS.fatiguePauseNr * isiMs };
}

// ---- §8 force ----
/** 8b: weight per type = N_pool / N_sim (null when that type is not simulated). */
export function forceWeights(
  pool: UnitsPerType,
  simulated: UnitsPerType,
): Record<MotorUnitType, number | null> {
  const out = {} as Record<MotorUnitType, number | null>;
  for (const t of MOTOR_UNIT_TYPES) out[t] = simulated[t] > 0 ? pool[t] / simulated[t] : null;
  return out;
}

// ---- §3 per-type unit parameters (TYPE_RANGES, from createUMs.m) ----
export interface ValueRange {
  first: number;
  last: number;
}
export interface TypeRanges {
  /** MT — twitch peak P_k. */
  mt: ValueRange;
  /** MTTP — twitch time to peak T_k (ms, before the LITERATURE time scale). */
  mttpMs: ValueRange;
  /** APAT — conduction velocity v_k (m/s). */
  apat: ValueRange;
  /** APSF — MUAP scale S_k. */
  apsf: ValueRange;
  /** APTF — MUAP time factor λ_m. */
  aptf: ValueRange;
}

export const TYPE_RANGES: Record<MotorUnitType, TypeRanges> = {
  S: {
    mt: { first: 0.103, last: 0.123 },
    mttpMs: { first: 110, last: 100 },
    apat: { first: 44, last: 47 },
    apsf: { first: 0.105, last: 0.125 },
    aptf: { first: 0.8, last: 0.7 },
  },
  FR: {
    mt: { first: 0.123, last: 0.294 },
    mttpMs: { first: 73.5, last: 55.5 },
    apat: { first: 47, last: 50 },
    apsf: { first: 0.125, last: 0.3 },
    aptf: { first: 0.7, last: 0.6 },
  },
  FF: {
    mt: { first: 0.294, last: 0.491 },
    mttpMs: { first: 82.3, last: 56.9 },
    apat: { first: 50, last: 53 },
    apsf: { first: 0.3, last: 0.5 },
    aptf: { first: 0.6, last: 0.5 },
  },
};

/** Pool sizes S / FR / FF per muscle (model-equations.md). */
export const POOL_SIZES: Record<MuscleId, UnitsPerType> = {
  SOLEUS: { S: 800, FR: 50, FF: 50 },
  GASTROCNEMIUS_MEDIAL: { S: 250, FR: 125, FF: 125 },
  GASTROCNEMIUS_LATERAL: { S: 200, FR: 100, FF: 100 },
  TIBIALIS_ANTERIOR: { S: 250, FR: 50, FF: 50 },
};

/** Fatigue's weakest / strongest MT of the whole pool (same for every muscle in the table). */
export const POOL_MT_MIN = 0.103;
export const POOL_MT_MAX = 0.491;

/**
 * Value of pool unit `index` (0-based) when a property goes linearly from `first` to `last`
 * across a pool of `poolSize` units.
 */
export function poolValue(range: ValueRange, poolSize: number, index: number): number {
  if (poolSize <= 1) return range.last;
  return range.first + ((range.last - range.first) * index) / (poolSize - 1);
}

/**
 * Pool indices of the simulated units: the first ones (ORIGINAL) or the centres of equal slices
 * (LITERATURE: ⌊(j + ½)·N/n⌋).
 */
export function selectedUnitIndices(variant: ModelVariant, poolSize: number, count: number): number[] {
  const n = Math.max(0, Math.floor(count));
  if (variant === 'ORIGINAL') return Array.from({ length: n }, (_, i) => i);
  return Array.from({ length: n }, (_, j) => Math.floor(((j + 0.5) * poolSize) / n));
}

/** First → last value of a property over the simulated units (null when no unit is simulated). */
export interface SpanValue {
  from: number;
  to: number;
}

export function simulatedSpan(
  range: ValueRange,
  variant: ModelVariant,
  poolSize: number,
  count: number | null,
): SpanValue | null {
  if (count === null) return { from: range.first, to: range.last }; // unknown count → whole pool
  const idx = selectedUnitIndices(variant, poolSize, count);
  if (idx.length === 0) return null;
  return { from: poolValue(range, poolSize, idx[0]!), to: poolValue(range, poolSize, idx[idx.length - 1]!) };
}

/** FAT_k = 0.0125·180^(ln(P_k/P_min)/ln(P_max/P_min)) in %/s. */
export function fatigueRate(pk: number, pMin = POOL_MT_MIN, pMax = POOL_MT_MAX): number {
  return CONSTANTS.fatigueBase * Math.pow(CONSTANTS.fatigueRange, Math.log(pk / pMin) / Math.log(pMax / pMin));
}

export interface TypeParameterSpans {
  /** Simulated units of this type, or null when "automático" (spans then cover the whole pool). */
  count: number | null;
  mt: SpanValue | null;
  /** T_k (ms) as used by the variant: MTTP, × the calibration's time scale for LITERATURE. */
  tkMs: SpanValue | null;
  velocity: SpanValue | null;
  delayMs: SpanValue | null;
  apsf: SpanValue | null;
  aptf: SpanValue | null;
  /** FAT_k (%/s) from MT (LITERATURE stage 7). */
  fatigue: SpanValue | null;
}

const mapSpan = (sp: SpanValue | null, f: (x: number) => number): SpanValue | null =>
  sp ? { from: f(sp.from), to: f(sp.to) } : null;

/**
 * Per-type numeric spans for the current muscle, variant and unit counts (stages 3, 4, 5, 7).
 * Delay uses §3: x/v·T (ORIGINAL) or x/v·1000 (LITERATURE), x in m.
 */
export function typeParameterSpans(
  variant: ModelVariant,
  pool: UnitsPerType,
  counts: UnitsPerType | null,
  axonLengthPercent: number,
  durationMs: number,
  target: CalibrationTarget = 'WHOLE_MUSCLE',
): Record<MotorUnitType, TypeParameterSpans> {
  const tScale = twitchShape(variant, target).timeScale;
  const x = axonLength(axonLengthPercent);
  const scale = variant === 'ORIGINAL' ? durationMs : 1000;
  const out = {} as Record<MotorUnitType, TypeParameterSpans>;
  for (const t of MOTOR_UNIT_TYPES) {
    const r = TYPE_RANGES[t];
    const n = counts ? counts[t] : null;
    const span = (range: ValueRange) => simulatedSpan(range, variant, pool[t], n);
    const mt = span(r.mt);
    const velocity = span(r.apat);
    out[t] = {
      count: n,
      mt,
      tkMs: mapSpan(span(r.mttpMs), (v) => v * tScale),
      velocity,
      delayMs: mapSpan(velocity, (v) => (x / v) * scale),
      apsf: span(r.apsf),
      aptf: span(r.aptf),
      fatigue: mapSpan(mt, (p) => fatigueRate(p)),
    };
  }
  return out;
}
