import { describe, expect, it, vi } from 'vitest';
import { defaultRequest } from '../domain/defaults';
import type { SimulationEvent } from '../domain/simulation';
import { sse, sseResponse, splitEvery } from '../test/streams';
import { ApiHttpError, createApiClient, decodeEvent, StreamProtocolError } from './apiClient';

const started = { simulationId: 'abc', durationMs: 1, outputStepMs: 0.5, motorUnits: { S: 1, FR: 0, FF: 0 }, muscle: 'SOLEUS' };
const chunk = (t0: number, progress: number) => ({
  progress,
  timeMs: [t0, t0 + 0.5],
  stimulus: [100, 0],
  force: { total: [0.1, 0.2], S: [0.1, 0.2], FR: [0, 0], FF: [0, 0] },
  emg: [0, 0.01],
});
const completed = { elapsedSeconds: 0.2, summary: { peakForce: 0.2, meanForce: 0.15, timeToPeakMs: 0.5 } };

async function drain(gen: AsyncGenerator<SimulationEvent>) {
  const out: SimulationEvent[] = [];
  for await (const e of gen) out.push(e);
  return out;
}

describe('createApiClient.streamSimulation', () => {
  it('POSTs the request and yields typed events from a fragmented SSE stream', async () => {
    const body = sse('started', started) + sse('chunk', chunk(0, 0.5)) + sse('chunk', chunk(1, 1)) + sse('completed', completed);
    const fetchMock = vi.fn(async () => sseResponse(splitEvery(body, 7)));
    const api = createApiClient({ fetch: fetchMock as unknown as typeof fetch });

    const req = defaultRequest();
    const events = await drain(api.streamSimulation(req));

    expect(events.map((e) => e.type)).toEqual(['started', 'chunk', 'chunk', 'completed']);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/v1/simulations');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual(req);
    expect(events[1]).toMatchObject({ type: 'chunk', progress: 0.5, timeMs: [0, 0.5] });
  });

  it('uses the configured base URL', async () => {
    const fetchMock = vi.fn(async (_url: string) => Response.json([]));
    await createApiClient({ baseUrl: 'http://x:8080/', fetch: fetchMock as unknown as typeof fetch }).getMuscles();
    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://x:8080/api/v1/muscles');
  });

  it('stops after an error event', async () => {
    const body = sse('started', started) + sse('error', { message: 'boom', code: 'ENGINE_UNAVAILABLE' }) + sse('chunk', chunk(0, 1));
    const api = createApiClient({ fetch: (async () => sseResponse([body])) as unknown as typeof fetch });
    const events = await drain(api.streamSimulation(defaultRequest()));
    expect(events.map((e) => e.type)).toEqual(['started', 'error']);
  });

  it('throws ApiHttpError with field errors on 400 problem+json', async () => {
    const problem = {
      type: 'about:blank',
      title: 'Bad Request',
      status: 400,
      detail: 'Validation failed',
      errors: [{ field: 'stimulus.frequencyHz', message: 'must be between 1 and 200' }],
    };
    const fetchMock = async () =>
      new Response(JSON.stringify(problem), { status: 400, headers: { 'Content-Type': 'application/problem+json' } });
    const api = createApiClient({ fetch: fetchMock as unknown as typeof fetch });
    const err = await drain(api.streamSimulation(defaultRequest())).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiHttpError);
    expect((err as ApiHttpError).status).toBe(400);
    expect((err as ApiHttpError).fieldErrors).toEqual(problem.errors);
    expect((err as ApiHttpError).message).toBe('Validation failed');
  });

  it('throws ApiHttpError on 502 without JSON body', async () => {
    const api = createApiClient({
      fetch: (async () => new Response('bad gateway', { status: 502, statusText: 'Bad Gateway' })) as unknown as typeof fetch,
    });
    const err = await drain(api.streamSimulation(defaultRequest())).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiHttpError);
    expect((err as ApiHttpError).message).toBe('HTTP 502 Bad Gateway');
  });

  it('throws STREAM_TRUNCATED when the stream ends without a terminal event', async () => {
    const api = createApiClient({
      fetch: (async () => sseResponse([sse('started', started), sse('chunk', chunk(0, 0.5))])) as unknown as typeof fetch,
    });
    const err = await drain(api.streamSimulation(defaultRequest())).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(StreamProtocolError);
    expect((err as StreamProtocolError).code).toBe('STREAM_TRUNCATED');
  });

  it('propagates aborts from the signal', async () => {
    const abort = new AbortController();
    const fetchMock = (_url: string, init: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
      });
    const api = createApiClient({ fetch: fetchMock as unknown as typeof fetch });
    const pending = drain(api.streamSimulation(defaultRequest(), abort.signal)).catch((e: unknown) => e);
    abort.abort();
    expect(((await pending) as Error).name).toBe('AbortError');
  });
});

describe('decodeEvent', () => {
  it('prefers data.type and falls back to the SSE event name', () => {
    expect(decodeEvent('message', JSON.stringify({ type: 'completed', ...completed }))?.type).toBe('completed');
    expect(decodeEvent('completed', JSON.stringify(completed))?.type).toBe('completed');
  });

  it('ignores unknown event types', () => {
    expect(decodeEvent('heartbeat', '{}')).toBeNull();
  });

  it('rejects invalid JSON and inconsistent chunks', () => {
    expect(() => decodeEvent('chunk', '{nope')).toThrow(StreamProtocolError);
    const bad = { ...chunk(0, 1), emg: [1] };
    expect(() => decodeEvent('chunk', JSON.stringify(bad))).toThrow(/tamanhos/);
  });
});
