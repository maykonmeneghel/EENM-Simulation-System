import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormValues } from '../application/formModel';
import { defaultFormValues } from '../application/formModel';
import { buildModelSnapshot } from '../application/modelView';
import type { SimulationController } from '../application/simulationController';
import type { StageId } from '../domain/modelEquations';
import type { FieldError, SimulationRequest } from '../domain/simulation';
import type { ApiClient } from '../infrastructure/apiClient';
import { DiagramView } from './DiagramView';
import type { StageFocus } from './EquationsView';
import { EquationsView } from './EquationsView';
import { FatiguePanel } from './FatiguePanel';
import { LiveCharts } from './LiveCharts';
import { SegmentedControl } from './SegmentedControl';
import { STIMULATOR_PATHS } from '../application/stimulatorForm';
import { SIM_FORM_ID, SimulationForm } from './SimulationForm';
import { StimulatorView } from './StimulatorView';
import { isMacPlatform, matchShortcut, shortcutLabel } from './shortcuts';
import { ErrorBanner, ProgressBar, SummaryCard } from './StatusPanel';
import { useConditionCatalog } from './useConditionCatalog';
import { useMuscleCatalog } from './useMuscleCatalog';
import { ZoomBar } from './ZoomBar';
import { ZoomSync } from './zoomSync';
import { useSimulation } from './useSimulation';

const NO_ERRORS: readonly FieldError[] = [];

export type MainView = 'simulation' | 'stimulator' | 'equations' | 'diagram';
const VIEWS = [
  { value: 'simulation', label: 'Simulação' },
  { value: 'stimulator', label: 'Estimulador' },
  { value: 'equations', label: 'Equações' },
  { value: 'diagram', label: 'Diagrama' },
] as const satisfies readonly { value: MainView; label: string }[];

const VIEW_ORDER: readonly MainView[] = ['simulation', 'stimulator', 'equations', 'diagram'];
const panelId = (v: MainView) => `panel-${v}`;
const tabId = (v: MainView) => `tab-${v}`;

export function App({ api, controller }: { api: ApiClient; controller: SimulationController }) {
  const state = useSimulation(controller);
  const catalog = useMuscleCatalog(api);
  const conditionCatalog = useConditionCatalog(api);
  const [values, setValues] = useState<FormValues>(() => defaultFormValues());
  const [view, setView] = useState<MainView>('simulation');
  const [focus, setFocus] = useState<StageFocus | null>(null);
  const [clientErrors, setClientErrors] = useState<readonly FieldError[]>(NO_ERRORS);
  const running = state.status === 'running';
  // One time zoom for every chart; a new run shows the whole run again.
  const zoom = useMemo(() => new ZoomSync(), []);
  useEffect(() => zoom.reset(), [zoom, state.runId]);
  const serverErrors = state.error?.fieldErrors ?? NO_ERRORS;
  const stimulatorErrors = useMemo(() => [...clientErrors, ...serverErrors], [clientErrors, serverErrors]);
  const onClientErrors = useCallback((errors: readonly FieldError[]) => {
    setClientErrors(errors);
    // A rejected stimulus is fixed where it is set.
    if (errors.some((e) => (STIMULATOR_PATHS as readonly string[]).includes(e.field))) setView('stimulator');
  }, []);

  const snapshot = useMemo(
    () => buildModelSnapshot({ values, muscles: catalog.muscles, lastRequest: state.request, lastStarted: state.run }),
    [values, catalog.muscles, state.request, state.run],
  );

  const start = useCallback((req: SimulationRequest) => void controller.start(req), [controller]);
  const stop = useCallback(() => controller.stop(), [controller]);
  const openStage = useCallback((stage: StageId) => {
    setView('equations');
    setFocus((f) => ({ stage, nonce: (f?.nonce ?? 0) + 1 }));
  }, []);

  const mac = useMemo(() => isMacPlatform(), []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const action = matchShortcut(e, mac);
      if (!action) return;
      e.preventDefault();
      if (action === 'simulate') {
        (document.getElementById(SIM_FORM_ID) as HTMLFormElement | null)?.requestSubmit();
      } else if (action === 'stop') {
        controller.stop();
      } else {
        const next = VIEW_ORDER[Number(action.slice(-1)) - 1];
        if (next) setView(next);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [controller, mac]);

  return (
    <div className="window">
      <header className="toolbar">
        <div className="toolbar-title">
          <h1>Simulador EENM</h1>
          <span className="toolbar-subtitle">Estímulo nos axônios motores → força muscular</span>
        </div>
        <div className="toolbar-center">
          <SegmentedControl<MainView>
            options={VIEWS}
            value={view}
            onChange={setView}
            label="Vista"
            mode="tabs"
            panelId={panelId}
            tabId={tabId}
            titles={(v) => shortcutLabel(`view-${VIEW_ORDER.indexOf(v) + 1}` as 'view-1', mac)}
          />
        </div>
        <div className="toolbar-actions">
          {running ? (
            <span className="live-pill" role="status" title="Progresso">
              <span className="live-dot" aria-hidden="true" /> {Math.round(state.progress * 100)} %
            </span>
          ) : null}
          <button
            type="button"
            className="btn"
            onClick={stop}
            disabled={!running}
            title={`Parar (${shortcutLabel('stop', mac)})`}
          >
            Parar
          </button>
          <button
            type="submit"
            form={SIM_FORM_ID}
            className="btn btn--primary"
            disabled={running}
            title={`Simular (${shortcutLabel('simulate', mac)})`}
          >
            Simular
          </button>
        </div>
      </header>

      <aside className="inspector" aria-label="Parâmetros">
        {catalog.error ? <div className="banner banner--warn">{catalog.error}</div> : null}
        <SimulationForm
          values={values}
          onValuesChange={setValues}
          muscles={catalog.muscles}
          serverErrors={serverErrors}
          running={running}
          onSubmit={start}
          autoUnitCounts={snapshot.units.source === 'started' ? snapshot.units.counts : null}
          onOpenStimulator={() => setView('stimulator')}
          conditions={conditionCatalog.conditions}
          conditionsError={conditionCatalog.error}
          onClientErrors={onClientErrors}
        />
      </aside>

      <main className="content">
        <section id={panelId(view)} role="tabpanel" aria-labelledby={tabId(view)} className="panel" tabIndex={-1}>
          {view === 'simulation' ? (
            <>
              <div className="card status-card">
                <ProgressBar state={state} />
              </div>
              <ErrorBanner error={state.error} />
              <SummaryCard state={state} />
              <ZoomBar zoom={zoom} durationMs={state.run?.durationMs ?? state.request?.stimulus.durationMs ?? null} />
              <LiveCharts state={state} buffer={controller.series} zoom={zoom} />
              <FatiguePanel state={state} fatigue={controller.fatigue} series={controller.series} zoom={zoom} />
            </>
          ) : view === 'stimulator' ? (
            <StimulatorView values={values} onValuesChange={setValues} errors={stimulatorErrors} running={running} />
          ) : view === 'equations' ? (
            <EquationsView snapshot={snapshot} focus={focus} />
          ) : (
            <DiagramView snapshot={snapshot} running={running} onSelectStage={openStage} />
          )}
        </section>
      </main>
    </div>
  );
}
