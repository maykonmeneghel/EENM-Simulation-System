import type { MusclePreset, SimulationRequest } from './simulation';

/** Contract defaults (reproduce `Mathematical Model/Main.m`). */
export function defaultRequest(): SimulationRequest {
  return {
    stimulus: {
      durationMs: 1000,
      stepMs: 0.01,
      frequencyHz: 40,
      dutyCyclePercent: 20,
      amplitude: 100,
      waveform: 'MONOPHASIC',
      modulation: { target: 'AMPLITUDE', shape: 'STEP', peakTimeMs: null },
    },
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
}

/** Upper bound per unit type when the muscle pool size is unknown (contract: 0 – 50 each). */
export const MAX_UNITS_PER_TYPE = 50;

export type MusclePresetIndex = ReadonlyMap<string, MusclePreset>;
