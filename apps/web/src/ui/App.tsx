import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react';
import type { FormValues } from '../application/formModel';
import { defaultFormValues, toFormValues } from '../application/formModel';
import { SavedSimulations } from '../application/savedSimulations';
import { MemorySavedSimulationStore } from '../infrastructure/savedSimulationStore';
import type { InspectorTopic } from '../application/inspectorTopics';
import { changedStage } from '../application/physiologyStages';
import { driveActive } from '../application/formModel';
import { stagesFor } from '../domain/modelEquations';
import { buildModelSnapshot } from '../application/modelView';
import type { SimulationController } from '../application/simulationController';
import type { StageId } from '../domain/modelEquations';
import type { FieldError, ModelVariant, SimulationRequest, StimulationSite } from '../domain/simulation';
import type { ApiClient } from '../infrastructure/apiClient';
import { CompareSidebar } from './CompareSidebar';
import { CompareView } from './CompareView';
import { DiagramView } from './DiagramView';
import { SaveRunCard } from './SaveRunCard';
import type { StageFocus } from './EquationsView';
import { EquationsView } from './EquationsView';
import { FatiguePanel } from './FatiguePanel';
import { InspectorPanel } from './InspectorPanel';
import { Footer } from './Footer';
import { HelpContext } from './helpContext';
import type { ShowHelp } from './helpContext';
import { LiveCharts } from './LiveCharts';
import { SegmentedControl } from './SegmentedControl';
import type { Locale } from '../i18n/locale';
import { APP_NAME, setLocale, tr } from '../i18n/locale';
import { useLocale } from '../i18n/useLocale';

const ThreeDView = lazy(() => import('./three/ThreeDView'));

const LANGUAGE_OPTIONS = [
  { value: 'pt-BR' as const, label: 'PT' },
  { value: 'en' as const, label: 'EN' },
];
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
import { useServerLimits } from './useServerLimits';
import type { Account } from './AuthGate';

const NO_ERRORS: readonly FieldError[] = [];

/** Read at render: the step labels follow the locale. */
const stepOptions = () => STEPS.map((s) => ({ value: s.id, label: s.label }));
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

export function App({
  api,
  controller,
  saved: savedProp,
  account,
}: {
  api: ApiClient;
  controller: SimulationController;
  /** Saved simulations (IndexedDB in the browser); in memory when not given. */
  saved?: SavedSimulations;
  /** The signed-in account (only with sign-in configured): shown in the toolbar with a sign-out button. */
  account?: Account;
}) {
  const [fallbackSaved] = useState(() => new SavedSimulations(new MemorySavedSimulationStore()));
  const saved = savedProp ?? fallbackSaved;
  useEffect(() => {
    void saved.load();
  }, [saved]);
  const locale = useLocale();
  useEffect(() => {
    document.title = tr(APP_NAME);
    document.documentElement.lang = locale;
  }, [locale]);
  const state = useSimulation(controller);
  const catalog = useMuscleCatalog(api);
  const conditionCatalog = useConditionCatalog(api);
  const limits = useServerLimits(api);
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
  // a saved simulation's settings go back into the form, to run it again or change one thing
  const openSaved = useCallback((request: SimulationRequest) => {
    setValues(toFormValues(request));
    setStep('stimulator');
  }, []);
  const muscleLabel = useCallback((id: string) => catalog.muscles.find((m) => m.id === id)?.label ?? id, [catalog.muscles]);
  const conditionLabel = useCallback(
    (id: string) => conditionCatalog.conditions.find((c) => c.id === id)?.label ?? id,
    [conditionCatalog.conditions],
  );
  const inspect = useCallback((topic: InspectorTopic) => setInspector({ open: true, topic }), []);
  const showHelp = useCallback<ShowHelp>((label, content) => inspect({ kind: 'help', label, content }), [inspect]);
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
  const navigatorLabel = navigatorOpen
    ? tr({ 'pt-BR': 'Ocultar barra lateral', en: 'Hide sidebar' })
    : tr({ 'pt-BR': 'Mostrar barra lateral', en: 'Show sidebar' });
  const inspectorLabel = inspector.open
    ? tr({ 'pt-BR': 'Ocultar explicação', en: 'Hide explanation' })
    : tr({ 'pt-BR': 'Mostrar explicação', en: 'Show explanation' });
  const stopText = tr({ 'pt-BR': 'Parar', en: 'Stop' });
  const simulateText = tr({ 'pt-BR': 'Simular', en: 'Simulate' });
  const classes = ['window', navigatorOpen ? '' : 'window--no-navigator', inspector.open ? '' : 'window--no-inspector']
    .filter(Boolean)
    .join(' ');

  return (
    <HelpContext.Provider value={showHelp}>
      <div className={classes}>
        <header className="toolbar">
          <div className="toolbar-title">
            <button
              type="button"
              className="toolbar-icon"
              aria-pressed={navigatorOpen}
              aria-controls="navigator"
              aria-label={navigatorLabel}
              title={navigatorLabel}
              onClick={() => setNavigatorOpen((o) => !o)}
            >
              <SidebarIcon side="left" />
            </button>
            <h1>{tr(APP_NAME)}</h1>
          </div>
          <div className="toolbar-center">
            <SegmentedControl<StepId>
              options={stepOptions()}
              value={step}
              onChange={setStep}
              label={tr({ 'pt-BR': 'Etapa', en: 'Step' })}
              mode="tabs"
              panelId={panelId}
              tabId={tabId}
              titles={(s) => shortcutLabel(`view-${STEPS.findIndex((x) => x.id === s) + 1}` as 'view-1', mac)}
            />
          </div>
          <div className="toolbar-actions">
            {running ? (
              <span className="live-pill" role="status" title={tr({ 'pt-BR': 'Progresso', en: 'Progress' })}>
                <span className="live-dot" aria-hidden="true" /> {Math.round(state.progress * 100)} %
              </span>
            ) : null}
            <button type="button" className="btn" onClick={stop} disabled={!running} title={`${stopText} (${shortcutLabel('stop', mac)})`}>
              {stopText}
            </button>
            <button
              type="submit"
              form={SIM_FORM_ID}
              className="btn btn--primary"
              disabled={running}
              title={`${simulateText} (${shortcutLabel('simulate', mac)})`}
            >
              {simulateText}
            </button>
            {account ? (
              <>
                <span className="toolbar-account" title={account.label}>
                  {account.label}
                </span>
                <button type="button" className="btn" onClick={account.signOut}>
                  {tr({ 'pt-BR': 'Sair', en: 'Sign out' })}
                </button>
              </>
            ) : null}
            <SegmentedControl<Locale>
              label={tr({ 'pt-BR': 'Idioma', en: 'Language' })}
              mode="radio"
              size="small"
              options={LANGUAGE_OPTIONS}
              titles={(l) => (l === 'en' ? 'English' : 'Português (Brasil)')}
              value={locale}
              onChange={setLocale}
            />
            <button
              type="button"
              className="toolbar-icon"
              aria-pressed={inspector.open}
              aria-controls="inspector"
              aria-label={inspectorLabel}
              title={inspectorLabel}
              onClick={() => setInspector((i) => ({ ...i, open: !i.open }))}
            >
              <SidebarIcon side="right" />
            </button>
          </div>
        </header>

        <aside id="navigator" className="navigator" aria-label={`${tr({ 'pt-BR': 'Ajustes', en: 'Settings' })} — ${current.label}`} inert={!navigatorOpen}>
          <header className="navigator-head">
            <span className="navigator-step">
              {tr({ 'pt-BR': `Etapa ${current.number} de ${STEPS.length}`, en: `Step ${current.number} of ${STEPS.length}` })}
            </span>
            <h2>{current.label}</h2>
          </header>
          {catalog.error ? <div className="banner banner--warn">{catalog.error}</div> : null}
          {step === 'compare' ? <CompareSidebar saved={saved} onOpen={openSaved} /> : null}
          {/* kept mounted on the Compare step (hidden): ⌘↩ and the toolbar's Simular submit it */}
          <div hidden={step === 'compare'}>
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
            limits={limits}
          />
          </div>
        </aside>

        <main className="content">
          <section id={panelId(step)} role="tabpanel" aria-labelledby={tabId(step)} className="panel" tabIndex={-1}>
            {step === 'stimulator' ? (
              <StimulatorScopes values={values} errors={stimulatorErrors} onInspect={inspect} />
            ) : step === 'physiology' ? (
              <EquationsView snapshot={snapshot} focus={focus} onInspect={inspect} />
            ) : step === 'simulation' ? (
              <DiagramView snapshot={snapshot} running={running} onSelectStage={inspectStage} />
            ) : step === 'anatomy' ? (
              <Suspense fallback={<div className="card three-empty">{tr({ 'pt-BR': 'Carregando a vista 3D…', en: 'Loading the 3D view…' })}</div>}>
                <ThreeDView
                  run={state.run}
                  running={running}
                  series={controller.series}
                  unitEvents={controller.unitEvents}
                  joint={controller.joint}
                  axonLengthPercent={state.request?.axonLengthPercent ?? Number(values.axonLengthPercent)}
                  muscleLabel={muscleLabel}
                  onUseMuscle={(id) => setValues((v) => ({ ...v, muscle: id }))}
                />
              </Suspense>
            ) : step === 'compare' ? (
              <CompareView saved={saved} muscleLabel={muscleLabel} />
            ) : (
              <>
                <div className="card status-card">
                  <ProgressBar state={state} />
                </div>
                <ErrorBanner error={state.error} />
                <SummaryCard state={state} />
                <SaveRunCard
                  state={state}
                  controller={controller}
                  saved={saved}
                  labels={{ muscle: muscleLabel, condition: conditionLabel }}
                  onCompare={() => setStep('compare')}
                />
                <ZoomBar zoom={zoom} durationMs={state.run?.durationMs ?? state.request?.stimulus.durationMs ?? null} />
                <LiveCharts state={state} buffer={controller.series} zoom={zoom} onInspect={inspect} />
                <FatiguePanel state={state} fatigue={controller.fatigue} series={controller.series} zoom={zoom} onInspect={inspect} />
              </>
            )}
          </section>
        </main>

        <aside id="inspector" className="explainer" aria-label={tr({ 'pt-BR': 'Explicação', en: 'Explanation' })} inert={!inspector.open}>
          <InspectorPanel topic={inspector.topic} values={values} axonEvents={controller.axonEvents} onShowEquation={showEquation} />
        </aside>
        <Footer />
      </div>
    </HelpContext.Provider>
  );
}
