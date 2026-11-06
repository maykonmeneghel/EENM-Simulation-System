import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormValues } from '../application/formModel';
import { defaultFormValues } from '../application/formModel';
import type { InspectorTopic } from '../application/inspectorTopics';
import { changedStage } from '../application/physiologyStages';
import { driveActive } from '../application/formModel';
import { stagesFor } from '../domain/modelEquations';
import { buildModelSnapshot } from '../application/modelView';
import type { SimulationController } from '../application/simulationController';
import type { StageId } from '../domain/modelEquations';
import type { FieldError, ModelVariant, SimulationRequest, StimulationSite } from '../domain/simulation';
import type { ApiClient } from '../infrastructure/apiClient';
import { DiagramView } from './DiagramView';
import type { StageFocus } from './EquationsView';
import { EquationsView } from './EquationsView';
import { FatiguePanel } from './FatiguePanel';
import { InspectorPanel } from './InspectorPanel';
import { LiveCharts } from './LiveCharts';
import { SegmentedControl } from './SegmentedControl';
import { SIM_FORM_ID, SimulationForm } from './SimulationForm';
import { StimulatorScopes } from './StimulatorView';
import type { StepId } from './steps';
import { STEPS, stepOfField } from './steps';
import { isMacPlatform, matchShortcut, shortcutLabel } from './shortcuts';
import { ErrorBanner, ProgressBar, SummaryCard } from './StatusPanel';
import { useConditionCatalog } from './useConditionCatalog';
import { useMuscleCatalog } from './useMuscleCatalog';
import { ZoomBar } from './ZoomBar';
import { ZoomSync } from './zoomSync';
import { useSimulation } from './useSimulation';

const NO_ERRORS: readonly FieldError[] = [];

const STEP_OPTIONS = STEPS.map((s) => ({ value: s.id, label: s.label }));
const panelId = (s: StepId) => `panel-${s}`;
const tabId = (s: StepId) => `tab-${s}`;

/** SF Symbols' "sidebar.left" / "sidebar.right", drawn in SVG. */
function SidebarIcon({ side }: { side: 'left' | 'right' }) {
  const x = side === 'left' ? 7 : 13;
  const lines = side === 'left' ? 3.6 : 15.2;
  return (
    <svg viewBox="0 0 20 16" width="20" height="16" aria-hidden="true">
      <rect x="1.25" y="1.25" width="17.5" height="13.5" rx="3" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <path d={`M${x} 1.6v12.8`} stroke="currentColor" strokeWidth="1.3" />
      <path d={`M${lines} 4.6h1.6M${lines} 6.9h1.6M${lines} 9.2h1.6`} stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

export function App({ api, controller }: { api: ApiClient; controller: SimulationController }) {
  const state = useSimulation(controller);
  const catalog = useMuscleCatalog(api);
  const conditionCatalog = useConditionCatalog(api);
  const [values, setValues] = useState<FormValues>(() => defaultFormValues());
  const [step, setStep] = useState<StepId>('stimulator');
  const [focus, setFocus] = useState<StageFocus | null>(null);
  const [clientErrors, setClientErrors] = useState<readonly FieldError[]>(NO_ERRORS);
  const [navigatorOpen, setNavigatorOpen] = useState(true);
  // The inspector opens only when a component of the centre column is clicked.
  const [inspector, setInspector] = useState<{ open: boolean; topic: InspectorTopic | null }>({ open: false, topic: null });
  const running = state.status === 'running';
  // One time zoom for every chart; a new run shows the whole run again.
  const zoom = useMemo(() => new ZoomSync(), []);
  useEffect(() => zoom.reset(), [zoom, state.runId]);
  const serverErrors = state.error?.fieldErrors ?? NO_ERRORS;
  const stimulatorErrors = useMemo(() => [...clientErrors, ...serverErrors], [clientErrors, serverErrors]);

  // A rejected value is fixed where it is set: go to its step.
  const showErrors = useCallback((errors: readonly FieldError[]) => {
    const first = errors[0];
    if (first) setStep(stepOfField(first.field));
  }, []);
  const onClientErrors = useCallback(
    (errors: readonly FieldError[]) => {
      setClientErrors(errors);
      showErrors(errors);
    },
    [showErrors],
  );
  // Server field errors arrive with the session state: adjust the step while rendering (no effect needed).
  const [seenError, setSeenError] = useState(state.error);
  if (state.error !== seenError) {
    setSeenError(state.error);
    const first = state.error?.fieldErrors[0];
    if (first) setStep(stepOfField(first.field));
  }

  // In the physiology step, an edited setting brings its equation to the centre of the body and highlights it.
  const [seenValues, setSeenValues] = useState(values);
  if (values !== seenValues) {
    setSeenValues(values);
    const label = (id: string) =>
      conditionCatalog.conditions.flatMap((c) => c.adjustments).find((a) => a.id === id)?.label ?? id;
    const found = step === 'physiology' ? changedStage(seenValues, values, label) : null;
    if (found) {
      // a stage that the change removes (e.g. the drive switched off) points at the stage that takes its place
      const shown = stagesFor(values.modelVariant as ModelVariant, values.stimulationSite as StimulationSite, driveActive(values));
      const stage = shown.includes(found.stage)
        ? found.stage
        : (['2c', '2a', '2b'] as const).find((s) => shown.includes(s)) ?? shown[0]!;
      setFocus((f) => ({ stage, nonce: (f?.nonce ?? 0) + 1, takeFocus: false, change: found.change }));
    }
  }

  const snapshot = useMemo(
    () => buildModelSnapshot({ values, muscles: catalog.muscles, lastRequest: state.request, lastStarted: state.run }),
    [values, catalog.muscles, state.request, state.run],
  );

  // "Simular" (toolbar, ⌘↩ or the sidebar) goes straight to the results.
  const start = useCallback(
    (req: SimulationRequest) => {
      setStep('results');
      void controller.start(req);
    },
    [controller],
  );
  const stop = useCallback(() => controller.stop(), [controller]);
  const inspect = useCallback((topic: InspectorTopic) => setInspector({ open: true, topic }), []);
  const inspectStage = useCallback((stage: StageId) => inspect({ kind: 'stage', stage }), [inspect]);
  const showEquation = useCallback((stage: StageId) => {
    setStep('physiology');
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
        const next = STEPS[Number(action.slice(-1)) - 1];
        if (next) setStep(next.id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [controller, mac]);

  const current = STEPS.find((s) => s.id === step)!;
  const classes = ['window', navigatorOpen ? '' : 'window--no-navigator', inspector.open ? '' : 'window--no-inspector']
    .filter(Boolean)
    .join(' ');

  return (
    <div className={classes}>
      <header className="toolbar">
        <div className="toolbar-title">
          <button
            type="button"
            className="toolbar-icon"
            aria-pressed={navigatorOpen}
            aria-controls="navigator"
            aria-label={navigatorOpen ? 'Ocultar barra lateral' : 'Mostrar barra lateral'}
            title={navigatorOpen ? 'Ocultar barra lateral' : 'Mostrar barra lateral'}
            onClick={() => setNavigatorOpen((o) => !o)}
          >
            <SidebarIcon side="left" />
          </button>
          <h1>Simulador EENM</h1>
        </div>
        <div className="toolbar-center">
          <SegmentedControl<StepId>
            options={STEP_OPTIONS}
            value={step}
            onChange={setStep}
            label="Etapa"
            mode="tabs"
            panelId={panelId}
            tabId={tabId}
            titles={(s) => shortcutLabel(`view-${STEPS.findIndex((x) => x.id === s) + 1}` as 'view-1', mac)}
          />
        </div>
        <div className="toolbar-actions">
          {running ? (
            <span className="live-pill" role="status" title="Progresso">
              <span className="live-dot" aria-hidden="true" /> {Math.round(state.progress * 100)} %
            </span>
          ) : null}
          <button type="button" className="btn" onClick={stop} disabled={!running} title={`Parar (${shortcutLabel('stop', mac)})`}>
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
          <button
            type="button"
            className="toolbar-icon"
            aria-pressed={inspector.open}
            aria-controls="inspector"
            aria-label={inspector.open ? 'Ocultar explicação' : 'Mostrar explicação'}
            title={inspector.open ? 'Ocultar explicação' : 'Mostrar explicação'}
            onClick={() => setInspector((i) => ({ ...i, open: !i.open }))}
          >
            <SidebarIcon side="right" />
          </button>
        </div>
      </header>

      <aside id="navigator" className="navigator" aria-label={`Ajustes — ${current.label}`} inert={!navigatorOpen}>
        <header className="navigator-head">
          <span className="navigator-step">Etapa {current.number} de {STEPS.length}</span>
          <h2>{current.label}</h2>
        </header>
        {catalog.error ? <div className="banner banner--warn">{catalog.error}</div> : null}
        <SimulationForm
          step={step}
          onGoToStep={setStep}
          values={values}
          onValuesChange={setValues}
          muscles={catalog.muscles}
          serverErrors={serverErrors}
          running={running}
          onSubmit={start}
          autoUnitCounts={snapshot.units.source === 'started' ? snapshot.units.counts : null}
          conditions={conditionCatalog.conditions}
          conditionsError={conditionCatalog.error}
          onClientErrors={onClientErrors}
        />
      </aside>

      <main className="content">
        <section id={panelId(step)} role="tabpanel" aria-labelledby={tabId(step)} className="panel" tabIndex={-1}>
          {step === 'stimulator' ? (
            <StimulatorScopes values={values} errors={stimulatorErrors} onInspect={inspect} />
          ) : step === 'physiology' ? (
            <EquationsView snapshot={snapshot} focus={focus} onInspect={inspect} />
          ) : step === 'simulation' ? (
            <DiagramView snapshot={snapshot} running={running} onSelectStage={inspectStage} />
          ) : (
            <>
              <div className="card status-card">
                <ProgressBar state={state} />
              </div>
              <ErrorBanner error={state.error} />
              <SummaryCard state={state} />
              <ZoomBar zoom={zoom} durationMs={state.run?.durationMs ?? state.request?.stimulus.durationMs ?? null} />
              <LiveCharts state={state} buffer={controller.series} zoom={zoom} onInspect={inspect} />
              <FatiguePanel state={state} fatigue={controller.fatigue} series={controller.series} zoom={zoom} onInspect={inspect} />
            </>
          )}
        </section>
      </main>

      <aside id="inspector" className="explainer" aria-label="Explicação" inert={!inspector.open}>
        <InspectorPanel topic={inspector.topic} values={values} axonEvents={controller.axonEvents} onShowEquation={showEquation} />
      </aside>
    </div>
  );
}
