import type { ConditionInfo, FieldError, MusclePreset, SimulationEvent, SimulationRequest } from '../domain/simulation';
import { readSseStream } from './sseParser';

/** RFC 9457 problem details, with the contract's `errors` extension. */
export interface ProblemDetails {
  type?: string;
  title?: string;
  status?: number;
  detail?: string;
  instance?: string;
  errors?: FieldError[];
}

/** Non-2xx HTTP response (problem+json when the server provides it). */
export class ApiHttpError extends Error {
  readonly status: number;
  readonly problem: ProblemDetails | null;

  constructor(status: number, problem: ProblemDetails | null, fallback: string) {
    super(problem?.detail || problem?.title || fallback);
    this.name = 'ApiHttpError';
    this.status = status;
    this.problem = problem;
  }

  get fieldErrors(): FieldError[] {
    return this.problem?.errors ?? [];
  }
}

/** The stream violated the contract (bad JSON, unknown shape, ended without a terminal event). */
export class StreamProtocolError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'StreamProtocolError';
    this.code = code;
  }
}

export interface ApiClient {
  getMuscles(signal?: AbortSignal): Promise<MusclePreset[]>;
  /** Conditions and their per-article adjustments (engine catalog). */
  getConditions(signal?: AbortSignal): Promise<ConditionInfo[]>;
  /** Starts a simulation and yields stream events as they arrive. Abort via `signal`. */
  streamSimulation(request: SimulationRequest, signal?: AbortSignal): AsyncGenerator<SimulationEvent>;
}

export interface ApiClientOptions {
  /** Base URL prefix, e.g. '' (same origin, via the dev/nginx proxy) or 'http://localhost:8080'. */
  baseUrl?: string;
  fetch?: typeof fetch;
}

export function createApiClient(options: ApiClientOptions = {}): ApiClient {
  const baseUrl = (options.baseUrl ?? '').replace(/\/+$/, '');
  const doFetch = options.fetch ?? ((input, init) => globalThis.fetch(input, init));

  return {
    async getMuscles(signal) {
      const res = await doFetch(`${baseUrl}/api/v1/muscles`, {
        headers: { Accept: 'application/json' },
        signal,
      });
      if (!res.ok) throw await toHttpError(res);
      const body: unknown = await res.json();
      if (!Array.isArray(body)) {
        throw new StreamProtocolError('BAD_RESPONSE', 'Resposta inesperada de /api/v1/muscles');
      }
      return body as MusclePreset[];
    },

    async getConditions(signal) {
      const res = await doFetch(`${baseUrl}/api/v1/conditions`, { headers: { Accept: 'application/json' }, signal });
      if (!res.ok) throw await toHttpError(res);
      const body: unknown = await res.json();
      if (!Array.isArray(body)) throw new Error('unexpected conditions body');
      return body as ConditionInfo[];
    },

    async *streamSimulation(request, signal) {
      const res = await doFetch(`${baseUrl}/api/v1/simulations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream, application/problem+json',
        },
        body: JSON.stringify(request),
        signal,
      });
      if (!res.ok) throw await toHttpError(res);
      if (!res.body) throw new StreamProtocolError('NO_BODY', 'Resposta sem corpo de stream');

      let terminal = false;
      let truncated = false;
      for await (const msg of readSseStream(res.body, (info) => (truncated = info.truncated))) {
        const event = decodeEvent(msg.event, msg.data);
        if (!event) continue; // unknown event names are ignored (forward compatibility)
        yield event;
        if (event.type === 'completed' || event.type === 'error') {
          terminal = true;
          break;
        }
      }
      if (!terminal) {
        throw new StreamProtocolError(
          'STREAM_TRUNCATED',
          truncated
            ? 'O stream terminou no meio de um evento'
            : 'O stream terminou sem evento "completed" ou "error"',
        );
      }
    },
  };
}

const KNOWN_TYPES = new Set(['started', 'chunk', 'completed', 'error']);

/** Parse one SSE message into a typed event. Returns null for unknown event names. */
export function decodeEvent(eventName: string, data: string): SimulationEvent | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch {
    throw new StreamProtocolError('BAD_EVENT', `JSON inválido no evento "${eventName}"`);
  }
  if (typeof parsed !== 'object' || parsed === null) {
    throw new StreamProtocolError('BAD_EVENT', `Evento "${eventName}" não é um objeto`);
  }
  const obj = parsed as Record<string, unknown>;
  // The contract puts the type both in `event:` and in `data.type`; data wins, event is fallback.
  const type = typeof obj.type === 'string' ? obj.type : eventName;
  if (!KNOWN_TYPES.has(type)) return null;
  const event = { ...obj, type } as SimulationEvent;
  if (event.type === 'chunk') assertChunkShape(event);
  return event;
}

function assertChunkShape(c: Extract<SimulationEvent, { type: 'chunk' }>): void {
  const arrays = [c.timeMs, c.stimulus, c.emg, c.force?.total, c.force?.S, c.force?.FR, c.force?.FF];
  if (!arrays.every(Array.isArray)) {
    throw new StreamProtocolError('BAD_CHUNK', 'Chunk sem todas as séries do contrato');
  }
  const n = c.timeMs.length;
  if (!arrays.every((a) => (a as unknown[]).length === n)) {
    throw new StreamProtocolError('BAD_CHUNK', 'Séries do chunk com tamanhos diferentes');
  }
}

async function toHttpError(res: Response): Promise<ApiHttpError> {
  let problem: ProblemDetails | null = null;
  const contentType = res.headers.get('content-type') ?? '';
  if (contentType.includes('json')) {
    try {
      problem = (await res.json()) as ProblemDetails;
    } catch {
      problem = null;
    }
  }
  return new ApiHttpError(res.status, problem, `HTTP ${res.status} ${res.statusText}`.trim());
}
