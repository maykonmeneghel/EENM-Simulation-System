import { maxForceOf, toPercent } from '../application/forcePercent';
import type { SessionError, SessionState } from '../application/session';
import type { Localized } from '../i18n/locale';
import { fmtNumber, tr } from '../i18n/locale';

const STATUS_LABEL: Record<SessionState['status'], Localized> = {
  idle: { 'pt-BR': 'Aguardando', en: 'Waiting' },
  running: { 'pt-BR': 'Simulando…', en: 'Simulating…' },
  completed: { 'pt-BR': 'Concluída', en: 'Completed' },
  failed: { 'pt-BR': 'Falhou', en: 'Failed' },
  aborted: { 'pt-BR': 'Interrompida', en: 'Stopped' },
};

export function ProgressBar({ state }: { state: SessionState }) {
  const pct = Math.round(state.progress * 100);
  return (
    <div className="progress" data-status={state.status}>
      <div className="progress-label">
        <span>{tr(STATUS_LABEL[state.status])}</span>
        <span>{state.status === 'idle' ? '' : `${pct}%`}</span>
      </div>
      <div
        className="progress-track"
        role="progressbar"
        aria-label={tr({ 'pt-BR': 'Progresso da simulação', en: 'Simulation progress' })}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
      >
        <div className="progress-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function ErrorBanner({ error }: { error: SessionError | null }) {
  if (!error) return null;
  const title =
    error.kind === 'validation'
      ? tr({ 'pt-BR': 'Parâmetros rejeitados pela API', en: 'Parameters rejected by the API' })
      : error.kind === 'stream'
        ? tr({ 'pt-BR': 'Erro durante a simulação', en: 'Error during the simulation' })
        : tr({ 'pt-BR': 'Erro', en: 'Error' });
  return (
    <div className="banner banner--error" role="alert">
      <strong>{title}</strong>
      {error.status ? <span className="tag">HTTP {error.status}</span> : null}
      {error.code ? <span className="tag">{error.code}</span> : null}
      <div>{error.message}</div>
      {error.kind === 'validation' ? <div className="muted">{tr({ 'pt-BR': 'Veja os campos destacados no formulário.', en: 'See the highlighted fields in the form.' })}</div> : null}
    </div>
  );
}

const fmt = (x: number, digits = 3) =>
  Number.isFinite(x) ? fmtNumber(x, { maximumFractionDigits: digits }) : '—';

export function SummaryCard({ state }: { state: SessionState }) {
  const run = state.run;
  const result = state.result;
  if (!run && !result) return null;
  const max = maxForceOf(run?.maxForce);
  const force = (x: number) => (max ? `${fmt(toPercent(x, max), 1)} %` : fmt(x));
  const forceTitle = max
    ? tr({
        'pt-BR': 'da força máxima do músculo saudável (tétano a 100 Hz, todas as unidades)',
        en: 'of the maximum force of the healthy muscle (100 Hz tetanus, every unit)',
      })
    : tr({ 'pt-BR': 'unidades do modelo', en: 'model units' });
  return (
    <section className="summary" aria-label={tr({ 'pt-BR': 'Resumo', en: 'Summary' })}>
      {result ? (
        <>
          <div className="stat">
            <span className="stat-label" title={forceTitle}>
              {tr({ 'pt-BR': 'Força de pico', en: 'Peak force' })}
            </span>
            <span className="stat-value">{force(result.summary.peakForce)}</span>
          </div>
          <div className="stat">
            <span className="stat-label" title={forceTitle}>
              {tr({ 'pt-BR': 'Força média', en: 'Mean force' })}
            </span>
            <span className="stat-value">{force(result.summary.meanForce)}</span>
          </div>
          <div className="stat">
            <span className="stat-label">{tr({ 'pt-BR': 'Tempo até o pico', en: 'Time to peak' })}</span>
            <span className="stat-value">{fmt(result.summary.timeToPeakMs, 1)} ms</span>
          </div>
          <div className="stat">
            <span className="stat-label">{tr({ 'pt-BR': 'Tempo de cálculo', en: 'Computing time' })}</span>
            <span className="stat-value">{fmt(result.elapsedSeconds, 1)} s</span>
          </div>
        </>
      ) : null}
      {run ? (
        <div className="run-meta muted">
          {run.muscle} · S {run.motorUnits.S} / FR {run.motorUnits.FR} / FF {run.motorUnits.FF} ·{' '}
          {fmt(run.durationMs, 0)} ms @ {fmt(run.outputStepMs)} ms · {fmtNumber(state.samples)} {tr({ 'pt-BR': 'amostras', en: 'samples' })} ·{' '}
          <code title="simulationId">{run.simulationId}</code>
        </div>
      ) : null}
    </section>
  );
}
