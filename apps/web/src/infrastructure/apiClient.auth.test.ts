import { describe, expect, it, vi } from 'vitest';
import { defaultRequest } from '../domain/defaults';
import { CONTRACT_LIMITS } from '../domain/limits';
import type { SimulationEvent } from '../domain/simulation';
import { sse, sseResponse } from '../test/streams';
import type { TokenSource } from './apiClient';
import { ApiHttpError, createApiClient } from './apiClient';
import { firebaseConfigFromEnv } from './authConfig';

const done = sse('started', { simulationId: 'a', durationMs: 1, outputStepMs: 1, motorUnits: { S: 1, FR: 0, FF: 0 }, muscle: 'SOLEUS' }) +
  sse('completed', { elapsedSeconds: 0, summary: { peakForce: 0, meanForce: 0, timeToPeakMs: 0 } });
const problem = (status: number) =>
  new Response(JSON.stringify({ status, title: 'x' }), { status, headers: { 'Content-Type': 'application/problem+json' } });
const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });

async function drain(gen: AsyncGenerator<SimulationEvent>) {
  const out: SimulationEvent[] = [];
  for await (const e of gen) out.push(e);
  return out;
}
const headersOf = (call: unknown[]) => ((call[1] as RequestInit).headers ?? {}) as Record<string, string>;
const tokens = (values: string[]): TokenSource & { token: ReturnType<typeof vi.fn> } => ({
  token: vi.fn(async (force?: boolean) => (force ? values[1]! : values[0]!)),
  onForbidden: vi.fn(),
  onUnauthorized: vi.fn(),
});

describe('apiClient with sign-in', () => {
  it('sends no Authorization header without sign-in (as before)', async () => {
    const fetchMock = vi.fn(async () => sseResponse([done]));
    await drain(createApiClient({ fetch: fetchMock as unknown as typeof fetch }).streamSimulation(defaultRequest()));
    expect(headersOf(fetchMock.mock.calls[0]!)).not.toHaveProperty('Authorization');
  });

  it('sends the ID token on simulations, never on the public catalogues', async () => {
    const fetchMock = vi.fn(async (url: string) => (url.includes('simulations') ? sseResponse([done]) : json([])));
    const api = createApiClient({ fetch: fetchMock as unknown as typeof fetch, auth: tokens(['t1', 't2']) });
    await drain(api.streamSimulation(defaultRequest()));
    await api.getMuscles();
    await api.getConditions();
    const [sim, muscles, conditions] = fetchMock.mock.calls;
    expect(headersOf(sim!).Authorization).toBe('Bearer t1');
    expect(headersOf(muscles!)).not.toHaveProperty('Authorization');
    expect(headersOf(conditions!)).not.toHaveProperty('Authorization');
  });

  it('retries once with a refreshed token after a 401, and signs out if that fails too', async () => {
    const auth = tokens(['old', 'fresh']);
    const fetchMock = vi.fn().mockResolvedValueOnce(problem(401)).mockResolvedValueOnce(sseResponse([done]));
    const api = createApiClient({ fetch: fetchMock as unknown as typeof fetch, auth });
    expect((await drain(api.streamSimulation(defaultRequest()))).map((e) => e.type)).toEqual(['started', 'completed']);
    expect(headersOf(fetchMock.mock.calls[1]!).Authorization).toBe('Bearer fresh');
    expect(auth.token).toHaveBeenLastCalledWith(true);

    const always401 = vi.fn(async () => problem(401));
    const api2 = createApiClient({ fetch: always401 as unknown as typeof fetch, auth });
    await expect(drain(api2.streamSimulation(defaultRequest()))).rejects.toBeInstanceOf(ApiHttpError);
    expect(always401).toHaveBeenCalledTimes(2);
    expect(auth.onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it('reports a 403 (account not allowed) to the sign-in', async () => {
    const auth = tokens(['t', 't']);
    const api = createApiClient({ fetch: (async () => problem(403)) as unknown as typeof fetch, auth });
    await expect(drain(api.streamSimulation(defaultRequest()))).rejects.toMatchObject({ status: 403 });
    expect(auth.onForbidden).toHaveBeenCalledTimes(1);
  });

  it('checks access with GET /api/v1/session and reads the limits', async () => {
    const fetchMock = vi.fn(async (url: string) =>
      url.endsWith('/session') ? json({ uid: 'u' }) : json({ ...CONTRACT_LIMITS, maxDurationMs: 5000 }),
    );
    const api = createApiClient({ fetch: fetchMock as unknown as typeof fetch });
    expect(await api.checkAccess!('tok')).toBe('allowed');
    expect(headersOf(fetchMock.mock.calls[0]!).Authorization).toBe('Bearer tok');
    expect((await api.getLimits!()).maxDurationMs).toBe(5000);
    expect(fetchMock.mock.calls[1]![0]).toBe('/api/v1/limits');
    const denied = createApiClient({ fetch: (async () => problem(403)) as unknown as typeof fetch });
    expect(await denied.checkAccess!('tok')).toBe('forbidden');
    const down = createApiClient({ fetch: (async () => problem(502)) as unknown as typeof fetch });
    expect(await down.checkAccess!('tok')).toBe('unknown');
  });
});

describe('firebaseConfigFromEnv', () => {
  const env = {
    VITE_FIREBASE_API_KEY: 'k',
    VITE_FIREBASE_AUTH_DOMAIN: 'p.firebaseapp.com',
    VITE_FIREBASE_PROJECT_ID: 'p',
    VITE_FIREBASE_APP_ID: '1:2:web:3',
  };

  it('enables sign-in only when the four required values are set', () => {
    expect(firebaseConfigFromEnv(env)).toEqual({ apiKey: 'k', authDomain: 'p.firebaseapp.com', projectId: 'p', appId: '1:2:web:3' });
    expect(firebaseConfigFromEnv({})).toBeNull();
    expect(firebaseConfigFromEnv({ ...env, VITE_FIREBASE_APP_ID: ' ' })).toBeNull();
    expect(firebaseConfigFromEnv({ ...env, VITE_FIREBASE_STORAGE_BUCKET: 'b', VITE_FIREBASE_MESSAGING_SENDER_ID: '2' })).toMatchObject({
      storageBucket: 'b',
      messagingSenderId: '2',
    });
  });
});
