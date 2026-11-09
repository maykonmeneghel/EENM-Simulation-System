import type { Locale } from '../i18n/locale';
import { tr } from '../i18n/locale';
import type { ServerLimits } from '../domain/limits';
import { parseLimits } from '../domain/limits';
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
  /** Muscle presets, with their texts in `locale` (the server's default, pt-BR, when omitted). */
  getMuscles(signal?: AbortSignal, locale?: Locale): Promise<MusclePreset[]>;
  /** Conditions and their per-article adjustments (engine catalog), with their texts in `locale`. */
  getConditions(signal?: AbortSignal, locale?: Locale): Promise<ConditionInfo[]>;
  /** Starts a simulation and yields stream events as they arrive. Abort via `signal`. */
  streamSimulation(request: SimulationRequest, signal?: AbortSignal): AsyncGenerator<SimulationEvent>;
  /** The limits the server enforces (`GET /api/v1/limits`); absent on clients that do not ask. */
  getLimits?(signal?: AbortSignal): Promise<ServerLimits>;
  /** With sign-in: may this token's account use the simulator? (`GET /api/v1/session`: 200, or 403 when not.) */
  checkAccess?(token: string): Promise<'allowed' | 'forbidden' | 'unknown'>;
}

/** The signed-in user's ID token, for the calls that run the engine (docs/deployment.md, sign-in). */
export interface TokenSource {
  /** The current token (refreshed by the SDK when it is about to expire), or null when signed out. */
  token(forceRefresh?: boolean): Promise<string | null>;
  /** The server refused the account (403 after sign-in): it is not allowed on this site. */
  onForbidden?(): void;
  /** The server rejected the token even after a refresh (401): sign in again. */
  onUnauthorized?(): void;
}

export interface ApiClientOptions {
  /** Base URL prefix, e.g. '' (same origin, via the dev/nginx proxy) or 'http://localhost:8080'. */
  baseUrl?: string;
  fetch?: typeof fetch;
  /** With sign-in: `Authorization: Bearer <ID token>` on the simulation calls (never on the public catalogues). */
  auth?: TokenSource;
}

export function createApiClient(options: ApiClientOptions = {}): ApiClient {
  const baseUrl = (options.baseUrl ?? '').replace(/\/+$/, '');
  const doFetch = options.fetch ?? ((input, init) => globalThis.fetch(input, init));

  return {
    async getMuscles(signal, locale) {
      const res = await doFetch(`${baseUrl}/api/v1/muscles${langQuery(locale)}`, {
        headers: { Accept: 'application/json' },
        signal,
      });
      if (!res.ok) throw await toHttpError(res);
      const body: unknown = await res.json();
      if (!Array.isArray(body)) {
        throw new StreamProtocolError('BAD_RESPONSE', tr({ 'pt-BR': 'Resposta inesperada de /api/v1/muscles', en: 'Unexpected response from /api/v1/muscles' }));
      }
      return body as MusclePreset[];
    },

    async getConditions(signal, locale) {
      const res = await doFetch(`${baseUrl}/api/v1/conditions${langQuery(locale)}`, { headers: { Accept: 'application/json' }, signal });
      if (!res.ok) throw await toHttpError(res);
      const body: unknown = await res.json();
      if (!Array.isArray(body)) throw new Error('unexpected conditions body');
      return body as ConditionInfo[];
    },

    async checkAccess(token) {
      const res = await doFetch(`${baseUrl}/api/v1/session`, {
        headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
      });
      return res.ok ? 'allowed' : res.status === 403 ? 'forbidden' : 'unknown';
    },

    async getLimits(signal) {
      const res = await doFetch(`${baseUrl}/api/v1/limits`, { headers: { Accept: 'application/json' }, signal });
      if (!res.ok) throw await toHttpError(res);
      return parseLimits(await res.json());
    },

    async *streamSimulation(request, signal) {
      const post = async (forceRefresh: boolean) => {
        const token = options.auth ? await options.auth.token(forceRefresh) : null;
        return doFetch(`${baseUrl}/api/v1/simulations`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'text/event-stream, application/problem+json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify(request),
          signal,
        });
      };
      let res = await post(false);
      // an expired or revoked token: one more try with a fresh one
      if (res.status === 401 && options.auth) res = await post(true);
      if (!res.ok) {
        if (res.status === 401) options.auth?.onUnauthorized?.();
        if (res.status === 403 && options.auth) options.auth.onForbidden?.();
        throw await toHttpError(res);
      }
      if (!res.body) throw new StreamProtocolError('NO_BODY', tr({ 'pt-BR': 'Resposta sem corpo de stream', en: 'Response without a stream body' }));

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
            ? tr({ 'pt-BR': 'O stream terminou no meio de um evento', en: 'The stream ended in the middle of an event' })
            : tr({ 'pt-BR': 'O stream terminou sem evento "completed" ou "error"', en: 'The stream ended without a "completed" or "error" event' }),
        );
      }
    },
  };
}

/** `?lang=` of the catalog endpoints; none when the locale is not given (the server answers in pt-BR). */
function langQuery(locale: Locale | undefined): string {
  return locale ? `?lang=${encodeURIComponent(locale)}` : '';
}

const KNOWN_TYPES = new Set(['started', 'chunk', 'completed', 'error']);

/** Parse one SSE message into a typed event. Returns null for unknown event names. */
export function decodeEvent(eventName: string, data: string): SimulationEvent | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch {
    throw new StreamProtocolError('BAD_EVENT', tr({ 'pt-BR': `JSON inválido no evento "${eventName}"`, en: `Invalid JSON in the "${eventName}" event` }));
  }
  if (typeof parsed !== 'object' || parsed === null) {
    throw new StreamProtocolError('BAD_EVENT', tr({ 'pt-BR': `Evento "${eventName}" não é um objeto`, en: `The "${eventName}" event is not an object` }));
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
    throw new StreamProtocolError('BAD_CHUNK', tr({ 'pt-BR': 'Chunk sem todas as séries do contrato', en: 'Chunk without all the series of the contract' }));
  }
  const n = c.timeMs.length;
  if (!arrays.every((a) => (a as unknown[]).length === n)) {
    throw new StreamProtocolError('BAD_CHUNK', tr({ 'pt-BR': 'Séries do chunk com tamanhos diferentes', en: 'Chunk series of different lengths' }));
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
