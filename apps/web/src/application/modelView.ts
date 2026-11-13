import type { AxonRecruitment, ConditionEffects, ConductionDelay, StageId, TypeParameterSpans } from '../domain/modelEquations';
import {
  conditionEffects,
  axonLength,
  axonRecruitment,
  conductionDelays,
  forceWeights,
  frequencyKHz,
  interPulseIntervalMs,
  junctionGain,
  pulseWidthMs,
  rateRegimeLimits,
  POOL_MT_MAX,
  POOL_MT_MIN,
  POOL_SIZES,
  stagesFor,
  temperatureFactor,
  typeParameterSpans,
  twitch,
  twitchShape,
} from '../domain/modelEquations';
import type {
  StimulationSite,
  CalibrationTarget,
  Geometry,
  InjectionSite,
  ModelVariant,
  ModulationShape,
  ModulationTarget,
  MotorUnitType,
  MuscleId,
  MusclePreset,
  SimulationRequest,
  StartedEvent,
  UnitsPerType,
  Waveform,
} from '../domain/simulation';
import type { FormValues } from './formModel';
import { driveActive, electrodeActive, electrodeInput, tremorActive } from './formModel';
import type { EffectModel, ElectrodeInput, Excitability } from '../domain/electrode';
import { CONSTANTS } from '../domain/modelEquations';
import { defaultElectrode, electrodeArea, equivalentRadius, excitability } from '../domain/electrode';

/**
 * Live view-model of the model for the "Equações" and "Diagrama" views: every number the
 * views display, derived from the form values (lenient: invalid inputs become NaN) and,
 * when relevant, from the last `started` event.
 */
export interface ModelSnapshot {
  variant: ModelVariant;
  calibrationTarget: CalibrationTarget;
  muscle: MuscleId;
  /** Condition and the effects of its adjustments on the equations. */
  condition: { id: string; effects: ConditionEffects };
  /** Central drive into Cisi & Kohn motoneurons; null without a drive. */
  drive: {
    backgroundNa: number;
    voluntaryNa: number;
    noiseCv: number;
    scale: 'PUBLISHED' | 'RHEOBASE';
    thresholdRule: 'CISI_KOHN_2008' | 'WATANABE_2013';
    tremor: { frequencyHz: number; amplitudeNa: number } | null;
    invasive: boolean;
    electrodeFraction: number;
  } | null;
  stimulationSite: StimulationSite;
  stages: readonly StageId[];
  stimulus: {
    frequencyHz: number;
    fKHz: number;
    dutyCyclePercent: number;
    pwMs: number;
    amplitude: number;
    durationMs: number;
    stepMs: number;
    waveform: Waveform;
    modulationTarget: ModulationTarget;
    modulationShape: ModulationShape;
    peakTimeMs: number;
    train: { onMs: number; periodMs: number } | null;
    /** Stimulator mode (LITERATURE): pulse width in µs (pwMs = it / 1000) and ramps; null in duty-cycle mode. */
    pulseWidthUs: number | null;
    rampUpMs: number;
    rampDownMs: number;
  };
  motoneuron: {
    injectionSite: InjectionSite;
    somaGeometry: Geometry;
    dendriteGeometry: Geometry;
    temperatureCelsius: number;
    phi: number;
  };
  recruitment: AxonRecruitment | null;
  /** The skin electrode and its factor G (skin-surface LITERATURE runs); null otherwise (G = 1, inherited rheobases). */
  electrode: {
    input: ElectrodeInput;
    effectModel: EffectModel;
    excitability: Excitability;
    areaCm2: number;
    radiusCm: number;
    depthCm: number;
    /** Reference the factor is relative to: the muscle's default electrode, or the calibration electrode. */
    refRadiusCm: number;
    refDepthCm: number;
  } | null;
  conduction: {
    axonLengthPercent: number;
    x: number;
    junctionGain: number;
    delays: ConductionDelay[];
  };
  seed: number;
  rate: { isiMs: number; kneeTkMs: number; pauseTkMs: number };
  units: {
    /** form = explicit counts sent; started = server-chosen counts of the last matching run. */
    source: 'form' | 'started' | 'auto';
    counts: UnitsPerType | null;
  };
  muscleLabel: string;
  pool: UnitsPerType | null;
  weights: Record<MotorUnitType, number | null> | null;
  /** Per-type parameter spans of the simulated units (whole pool when counts are automatic). */
  typeSpans: Record<MotorUnitType, TypeParameterSpans>;
  poolMt: { min: number; max: number };
  twitchShape: { m: number; timeScale: number };
}

const num = (raw: string) => {
  const t = raw.trim().replace(',', '.');
  return t === '' ? NaN : Number(t);
};

export interface ModelSnapshotInput {
  values: FormValues;
  muscles: readonly MusclePreset[];
  /** Request and `started` event of the last run, if any. */
  lastRequest?: SimulationRequest | null;
  lastStarted?: StartedEvent | null;
}

export function buildModelSnapshot({ values, muscles, lastRequest, lastStarted }: ModelSnapshotInput): ModelSnapshot {
  const variant = values.modelVariant as ModelVariant;
  const calibrationTarget = values.calibrationTarget as CalibrationTarget;
  const stimulationSite = values.stimulationSite as StimulationSite;
  const frequencyHz = num(values['stimulus.frequencyHz']);
  const dutyCyclePercent = num(values['stimulus.dutyCyclePercent']);
  const amplitude = num(values['stimulus.amplitude']);
  const durationMs = num(values['stimulus.durationMs']);
  const stepMs = num(values['stimulus.stepMs']);
  const axonLengthPercent = num(values.axonLengthPercent);
  const temperatureCelsius = num(values.temperatureCelsius);
  const stimulatorMode = variant === 'LITERATURE';
  const pulseWidthUs = stimulatorMode ? num(values['stimulus.pulseWidthUs']) : null;
  const pwMs = pulseWidthUs !== null ? pulseWidthUs / 1000 : pulseWidthMs(frequencyHz, dutyCyclePercent);
  const isiMs = interPulseIntervalMs(frequencyHz);
  const effects = conditionEffects(variant === 'LITERATURE' && values.condition !== 'NORMAL' ? (values.conditionAdjustments ?? []) : []);
  const preset = muscles.find((m) => m.id === values.muscle);
  // Pool sizes: from the API presets, else the table in model-equations.md.
  const pool = preset?.poolSize ?? POOL_SIZES[values.muscle as keyof typeof POOL_SIZES] ?? null;

  const electrode = electrodeSnapshot(values, effects.tauSdMs);

  const explicitUnits = variant === 'ORIGINAL' || values.manualUnits;
  let units: ModelSnapshot['units'];
  if (explicitUnits) {
    units = {
      source: 'form',
      counts: { S: num(values['unitsPerType.S']), FR: num(values['unitsPerType.FR']), FF: num(values['unitsPerType.FF']) },
    };
  } else if (
    lastStarted &&
    lastRequest &&
    lastRequest.modelVariant === variant &&
    lastRequest.unitsPerType === undefined &&
    lastStarted.muscle === values.muscle
  ) {
    units = { source: 'started', counts: lastStarted.motorUnits };
  } else {
    units = { source: 'auto', counts: null };
  }

  return {
    variant,
    calibrationTarget,
    stimulationSite,
    stages: stagesFor(variant, stimulationSite, driveActive(values)),
    stimulus: {
      frequencyHz,
      fKHz: frequencyKHz(frequencyHz),
      dutyCyclePercent,
      pwMs,
      amplitude,
      durationMs,
      stepMs,
      waveform: values['stimulus.waveform'] as Waveform,
      modulationTarget: values['stimulus.modulation.target'] as ModulationTarget,
      modulationShape: values['stimulus.modulation.shape'] as ModulationShape,
      peakTimeMs: num(values['stimulus.modulation.peakTimeMs']),
      train: values.trainsEnabled
        ? {
            onMs: num(values['stimulus.trainOnMs']),
            periodMs: num(values['stimulus.trainOnMs']) + num(values['stimulus.trainOffMs']),
          }
        : null,
      pulseWidthUs,
      rampUpMs: stimulatorMode ? num(values['stimulus.rampUpMs']) : 0,
      rampDownMs: stimulatorMode ? num(values['stimulus.rampDownMs']) : 0,
    },
    motoneuron: {
      injectionSite: values.injectionSite as InjectionSite,
      somaGeometry: values.somaGeometry as Geometry,
      dendriteGeometry: values.dendriteGeometry as Geometry,
      temperatureCelsius,
      phi: temperatureFactor(temperatureCelsius),
    },
    recruitment: axonRecruitment(amplitude, pwMs, effects.tauSdMs, electrode?.excitability),
    electrode,
    conduction: {
      axonLengthPercent,
      x: axonLength(axonLengthPercent),
      junctionGain: junctionGain(axonLengthPercent),
      delays: conductionDelays(variant, axonLengthPercent, durationMs, stepMs),
    },
    seed: num(values.seed),
    rate: { isiMs, ...rateRegimeLimits(isiMs) },
    units,
    muscle: values.muscle as MuscleId,
    condition: { id: values.condition, effects },
    drive: driveActive(values)
      ? {
          backgroundNa: num(values['centralDrive.backgroundNa']),
          voluntaryNa: num(values['centralDrive.voluntaryNa']),
          noiseCv: num(values['centralDrive.noiseCv']),
          scale: values['centralDrive.currentScale'] === 'RHEOBASE' ? 'RHEOBASE' : 'PUBLISHED',
          thresholdRule: values['centralDrive.thresholdRule'] === 'WATANABE_2013' ? 'WATANABE_2013' : 'CISI_KOHN_2008',
          tremor: tremorActive(values)
            ? { frequencyHz: num(values['centralDrive.tremor.frequencyHz']), amplitudeNa: num(values['centralDrive.tremor.amplitudeNa']) }
            : null,
          invasive: stimulationSite === 'MOTONEURON_POOL',
          electrodeFraction: num(values['centralDrive.electrodeFraction']),
        }
      : null,
    muscleLabel: preset?.label ?? values.muscle,
    pool,
    weights: pool && units.counts ? forceWeights(pool, units.counts) : null,
    typeSpans: typeParameterSpans(
      variant,
      pool ?? POOL_SIZES.SOLEUS,
      units.counts,
      axonLengthPercent,
      durationMs,
      calibrationTarget,
      values.muscle as MuscleId,
      effects,
    ),
    poolMt: { min: POOL_MT_MIN, max: POOL_MT_MAX },
    twitchShape: twitchShape(variant, calibrationTarget, values.muscle as MuscleId),
  };
}

/** Normalised twitch curve for thumbnails: x ∈ [0, xMax] in units of T (ORIGINAL), y ∈ [0, 1]. */
export function twitchCurve(
  variant: ModelVariant,
  points = 48,
  xMax = 5,
  target: CalibrationTarget = 'WHOLE_MUSCLE',
  muscle?: MuscleId,
): Array<[number, number]> {
  const { m, timeScale } = twitchShape(variant, target, muscle);
  const out: Array<[number, number]> = [];
  for (let i = 0; i <= points; i++) {
    const x = (i / points) * xMax;
    out.push([x, twitch(x, 1, timeScale, m)]);
  }
  return out;
}

function electrodeSnapshot(values: FormValues, tauSdMs: number): ModelSnapshot['electrode'] {
  if (!electrodeActive(values)) return null;
  const input = electrodeInput(values);
  if (!input) return null;
  const excit = excitability(values.muscle, input, { tauSdMs, rheobaseMin: CONSTANTS.rheobaseMin, rheobaseSpread: CONSTANTS.rheobaseSpread });
  if (!excit) return null;
  const areaCm2 = electrodeArea(input.electrode);
  const depthCm = input.electrode.fatThicknessCm + input.electrode.axonDepthCm;
  const c = input.calibration;
  const ref = defaultElectrode(values.muscle);
  const refRadiusCm = c ? equivalentRadius(c.electrodeAreaCm2 ?? areaCm2) : equivalentRadius(electrodeArea(ref));
  const refDepthCm = c ? depthCm : ref.fatThicknessCm + ref.axonDepthCm;
  return {
    input,
    effectModel: input.effectModel,
    excitability: excit,
    areaCm2,
    radiusCm: equivalentRadius(areaCm2),
    depthCm,
    refRadiusCm,
    refDepthCm,
  };
}
