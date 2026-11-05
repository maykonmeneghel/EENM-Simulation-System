import type {
  CompletedEvent,
  FieldError,
  SimulationRequest,
  StartedEvent,
} from '../domain/simulation';

/**
 * Simulation session state machine.
 *
 *   idle ──start──▶ running ──completed──▶ completed
 *                     │  ├────failed─────▶ failed
 *                     │  └────aborted────▶ aborted
 *   completed | failed | aborted ──start──▶ running (new run)
 *
 * The bulky time series are NOT kept here (copying 50k-point arrays on every chunk would be
 * wasteful); they live in a SeriesBuffer. The reducer only tracks how many samples exist so
 * views know when to redraw.
 */
export type SessionStatus = 'idle' | 'running' | 'completed' | 'failed' | 'aborted';

export type SessionErrorKind =
  | 'validation' // 400 problem+json with field errors
  | 'http' // other non-2xx response (e.g. 502 engine unreachable)
  | 'stream' // `error` event from the server
  | 'protocol' // stream broke the contract (truncated, bad JSON)
  | 'network'; // fetch / connection failure

export interface SessionError {
  kind: SessionErrorKind;
  message: string;
  code?: string;
  status?: number;
  fieldErrors: FieldError[];
}

export interface SessionState {
  status: SessionStatus;
  /** Monotonic run counter, lets views reset when a new run starts. */
  runId: number;
  /** Request of the current/last run (lets views interpret `run` correctly). */
  request: SimulationRequest | null;
  run: StartedEvent | null;
  progress: number;
  samples: number;
  chunks: number;
  result: CompletedEvent | null;
  error: SessionError | null;
}

export type SessionAction =
  | { type: 'start'; request?: SimulationRequest }
  | { type: 'started'; event: StartedEvent }
  | { type: 'chunk'; progress: number; samples: number }
  | { type: 'completed'; event: CompletedEvent }
  | { type: 'failed'; error: SessionError }
  | { type: 'aborted' }
  | { type: 'reset' };

export const initialSessionState: SessionState = {
  status: 'idle',
  runId: 0,
  request: null,
  run: null,
  progress: 0,
  samples: 0,
  chunks: 0,
  result: null,
  error: null,
};

export function isTerminal(status: SessionStatus): boolean {
  return status === 'completed' || status === 'failed' || status === 'aborted';
}

export function sessionReducer(state: SessionState, action: SessionAction): SessionState {
  switch (action.type) {
    case 'start':
      if (state.status === 'running') return state;
      return {
        ...initialSessionState,
        status: 'running',
        runId: state.runId + 1,
        request: action.request ?? null,
      };

    case 'reset':
      if (state.status === 'running') return state;
      return { ...initialSessionState, runId: state.runId };

    default:
      break;
  }

  // The remaining actions are only meaningful while running; late events after a terminal
  // state (e.g. a chunk that raced an abort) are ignored.
  if (state.status !== 'running') return state;

  switch (action.type) {
    case 'started':
      return { ...state, run: action.event };
    case 'chunk':
      return {
        ...state,
        progress: clamp01(Math.max(state.progress, action.progress)),
        samples: action.samples,
        chunks: state.chunks + 1,
      };
    case 'completed':
      return { ...state, status: 'completed', progress: 1, result: action.event };
    case 'failed':
      return { ...state, status: 'failed', error: action.error };
    case 'aborted':
      return { ...state, status: 'aborted' };
  }
}

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.min(1, Math.max(0, x));
}
