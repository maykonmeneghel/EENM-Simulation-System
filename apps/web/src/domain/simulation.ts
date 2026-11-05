/**
 * Types mirroring docs/contracts.md (SimulationRequest, stream events, muscle presets).
 * All times in milliseconds; JSON is camelCase.
 */

/** BIPHASIC = FES.m's raw square wave; BIPHASIC_SYMMETRIC = a stimulator's +A/−A pulse (needs pulseWidthUs). */
export const WAVEFORMS = ['MONOPHASIC', 'BIPHASIC', 'BIPHASIC_SYMMETRIC'] as const;
export type Waveform = (typeof WAVEFORMS)[number];

export const MODULATION_TARGETS = ['AMPLITUDE', 'FREQUENCY', 'PULSE_WIDTH'] as const;
export type ModulationTarget = (typeof MODULATION_TARGETS)[number];

export const MODULATION_SHAPES = ['STEP', 'RAMP', 'TRIANGLE', 'SINUSOIDAL'] as const;
export type ModulationShape = (typeof MODULATION_SHAPES)[number];

export const MODEL_VARIANTS = ['ORIGINAL', 'LITERATURE'] as const;
export type ModelVariant = (typeof MODEL_VARIANTS)[number];
/** Twitch calibration of LITERATURE (no effect on ORIGINAL): whole human muscle or mean single human unit. */
export const CALIBRATION_TARGETS = ['WHOLE_MUSCLE', 'SINGLE_UNIT'] as const;
export type CalibrationTarget = (typeof CALIBRATION_TARGETS)[number];

export const MUSCLES = [
  'SOLEUS',
  'GASTROCNEMIUS_MEDIAL',
  'GASTROCNEMIUS_LATERAL',
  'TIBIALIS_ANTERIOR',
] as const;
export type MuscleId = (typeof MUSCLES)[number];

export const INJECTION_SITES = ['SOMA', 'DENDRITE'] as const;
export type InjectionSite = (typeof INJECTION_SITES)[number];

export const GEOMETRIES = ['CYLINDRICAL', 'SPHERICAL'] as const;
export type Geometry = (typeof GEOMETRIES)[number];

export const MOTOR_UNIT_TYPES = ['S', 'FR', 'FF'] as const;
export type MotorUnitType = (typeof MOTOR_UNIT_TYPES)[number];

export type UnitsPerType = Record<MotorUnitType, number>;

export interface Modulation {
  target: ModulationTarget;
  shape: ModulationShape;
  peakTimeMs: number | null;
}

export interface Stimulus {
  durationMs: number;
  stepMs: number;
  frequencyHz: number;
  dutyCyclePercent: number;
  amplitude: number;
  waveform: Waveform;
  modulation: Modulation;
  /** Intermittent trains: both or neither; 0 < on ≤ period ≤ durationMs. */
  trainOnMs: number | null;
  trainPeriodMs: number | null;
  /** Stimulator mode: pulse width independent of the frequency (replaces dutyCyclePercent); per phase if biphasic. */
  pulseWidthUs?: number | null;
  /** Amplitude ramps at the start / end of every train (of the whole run without trains). */
  rampUpMs?: number;
  rampDownMs?: number;
}

export interface SimulationRequest {
  stimulus: Stimulus;
  modelVariant: ModelVariant;
  calibrationTarget: CalibrationTarget;
  muscle: MuscleId;
  /**
   * Omitted = variant default (ORIGINAL 5/2/2; LITERATURE 120 units in the pool's proportions,
   * computed server-side).
   */
  unitsPerType?: UnitsPerType;
  axonLengthPercent: number;
  temperatureCelsius: number;
  injectionSite: InjectionSite;
  somaGeometry: Geometry;
  dendriteGeometry: Geometry;
  seed: number;
  outputStepMs: number;
}

export interface MusclePreset {
  id: MuscleId;
  label: string;
  poolSize: UnitsPerType;
}

// ---- Stream events (section 2 of the contract) ----

export interface StartedEvent {
  type: 'started';
  simulationId: string;
  durationMs: number;
  outputStepMs: number;
  motorUnits: UnitsPerType;
  muscle: MuscleId;
}

export interface ForceSeries {
  total: number[];
  S: number[];
  FR: number[];
  FF: number[];
}

export interface ChunkEvent {
  type: 'chunk';
  progress: number;
  timeMs: number[];
  stimulus: number[];
  force: ForceSeries;
  emg: number[];
}

export interface SimulationSummary {
  peakForce: number;
  meanForce: number;
  timeToPeakMs: number;
}

export interface CompletedEvent {
  type: 'completed';
  elapsedSeconds: number;
  summary: SimulationSummary;
}

export interface ErrorEvent {
  type: 'error';
  message: string;
  code: string;
}

export type SimulationEvent = StartedEvent | ChunkEvent | CompletedEvent | ErrorEvent;

/** One `{ field, message }` entry of a problem+json `errors` array (or a client-side check). */
export interface FieldError {
  field: string;
  message: string;
}
