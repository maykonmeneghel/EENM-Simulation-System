import type { ModelVariant, MusclePreset, SimulationRequest } from './simulation';

/**
 * Defaults of the app: the corrected model (LITERATURE) driven like a stimulator — 40 Hz, 300 µs symmetric
 * biphasic pulses at 1.5× the all-units threshold, continuous, no ramps. `defaultRequest('ORIGINAL')` keeps the
 * contract defaults that reproduce `Mathematical Model/Main.m`.
 */
export function defaultRequest(variant: ModelVariant = 'LITERATURE'): SimulationRequest {
  const req: SimulationRequest = {
    stimulus: {
      durationMs: 1000,
      stepMs: 0.01,
      frequencyHz: 40,
      dutyCyclePercent: 20,
      amplitude: 100,
      waveform: 'MONOPHASIC',
      modulation: { target: 'AMPLITUDE', shape: 'STEP', peakTimeMs: null },
      trainOnMs: null,
      trainPeriodMs: null,
    },
    modelVariant: variant,
    calibrationTarget: 'WHOLE_MUSCLE',
    stimulationSite: 'SKIN_SURFACE',
    condition: 'NORMAL',
    muscle: 'SOLEUS',
    unitsPerType: { S: 5, FR: 2, FF: 2 },
    axonLengthPercent: 80,
    temperatureCelsius: 6.3,
    injectionSite: 'SOMA',
    somaGeometry: 'CYLINDRICAL',
    dendriteGeometry: 'CYLINDRICAL',
    seed: 0,
    outputStepMs: 0.1,
  };
  if (variant === 'LITERATURE') {
    // Let the server pick 120 representative units in the pool's proportions.
    delete req.unitsPerType;
    req.stimulus = { ...req.stimulus, ...STIMULATOR_DEFAULTS };
  }
  return req;
}

/** Upper bound per unit type when the muscle pool size is unknown (contract: 0 – 200 each). */
export const MAX_UNITS_PER_TYPE = 200;

/** Units the LITERATURE variant uses when `unitsPerType` is omitted. */
export const LITERATURE_AUTO_UNITS = 120;

/** Duration limits (fatigue protocols last minutes). */
export const MIN_DURATION_MS = 10;
export const MAX_DURATION_MS = 300_000;

/** Max output-step allowed by the contract. */
export const MAX_OUTPUT_STEP_MS = 10;

/** Chart/buffer budget: samples per streamed series we aim to stay under. */
export const MAX_POINTS_PER_SERIES = 100_000;

/** Stimulator defaults: 300 µs (FES uses 300–600 µs, Doucet et al. 2012), 1.5× the all-units threshold. */
export const STIMULATOR_DEFAULTS = {
  pulseWidthUs: 300,
  amplitude: 153,
  waveform: 'BIPHASIC_SYMMETRIC',
  rampUpMs: 0,
  rampDownMs: 0,
} as const;

/** Stimulator ranges (API: pulseWidthUs 20–1000 µs, ramps 0–60 000 ms). */
export const PULSE_WIDTH_US = { min: 20, max: 1000 } as const;
export const MAX_RAMP_MS = 60_000;

export type MusclePresetIndex = ReadonlyMap<string, MusclePreset>;
