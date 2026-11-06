import { maxForceOf, toPercent } from '../application/forcePercent';
import type { SessionError, SessionState } from '../application/session';

const STATUS_LABEL: Record<SessionState['status'], string> = {
  idle: 'Aguardando',
  running: 'Simulando…',
  completed: 'Concluída',
  failed: 'Falhou',
  aborted: 'Interrompida',
};

export function ProgressBar({ state }: { state: SessionState }) {
  const pct = Math.round(state.progress * 100);
  return (
    <div className="progress" data-status={state.status}>
      <div className="progress-label">
        <span>{STATUS_LABEL[state.status]}</span>
        <span>{state.status === 'idle' ? '' : `${pct}%`}</span>
      </div>
      <div
        className="progress-track"
        role="progressbar"
        aria-label="Progresso da simulação"
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
      ? 'Parâmetros rejeitados pela API'
      : error.kind === 'stream'
        ? 'Erro durante a simulação'
        : 'Erro';
  return (
    <div className="banner banner--error" role="alert">
      <strong>{title}</strong>
      {error.status ? <span className="tag">HTTP {error.status}</span> : null}
      {error.code ? <span className="tag">{error.code}</span> : null}
      <div>{error.message}</div>
      {error.kind === 'validation' ? <div className="muted">Veja os campos destacados no formulário.</div> : null}
    </div>
  );
}

const fmt = (x: number, digits = 3) =>
  Number.isFinite(x) ? x.toLocaleString('pt-BR', { maximumFractionDigits: digits }) : '—';

export function SummaryCard({ state }: { state: SessionState }) {
  const run = state.run;
  const result = state.result;
  if (!run && !result) return null;
  const max = maxForceOf(run?.maxForce);
  const force = (x: number) => (max ? `${fmt(toPercent(x, max), 1)} %` : fmt(x));
  const forceTitle = max ? 'da força máxima do músculo saudável (tétano a 100 Hz, todas as unidades)' : 'unidades do modelo';
  return (
    <section className="summary" aria-label="Resumo">
      {result ? (
        <>
          <div className="stat">
            <span className="stat-label" title={forceTitle}>
              Força de pico
            </span>
            <span className="stat-value">{force(result.summary.peakForce)}</span>
          </div>
          <div className="stat">
            <span className="stat-label" title={forceTitle}>
              Força média
            </span>
            <span className="stat-value">{force(result.summary.meanForce)}</span>
          </div>
          <div className="stat">
            <span className="stat-label">Tempo até o pico</span>
            <span className="stat-value">{fmt(result.summary.timeToPeakMs, 1)} ms</span>
          </div>
          <div className="stat">
            <span className="stat-label">Tempo de cálculo</span>
            <span className="stat-value">{fmt(result.elapsedSeconds, 1)} s</span>
          </div>
        </>
      ) : null}
      {run ? (
        <div className="run-meta muted">
          {run.muscle} · S {run.motorUnits.S} / FR {run.motorUnits.FR} / FF {run.motorUnits.FF} ·{' '}
          {fmt(run.durationMs, 0)} ms @ {fmt(run.outputStepMs)} ms · {state.samples.toLocaleString('pt-BR')} amostras ·{' '}
          <code title="simulationId">{run.simulationId}</code>
        </div>
      ) : null}
    </section>
  );
}
