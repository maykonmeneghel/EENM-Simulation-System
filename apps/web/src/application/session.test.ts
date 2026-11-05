import { describe, expect, it } from 'vitest';
import type { CompletedEvent, StartedEvent } from '../domain/simulation';
import type { SessionAction, SessionState } from './session';
import { initialSessionState, sessionReducer } from './session';

const started: StartedEvent = {
  type: 'started',
  simulationId: 'id',
  durationMs: 1000,
  outputStepMs: 0.1,
  motorUnits: { S: 5, FR: 2, FF: 2 },
  muscle: 'SOLEUS',
};
const completed: CompletedEvent = {
  type: 'completed',
  elapsedSeconds: 1,
  summary: { peakForce: 1, meanForce: 0.5, timeToPeakMs: 300 },
};
const run = (actions: SessionAction[], from: SessionState = initialSessionState) =>
  actions.reduce(sessionReducer, from);

describe('sessionReducer', () => {
  it('starts idle', () => {
    expect(initialSessionState.status).toBe('idle');
  });

  it('idle → running → completed', () => {
    const s = run([
      { type: 'start' },
      { type: 'started', event: started },
      { type: 'chunk', progress: 0.25, samples: 2500 },
      { type: 'chunk', progress: 0.5, samples: 5000 },
      { type: 'completed', event: completed },
    ]);
    expect(s).toMatchObject({ status: 'completed', progress: 1, samples: 5000, chunks: 2, run: started, result: completed, runId: 1 });
  });

  it('running → failed keeps the error', () => {
    const error = { kind: 'stream' as const, message: 'x', code: 'ENGINE_FAILURE', fieldErrors: [] };
    const s = run([{ type: 'start' }, { type: 'failed', error }]);
    expect(s.status).toBe('failed');
    expect(s.error).toBe(error);
  });

  it('running → aborted', () => {
    expect(run([{ type: 'start' }, { type: 'aborted' }]).status).toBe('aborted');
  });

  it('ignores stream events when not running', () => {
    const idle = initialSessionState;
    expect(sessionReducer(idle, { type: 'chunk', progress: 0.5, samples: 10 })).toBe(idle);
    expect(sessionReducer(idle, { type: 'completed', event: completed })).toBe(idle);
    const aborted = run([{ type: 'start' }, { type: 'aborted' }]);
    expect(sessionReducer(aborted, { type: 'chunk', progress: 0.9, samples: 10 })).toBe(aborted);
    expect(sessionReducer(aborted, { type: 'failed', error: { kind: 'network', message: '', fieldErrors: [] } })).toBe(aborted);
  });

  it('ignores a second start while running', () => {
    const s = run([{ type: 'start' }]);
    expect(sessionReducer(s, { type: 'start' })).toBe(s);
  });

  it('a new start from a terminal state clears the previous run', () => {
    const done = run([{ type: 'start' }, { type: 'started', event: started }, { type: 'completed', event: completed }]);
    const next = sessionReducer(done, { type: 'start' });
    expect(next).toMatchObject({ status: 'running', runId: 2, run: null, result: null, progress: 0, samples: 0 });
  });

  it('progress is clamped and monotonic', () => {
    const s = run([
      { type: 'start' },
      { type: 'chunk', progress: 0.6, samples: 1 },
      { type: 'chunk', progress: 0.4, samples: 2 },
    ]);
    expect(s.progress).toBe(0.6);
    expect(run([{ type: 'chunk', progress: 7, samples: 1 }], s).progress).toBe(1);
  });

  it('reset returns to idle but not while running', () => {
    const running = run([{ type: 'start' }]);
    expect(sessionReducer(running, { type: 'reset' })).toBe(running);
    const reset = run([{ type: 'aborted' }, { type: 'reset' }], running);
    expect(reset.status).toBe('idle');
  });
});
