import { useCallback } from 'react';
import type { SimulationController } from '../application/simulationController';
import type { FieldError, SimulationRequest } from '../domain/simulation';
import type { ApiClient } from '../infrastructure/apiClient';
import { LiveCharts } from './LiveCharts';
import { SimulationForm } from './SimulationForm';
import { ErrorBanner, ProgressBar, SummaryCard } from './StatusPanel';
import { useMuscleCatalog } from './useMuscleCatalog';
import { useSimulation } from './useSimulation';

const NO_ERRORS: readonly FieldError[] = [];

export function App({ api, controller }: { api: ApiClient; controller: SimulationController }) {
  const state = useSimulation(controller);
  const catalog = useMuscleCatalog(api);
  const running = state.status === 'running';

  const start = useCallback((req: SimulationRequest) => void controller.start(req), [controller]);
  const stop = useCallback(() => controller.stop(), [controller]);

  return (
    <div className="layout">
      <header className="header">
        <h1>EENM — Simulador de pool de motoneurônios</h1>
        <p className="muted">
          Corrente aplicada diretamente aos motoneurônios → força muscular gerada, transmitida em tempo real.
        </p>
      </header>

      <aside className="sidebar">
        {catalog.error ? <div className="banner banner--warn">{catalog.error}</div> : null}
        <SimulationForm
          muscles={catalog.muscles}
          serverErrors={state.error?.fieldErrors ?? NO_ERRORS}
          running={running}
          onSubmit={start}
          onStop={stop}
        />
      </aside>

      <main className="main">
        <ProgressBar state={state} />
        <ErrorBanner error={state.error} />
        <SummaryCard state={state} />
        <LiveCharts state={state} buffer={controller.series} />
      </main>
    </div>
  );
}
