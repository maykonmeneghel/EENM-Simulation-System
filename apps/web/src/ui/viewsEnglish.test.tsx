import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FormValues } from '../application/formModel';
import { defaultFormValues } from '../application/formModel';
import { topicView } from '../application/inspectorTopics';
import { buildModelSnapshot } from '../application/modelView';
import type { SessionState } from '../application/session';
import { initialSessionState } from '../application/session';
import { formatDecimal, signalPath } from '../application/signalPath';
import { stimulatorProblems } from '../domain/stimulator';
import { setLocale } from '../i18n/locale';
import { DiagramView } from './DiagramView';
import { InspectorPanel } from './InspectorPanel';
import { ErrorBanner, ProgressBar, SummaryCard } from './StatusPanel';
import { StimulatorScopes } from './StimulatorView';
import { ZoomBar } from './ZoomBar';
import { ZoomSync } from './zoomSync';

/** Portuguese-only letters: none may be left in an English text (bibliographic data excepted). */
const PORTUGUESE = /[ãõçáéíóúâêôº]/i;

const base = defaultFormValues();
const driveNonInvasive: FormValues = { ...base, driveEnabled: true, condition: 'PARKINSON', conditionAdjustments: ['PD_TREMOR'] };

beforeEach(() => setLocale('en'));
afterEach(() => setLocale('pt-BR'));

describe('views in English', () => {
  it('signal path of every mode is English, with a decimal point', () => {
    for (const values of [
      base,
      driveNonInvasive,
      { ...driveNonInvasive, stimulationSite: 'MOTONEURON_POOL' as const },
      { ...base, stimulationSite: 'MOTONEURON_POOL' as const },
    ]) {
      const steps = signalPath(values);
      expect(steps.length).toBeGreaterThan(2);
      for (const s of steps) expect(s).not.toMatch(PORTUGUESE);
    }
    expect(signalPath(driveNonInvasive).join(' ')).toMatch(/oscillation \(tremor\)/);
    expect(formatDecimal('4,4')).toBe('4.4');
    setLocale('pt-BR');
    expect(formatDecimal('4.4')).toBe('4,4');
  });

  it('inspector titles and readings', () => {
    const view = topicView({ kind: 'chart', chart: 'force' }, ['5b', '8b'], () => 'x');
    expect(view.title).toBe('Muscle force');
    for (const t of view.reading!) expect(t).not.toMatch(PORTUGUESE);
    expect(topicView({ kind: 'stage', stage: '3' }, [], () => 'Conduction').title).toBe('Stage 3 · Conduction');
    expect(topicView({ kind: 'mode' }, [], () => '').title).toBe('Application mode');
  });

  it('inspector sections of my scope (reading, signal path, drive, axon counts, limits) have no Portuguese', () => {
    const { container } = render(
      <InspectorPanel
        topic={{ kind: 'chart', chart: 'force' }}
        values={driveNonInvasive}
        axonEvents={{ central: 1200, centralTransmitted: 1000, fesTransmitted: 30, collisions: 200, fesBlocked: 5, resets: 2 }}
      />,
    );
    expect(screen.getByText('Non-invasive mode · central drive · tremor')).toBeInTheDocument();
    for (const id of ['explain-reading', 'explain-mode', 'explain-drive', 'explain-axon', 'explain-limits']) {
      const section = container.querySelector(`[aria-labelledby="${id}"]`);
      expect(section, id).not.toBeNull();
      // references keep their bibliographic text; the rest must be English
      const clone = section!.cloneNode(true) as HTMLElement;
      clone.querySelectorAll('.explain-refs').forEach((r) => r.remove());
      expect(clone.textContent, id).not.toMatch(PORTUGUESE);
    }
    expect(screen.getByText('Collisions')).toBeInTheDocument();
    expect(screen.getByText('1,200')).toBeInTheDocument();
  });

  it('empty inspector and help topic', () => {
    render(<InspectorPanel topic={null} values={base} axonEvents={null} />);
    expect(screen.getByText(/Click a component of the central area/)).toBeInTheDocument();
  });

  it('diagram', () => {
    const snapshot = buildModelSnapshot({ values: base, muscles: [] });
    const { container } = render(<DiagramView snapshot={snapshot} running={false} onSelectStage={() => {}} />);
    expect(screen.getByText(/Neuromusculoskeletal chain/)).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Model diagram' })).toBeInTheDocument();
    expect(container.textContent).not.toMatch(PORTUGUESE);
    expect(container.textContent).toMatch(/\d\.\d/); // decimal point in the numbers
  });

  it('stimulator scopes and problems', () => {
    const { container } = render(<StimulatorScopes values={base} errors={[]} />);
    expect(screen.getByLabelText('Pulse shape', { selector: 'figure' })).toBeInTheDocument();
    expect(screen.getByText(/one phase of 300 µs \+ opposite phase/)).toBeInTheDocument();
    expect(screen.getByText('100 % recruited')).toBeInTheDocument();
    for (const fig of container.querySelectorAll('figure')) expect(fig.textContent).not.toMatch(PORTUGUESE);
    const problems = stimulatorProblems({
      frequencyHz: 1000,
      pulseWidthUs: 600,
      amplitude: 100,
      waveform: 'BIPHASIC_SYMMETRIC',
      durationMs: 100,
      trainOnMs: null,
      trainPeriodMs: null,
      rampUpMs: 80,
      rampDownMs: 80,
    } as Parameters<typeof stimulatorProblems>[0]);
    expect(problems).toEqual(['The two phases of the pulse do not fit in the period.', 'Ramp up + ramp down longer than the on time.']);
  });

  it('status, error banner and summary', () => {
    const state: SessionState = {
      ...initialSessionState,
      status: 'completed',
      progress: 1,
      samples: 12345,
      run: { type: 'started', simulationId: 'id', durationMs: 1000, outputStepMs: 0.1, motorUnits: { S: 1, FR: 1, FF: 1 }, muscle: 'SOLEUS', maxForce: null },
      result: { type: 'completed', elapsedSeconds: 2.5, summary: { peakForce: 1.5, meanForce: 0.75, timeToPeakMs: 120.5 } } as SessionState['result'],
    };
    const { container } = render(
      <>
        <ProgressBar state={state} />
        <ErrorBanner error={{ kind: 'validation', message: 'x', fieldErrors: [] }} />
        <SummaryCard state={state} />
      </>,
    );
    expect(screen.getByText('Completed')).toBeInTheDocument();
    expect(screen.getByText('Parameters rejected by the API')).toBeInTheDocument();
    expect(screen.getByText('Peak force')).toBeInTheDocument();
    expect(screen.getByText(/12,345 samples/)).toBeInTheDocument();
    expect(container.textContent).not.toMatch(PORTUGUESE);
  });

  it('zoom bar', () => {
    const { container } = render(<ZoomBar zoom={new ZoomSync()} durationMs={1000} />);
    expect(screen.getByRole('button', { name: 'Reset zoom' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Pan' })).toBeInTheDocument();
    expect(container.textContent).not.toMatch(PORTUGUESE);
  });
});
