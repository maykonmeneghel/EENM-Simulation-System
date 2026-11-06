import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SavedSimulations } from '../application/savedSimulations';
import { SimulationController } from '../application/simulationController';
import { defaultRequest } from '../domain/defaults';
import type { ConditionInfo, MusclePreset, SimulationRequest } from '../domain/simulation';
import { setLocale } from '../i18n/locale';
import type { ApiClient } from '../infrastructure/apiClient';
import { MemorySavedSimulationStore } from '../infrastructure/savedSimulationStore';
import type { LiveChartProps } from './LiveChart';

vi.hoisted(() => {
  window.matchMedia ??= ((query: string) =>
    ({ matches: false, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }) as unknown as MediaQueryList);
});
const charts: LiveChartProps[] = [];
vi.mock('./LiveCharts', () => ({ LiveCharts: () => null }));
vi.mock('./LiveChart', () => ({
  LiveChart: (props: LiveChartProps) => {
    charts.push(props);
    return <figure aria-label={props.title} />;
  },
}));

const { App } = await import('./App');

const muscle = defaultRequest('LITERATURE').muscle;
const MUSCLES: MusclePreset[] = [{ id: muscle, label: 'Soleus', poolSize: { S: 800, FR: 50, FF: 50 } }];
const CONDITIONS: ConditionInfo[] = [{ id: 'NORMAL', label: 'Normal', adjustments: [] }];

/** Streams a 2 ms run whose force is the request's amplitude, so two runs differ by what was asked. */
function fakeApi(): ApiClient & { requests: SimulationRequest[] } {
  const requests: SimulationRequest[] = [];
  return {
    requests,
    getMuscles: async () => MUSCLES,
    getConditions: async () => CONDITIONS,
    async *streamSimulation(r) {
      requests.push(r);
      yield { type: 'started', simulationId: 'x', durationMs: 2, outputStepMs: 1, motorUnits: { S: 1, FR: 1, FF: 1 }, muscle: r.muscle, maxForce: 1000 };
      const a = r.stimulus.amplitude;
      const z = [0, 0, 0];
      yield { type: 'chunk', progress: 1, timeMs: [0, 1, 2], stimulus: z, force: { total: [0, a, a], S: z, FR: z, FF: z }, emg: z };
      yield { type: 'completed', elapsedSeconds: 0.1, summary: { peakForce: a, meanForce: a / 2, timeToPeakMs: 1 } };
    },
  };
}

async function simulateAndSave(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(screen.getAllByRole('button', { name: 'Simular' })[0]!);
  const field = await screen.findByLabelText('Nome');
  await user.clear(field);
  await user.type(field, name);
  await user.click(screen.getByRole('button', { name: 'Salvar para comparar' }));
  await screen.findByText('Simulação salva neste navegador.');
}

describe('saving runs and comparing them', () => {
  afterEach(() => setLocale('pt-BR'));

  it('saves two runs, compares them over one chart with a colour each, lists what differs, and reopens one', async () => {
    const api = fakeApi();
    const saved = new SavedSimulations(new MemorySavedSimulationStore());
    const user = userEvent.setup();
    render(<App api={api} controller={new SimulationController(api)} saved={saved} />);

    await simulateAndSave(user, 'Base');
    const baseAmplitude = api.requests[0]!.stimulus.amplitude;
    await user.click(screen.getByRole('tab', { name: /Estimulador/ }));
    const amp = screen.getByLabelText('Amplitude');
    await user.clear(amp);
    await user.type(amp, '120');
    await simulateAndSave(user, 'Mais forte');
    await user.click(screen.getByRole('button', { name: 'Ver em Comparar' }));

    const list = screen.getByRole('list', { name: 'Simulações salvas' });
    expect(within(list).getByRole('checkbox', { name: 'Base' })).toBeChecked();
    expect(within(list).getByRole('checkbox', { name: 'Mais forte' })).toBeChecked();

    await waitFor(() => expect(charts.at(-1)?.series).toHaveLength(2));
    const chart = charts.at(-1)!;
    expect(chart.series.map((s) => s.label)).toEqual(['Base', 'Mais forte']);
    expect(new Set(chart.series.map((s) => s.stroke)).size).toBe(2);
    expect(chart.yRange).toEqual([0, 105]); // % of the maximum (every run has one)
    const v = chart.buffer.view();
    expect(Array.from(v[chart.series[1]!.key]!)).toEqual([0, 12, 12]); // 120 of a 1000 maximum

    const diff = screen.getByRole('table', { name: 'Parâmetros que diferem' });
    const row = within(diff).getByRole('row', { name: /Amplitude/ });
    expect(row).toHaveTextContent(String(baseAmplitude));
    expect(row).toHaveTextContent('120');
    expect(within(screen.getByRole('table', { name: 'Resumo de cada simulação' })).getAllByRole('row')).toHaveLength(3);

    // one ticked: nothing to set apart
    await user.click(within(list).getByRole('checkbox', { name: 'Mais forte' }));
    expect(screen.queryByRole('table', { name: 'Parâmetros que diferem' })).toBeNull();

    // back into the form
    await user.click(within(list).getAllByRole('button', { name: 'Abrir parâmetros' })[1]!);
    expect(screen.getByRole('tab', { name: /Estimulador/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByLabelText('Amplitude')).toHaveValue('120');
  });

  it('the Compare step says how to start when nothing is saved', async () => {
    const api = fakeApi();
    const user = userEvent.setup();
    render(<App api={api} controller={new SimulationController(api)} />);
    await user.click(screen.getByRole('tab', { name: /Comparar/ }));
    expect(screen.getByRole('heading', { name: 'Comparar simulações' })).toBeInTheDocument();
    expect(screen.getAllByText(/Nenhuma simulação salva ainda/)).toHaveLength(1);
  });
});
