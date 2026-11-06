import type { AxonEvents, SimulationRequest } from '../domain/simulation';
import type { ApiClient } from '../infrastructure/apiClient';
import { ApiHttpError, StreamProtocolError } from '../infrastructure/apiClient';
import { FatigueBuffer } from './fatigue';
import { SeriesBuffer } from './seriesBuffer';
import type { SessionAction, SessionError, SessionState } from './session';
import { initialSessionState, sessionReducer } from './session';
import { tr } from '../i18n/locale';

type Listener = () => void;

/**
 * Framework-agnostic store driving one simulation at a time: owns the reducer state, the
 * SeriesBuffer and the AbortController. React binds to it with useSyncExternalStore.
 */
export class SimulationController {
  readonly series = new SeriesBuffer();
  readonly fatigue = new FatigueBuffer();
  /** Latest axon-merge counts of the run (non-invasive mode with a central drive), else null. */
  axonEvents: AxonEvents | null = null;
  private state: SessionState = initialSessionState;
  private listeners = new Set<Listener>();
  private abortController: AbortController | null = null;
  private readonly api: ApiClient;

  constructor(api: ApiClient) {
    this.api = api;
  }

  getState = (): SessionState => this.state;

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  dispatch(action: SessionAction): void {
    const next = sessionReducer(this.state, action);
    if (next === this.state) return;
    this.state = next;
    for (const l of this.listeners) l();
  }

  /** Runs a simulation to its end. Resolves when the session reaches a terminal state. */
  async start(request: SimulationRequest): Promise<void> {
    if (this.state.status === 'running') return;
    const abort = new AbortController();
    this.abortController = abort;
    this.series.reset(estimateSamples(request));
    this.fatigue.reset();
    this.axonEvents = null;
    this.dispatch({ type: 'start', request });

    try {
      for await (const event of this.api.streamSimulation(request, abort.signal)) {
        if (abort.signal.aborted) break;
        switch (event.type) {
          case 'started':
            this.series.reset(Math.ceil(event.durationMs / event.outputStepMs) + 1);
            this.dispatch({ type: 'started', event });
            break;
          case 'chunk': {
            const samples = this.series.append(event);
            this.fatigue.append(event);
            this.axonEvents = event.axonEvents ?? null;
            this.dispatch({ type: 'chunk', progress: event.progress, samples });
            break;
          }
          case 'completed':
            this.dispatch({ type: 'completed', event });
            break;
          case 'error':
            this.dispatch({
              type: 'failed',
              error: { kind: 'stream', message: event.message, code: event.code, fieldErrors: [] },
            });
            break;
        }
      }
    } catch (err) {
      if (abort.signal.aborted || isAbortError(err)) {
        this.dispatch({ type: 'aborted' });
      } else {
        this.dispatch({ type: 'failed', error: toSessionError(err) });
      }
    } finally {
      if (this.abortController === abort) this.abortController = null;
    }
    if (abort.signal.aborted) this.dispatch({ type: 'aborted' });
  }

  /** Aborts the running request (closes the HTTP stream). */
  stop(): void {
    if (this.state.status !== 'running') return;
    this.abortController?.abort();
    this.dispatch({ type: 'aborted' });
  }
}

function estimateSamples(r: SimulationRequest): number {
  const n = r.stimulus.durationMs / r.outputStepMs;
  return Number.isFinite(n) && n > 0 ? Math.min(Math.ceil(n) + 1, 2_000_000) : 1024;
}

function isAbortError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'name' in err &&
    (err as { name: unknown }).name === 'AbortError'
  );
}

export function toSessionError(err: unknown): SessionError {
  if (err instanceof ApiHttpError) {
    const fieldErrors = err.fieldErrors;
    return {
      kind: fieldErrors.length > 0 ? 'validation' : 'http',
      status: err.status,
      message: err.message,
      fieldErrors,
    };
  }
  if (err instanceof StreamProtocolError) {
    return { kind: 'protocol', code: err.code, message: err.message, fieldErrors: [] };
  }
  const message = err instanceof Error ? err.message : String(err);
  return {
    kind: 'network',
    message: `${tr({ 'pt-BR': 'Falha de comunicação com a API', en: 'Communication with the API failed' })}: ${message}`,
    fieldErrors: [],
  };
}
