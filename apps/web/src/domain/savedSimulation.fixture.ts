import { defaultRequest } from './defaults';
import type { SavedSimulation } from './savedSimulation';

/** A small saved run for tests: `n` samples every `stepMs`, force rising as `total = gain · t`. */
export function savedFixture(over: Partial<SavedSimulation> = {}, n = 5, stepMs = 1, gain = 1): SavedSimulation {
  const request = defaultRequest('LITERATURE');
  const t = Float64Array.from({ length: n }, (_, i) => i * stepMs);
  const total = Float64Array.from(t, (x) => gain * x);
  const zeros = new Float64Array(n);
  return {
    id: 'a',
    name: 'Run A',
    savedAt: '2026-11-06T10:00:00.000Z',
    request,
    run: { type: 'started', simulationId: 's', durationMs: (n - 1) * stepMs, outputStepMs: stepMs, motorUnits: { S: 1, FR: 1, FF: 1 }, muscle: request.muscle, maxForce: 10 },
    result: { type: 'completed', elapsedSeconds: 0.5, summary: { peakForce: gain * (n - 1) * stepMs, meanForce: 1, timeToPeakMs: (n - 1) * stepMs } },
    samples: n,
    series: { timeMs: t, stimulus: zeros, total, S: zeros, FR: zeros, FF: zeros, emg: zeros },
    fatigue: { timeMs: Float64Array.of(0, t[n - 1]!), muscle: Float64Array.of(1, 0.9), S: Float64Array.of(1, 1), FR: Float64Array.of(1, NaN), FF: Float64Array.of(1, 0.8) },
    axonEvents: null,
    ...over,
  };
}
