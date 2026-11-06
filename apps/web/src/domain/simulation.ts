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
/** Where the LITERATURE stimulus acts: motor axons through the skin, or injected into the motoneurons. */
export const STIMULATION_SITES = ['SKIN_SURFACE', 'MOTONEURON_POOL'] as const;
export type StimulationSite = (typeof STIMULATION_SITES)[number];
/** Clinical condition of the LITERATURE model; adjustments come from GET /api/v1/conditions. */
export const CONDITIONS = ['NORMAL', 'PARKINSON', 'SCI_CHRONIC'] as const;
export type ConditionId = (typeof CONDITIONS)[number];

/** One per-article adjustment of a condition, as defined by the engine. */
export interface ConditionAdjustment {
  id: string;
  label: string;
  effect: string;
  finding: string;
  source: { citation: string; title: string; doi: string | null; pmid: string | null };
  evidence: 'FULL_TEXT' | 'ABSTRACT';
  measuredIn: string;
  default: boolean;
  available: boolean;
}

export interface ConditionInfo {
  id: ConditionId;
  label: string;
  adjustments: ConditionAdjustment[];
}

export const MUSCLES = [
  'SOLEUS',
  'GASTROCNEMIUS_MEDIAL',
  'GASTROCNEMIUS_LATERAL',
  'TIBIALIS_ANTERIOR',
  'FLEXOR_CARPI_RADIALIS',
  'EXTENSOR_CARPI_RADIALIS',
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

export const CURRENT_SCALES = ['PUBLISHED', 'RHEOBASE'] as const;
export type CurrentScale = (typeof CURRENT_SCALES)[number];
export const THRESHOLD_RULES = ['CISI_KOHN_2008', 'WATANABE_2013'] as const;
export type ThresholdRule = (typeof THRESHOLD_RULES)[number];

/** Descending drive into the motoneurons (central_drive.py); the tremor applies only with PD_TREMOR. */
export interface CentralDrive {
  enabled: boolean;
  backgroundNa: number;
  voluntaryNa: number;
  noiseCv: number;
  currentScale: CurrentScale;
  /** Thresholds of the Cisi & Kohn motoneurons that receive the drive. */
  thresholdRule: ThresholdRule;
  tremor: { frequencyHz: number; amplitudeNa: number };
  /** Electrode position along the axon from the soma (non-invasive mode). */
  electrodeFraction: number;
}

/** Cumulative counts of the axon merge (non-invasive mode with a central drive). */
export interface AxonEvents {
  central: number;
  centralTransmitted: number;
  fesTransmitted: number;
  collisions: number;
  fesBlocked: number;
  resets: number;
}

export interface SimulationRequest {
  stimulus: Stimulus;
  modelVariant: ModelVariant;
  calibrationTarget: CalibrationTarget;
  stimulationSite: StimulationSite;
  condition: ConditionId;
  /** Ids of the condition's adjustments; omitted = the condition's defaults (decided by the engine). */
  conditionAdjustments?: string[];
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
  /** LITERATURE only; omitted = no drive. */
  centralDrive?: CentralDrive;
  /** `unitEvents`: stream the per-unit events of the 3D replay (≤ 30 s of simulated time). */
  output?: { unitEvents: boolean };
}

/** Where one value of a muscle preset comes from (GET /muscles, `provenance`). */
export interface PresetFieldSource {
  field: string;
  provenance: 'MEASURED' | 'FITTED' | 'INHERITED';
  value: string;
  source: { citation: string; title: string; doi: string | null; pmid: string | null } | null;
  evidence: 'FULL_TEXT' | 'ABSTRACT' | null;
  /** Only for this calibration target; null = always. */
  calibrationTarget: CalibrationTarget | null;
}

export interface MusclePreset {
  id: MuscleId;
  label: string;
  poolSize: UnitsPerType;
  /** Empty for the original model's leg presets; older servers omit it. */
  provenance?: PresetFieldSource[];
}

// ---- Stream events (section 2 of the contract) ----

export interface StartedEvent {
  type: 'started';
  simulationId: string;
  durationMs: number;
  outputStepMs: number;
  motorUnits: UnitsPerType;
  muscle: MuscleId;
  /** Maximal force of the healthy muscle (fused 100 Hz tetanus, all units, rested); null for ORIGINAL. */
  maxForce?: number | null;
  /** Electrode position along the axon from the soma; null when the stimulus goes into the soma. */
  electrodeFraction?: number | null;
  /** Per-unit geometry and conduction times, for the 3D step; older servers omit it. */
  units?: UnitAnatomy | null;
  /** Integration step: `unitEvents` samples × this = ms. */
  stepMs?: number | null;
  /** Wrist joint driven by the stimulated muscle (FCR / ECR runs of the LITERATURE model), else null. */
  joint?: WristJointModel | null;
}

/** Constants of the 1-DOF wrist (engine `domain/wrist_joint.py`; sources there). */
export interface WristJointModel {
  momentArmMm: number;
  peakForceN: number;
  inertiaKgM2: number;
  dampingNmsRad: number;
  stiffnessNmRad: number;
  flexionLimitDeg: number;
  extensionLimitDeg: number;
}

/** One entry per simulated unit in every column, S then FR then FF (contract §2, `started.units`). */
export interface UnitAnatomy {
  motoneuron: 'BOOTH_1997' | 'CISI_KOHN_2008';
  type: MotorUnitType[];
  /** Position within the type in the muscle pool (0 = the smallest). */
  poolIndex: number[];
  /** The soma is a cylinder as long as it is wide. */
  somaDiameterUm: number[];
  /** The dendrite is one equivalent cylinder, not a branched tree. */
  dendriteDiameterUm: number[];
  dendriteLengthMm: number[];
  conductionMs: number[];
  /** Null when the stimulus goes into the soma (no electrode on the axon). */
  toElectrodeMs: number[] | null;
  toMuscleMs: number[] | null;
  /** Pool units this simulated unit stands for. */
  weight: number[];
  /** Rheobase of the axon at the electrode, in the stimulus's units. */
  axonRheobase: number[];
}

export interface ForceSeries {
  total: number[];
  S: number[];
  FR: number[];
  FF: number[];
}

/** Kinds of `unitEvents` (engine `domain/unit_events.py`; the same numbers). */
export const UNIT_EVENT_KIND = {
  SOMA_SPIKE: 0,
  FES_FIRE: 1,
  FES_BLOCKED: 2,
  COLLISION: 3,
  ANTIDROMIC_RESET: 4,
  CENTRAL_PASSED: 5,
  SOMA_COLLISION: 6,
  MUSCLE_ARRIVAL: 7,
  CENTRAL_BLOCKED: 8,
} as const;

/** Parallel arrays, one entry per event; `origin` is a related sample or -1 (contract §2, `chunk.unitEvents`). */
export interface UnitEventsChunk {
  sample: number[];
  unit: number[];
  kind: number[];
  origin: number[];
}

/** Longest run whose per-unit events are streamed (the engine's limit). */
export const MAX_UNIT_EVENTS_DURATION_MS = 30_000;

export interface ChunkEvent {
  type: 'chunk';
  progress: number;
  timeMs: number[];
  stimulus: number[];
  force: ForceSeries;
  emg: number[];
  /** Remaining force capacity at the end of the chunk (LITERATURE); null without fatigue (ORIGINAL). */
  fatigue?: FatigueSnapshot | null;
  /** Axon-merge counts so far; null outside the non-invasive mode with a central drive. */
  axonEvents?: AxonEvents | null;
  /** Per-unit events since the previous chunk, when the request asked for them (`output.unitEvents`). */
  unitEvents?: UnitEventsChunk | null;
  /** Wrist angle (°, + flexion) and muscle torque (N·m) at `timeMs`, when the run has a joint. */
  joint?: { angleDeg: number[]; torqueNm: number[] } | null;
}

export interface FatigueSnapshot {
  timeMs: number;
  /** Whole muscle, units weighted by their rested twitch force (1 = rested). */
  muscle: number;
  /** Mean of the simulated units of the type; null when the type has none. */
  S: number | null;
  FR: number | null;
  FF: number | null;
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
