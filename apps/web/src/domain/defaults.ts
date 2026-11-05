import type { ModelVariant, MusclePreset, SimulationRequest } from './simulation';

/** Contract defaults (ORIGINAL reproduces `Mathematical Model/Main.m`). */
export function defaultRequest(variant: ModelVariant = 'ORIGINAL'): SimulationRequest {
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
  // LITERATURE: let the server pick 120 representative units in the pool's proportions.
  if (variant === 'LITERATURE') delete req.unitsPerType;
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

/** Clinical pulse suggested for LITERATURE (Weiss strength–duration, 0.3 ms pulses). */
export const CLINICAL_PULSE_MS = 0.3;
export const CLINICAL_AMPLITUDE = 153;

export type MusclePresetIndex = ReadonlyMap<string, MusclePreset>;
