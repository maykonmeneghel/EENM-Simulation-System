import { describe, expect, it } from 'vitest';
import { defaultRequest } from '../domain/defaults';
import type { ChunkEvent, SimulationEvent } from '../domain/simulation';
import type { ApiClient } from '../infrastructure/apiClient';
import { ApiHttpError } from '../infrastructure/apiClient';
import { SimulationController } from './simulationController';

const chunk = (t: number[], progress: number): ChunkEvent => ({
  type: 'chunk',
  progress,
  timeMs: t,
  stimulus: t.map(() => 100),
  force: { total: t.map(() => 1), S: t.map(() => 0.5), FR: t.map(() => 0.25), FF: t.map(() => 0.25) },
  emg: t.map(() => 0),
});

function fakeApi(events: SimulationEvent[] | (() => AsyncGenerator<SimulationEvent>)): ApiClient {
  return {
    getMuscles: async () => [],
    streamSimulation:
      typeof events === 'function'
        ? events
        : async function* () {
            yield* events;
          },
  };
}

describe('SimulationController', () => {
  it('appends chunks to the series buffer and completes', async () => {
    const c = new SimulationController(
      fakeApi([
        { type: 'started', simulationId: 'x', durationMs: 0.3, outputStepMs: 0.1, motorUnits: { S: 1, FR: 1, FF: 1 }, muscle: 'SOLEUS' },
        chunk([0, 0.1], 0.5),
        chunk([0.2, 0.3], 1),
        { type: 'completed', elapsedSeconds: 0.1, summary: { peakForce: 1, meanForce: 1, timeToPeakMs: 0 } },
      ]),
    );
    const seen: string[] = [];
    c.subscribe(() => seen.push(c.getState().status));
    await c.start(defaultRequest());
    expect(c.getState()).toMatchObject({ status: 'completed', samples: 4, chunks: 2 });
    expect(Array.from(c.series.view().timeMs)).toEqual([0, 0.1, 0.2, 0.3]);
    expect(seen[0]).toBe('running');
  });

  it('maps a 400 problem+json to a validation failure with field errors', async () => {
    const c = new SimulationController(
      // eslint-disable-next-line require-yield -- the stream fails before its first event
      fakeApi(async function* () {
        throw new ApiHttpError(400, { errors: [{ field: 'seed', message: 'must be >= 0' }] }, 'HTTP 400');
      }),
    );
    await c.start(defaultRequest());
    expect(c.getState().status).toBe('failed');
    expect(c.getState().error).toMatchObject({ kind: 'validation', status: 400, fieldErrors: [{ field: 'seed' }] });
  });

  it('maps an error event to a stream failure', async () => {
    const c = new SimulationController(fakeApi([{ type: 'error', message: 'engine down', code: 'ENGINE_UNAVAILABLE' }]));
    await c.start(defaultRequest());
    expect(c.getState().error).toMatchObject({ kind: 'stream', code: 'ENGINE_UNAVAILABLE' });
  });

  it('stop() aborts the stream and ends in aborted', async () => {
    let signal: AbortSignal | undefined;
    const api: ApiClient = {
      getMuscles: async () => [],
      async *streamSimulation(_req, s) {
        signal = s;
        yield chunk([0], 0.1);
        await new Promise((_r, reject) =>
          s?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError'))),
        );
      },
    };
    const c = new SimulationController(api);
    const done = c.start(defaultRequest());
    await new Promise((r) => setTimeout(r, 0));
    expect(c.getState().status).toBe('running');
    c.stop();
    await done;
    expect(signal?.aborted).toBe(true);
    expect(c.getState().status).toBe('aborted');
  });

  it('network errors become a network failure', async () => {
    const c = new SimulationController(
      // eslint-disable-next-line require-yield -- the stream fails before its first event
      fakeApi(async function* () {
        throw new TypeError('Failed to fetch');
      }),
    );
    await c.start(defaultRequest());
    expect(c.getState().error?.kind).toBe('network');
  });
});
