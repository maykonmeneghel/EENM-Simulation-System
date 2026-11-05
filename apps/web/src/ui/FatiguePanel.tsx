import { useMemo } from 'react';
import type { FatigueBuffer } from '../application/fatigue';
import { SHIELDS_PROTOCOL, SHIELDS_REFERENCE, trainPeaks } from '../application/fatigue';
import type { SeriesBuffer } from '../application/seriesBuffer';
import type { SessionState } from '../application/session';
import { HelpPopover } from './HelpPopover';
import { useSvgScale } from './useSvgScale';
import type { LiveSeriesSpec } from './LiveChart';
import { LiveChart } from './LiveChart';
import { CHART_THEMES, useColorScheme } from './theme';
import type { ZoomSync } from './zoomSync';

const CAPACITY: LiveSeriesSpec[] = [
  { key: 'muscle', label: 'Músculo', color: 'blue', width: 2.5 },
  { key: 'S', label: 'S', color: 'orange' },
  { key: 'FR', label: 'FR', color: 'aqua' },
  { key: 'FF', label: 'FF', color: 'yellow' },
];

const pct = (x: number) => `${(x * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} %`;
const num = (x: number, d = 2) => x.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });

const W = 640;
const H = 170;
const PAD = { l: 36, r: 10, t: 10, b: 24 };

/** Peak of each train ÷ the first train's peak, on a fixed 0–1 scale, with the published reference band. */
function TrainBars({ ratios, reference }: { ratios: number[]; reference: boolean }) {
  const [measureSvg, svgScale] = useSvgScale(W);
  const n = ratios.length;
  const bw = (W - PAD.l - PAD.r) / Math.max(n, 1);
  const y = (v: number) => H - PAD.b - Math.min(1.05, Math.max(0, v)) * ((H - PAD.t - PAD.b) / 1.05);
  const acute = SHIELDS_REFERENCE.acute;
  return (
    <svg ref={measureSvg} style={svgScale} className="fatigue-bars" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Pico de cada trem relativo ao primeiro, ${n} trens`}>
      {reference ? (
        <rect
          className="fatigue-ref"
          x={PAD.l}
          width={W - PAD.l - PAD.r}
          y={y(acute.mean + acute.sd)}
          height={y(acute.mean - acute.sd) - y(acute.mean + acute.sd)}
        >
          <title>Chang & Shields 2011: 0,89 ± 0,08 (sóleo, lesão aguda)</title>
        </rect>
      ) : null}
      {[0, 0.25, 0.5, 0.75, 1].map((v) => (
        <g key={v} className="fatigue-grid">
          <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} />
          <text x={PAD.l - 4} y={y(v) + 3} textAnchor="end">
            {num(v)}
          </text>
        </g>
      ))}
      {ratios.map((r, i) => (
        <rect key={i} className="fatigue-bar" x={PAD.l + i * bw + bw * 0.1} width={Math.max(0.5, bw * 0.8)} y={y(r)} height={y(0) - y(r)} />
      ))}
      <text x={PAD.l} y={H - 6} className="fatigue-axis">
        1º trem
      </text>
      <text x={W - PAD.r} y={H - 6} textAnchor="end" className="fatigue-axis">
        {n > 0 ? `${n}º trem` : ''}
      </text>
    </svg>
  );
}

export function FatiguePanel({
  state,
  fatigue,
  series,
  zoom,
}: {
  state: SessionState;
  fatigue: FatigueBuffer;
  series: SeriesBuffer;
  zoom: ZoomSync;
}) {
  const theme = CHART_THEMES[useColorScheme()];
  const request = state.request;
  const stimulus = request?.stimulus;
  const trains = stimulus && stimulus.trainOnMs !== null && stimulus.trainPeriodMs !== null ? stimulus : null;

  // Recomputed per chunk: cheap (one pass over the force series).
  const peaks = useMemo(() => {
    if (!trains) return [];
    const v = series.view();
    return trainPeaks(v.timeMs, v.total, trains.trainOnMs!, trains.trainPeriodMs!);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trains, series, state.samples]);

  if (!request || request.modelVariant !== 'LITERATURE' || state.status === 'idle') return null;

  const fv = fatigue.view();
  const lastCapacity = fv.muscle.length ? fv.muscle[fv.muscle.length - 1]! : null;
  const last = peaks.at(-1);
  const shields =
    trains !== null &&
    stimulus!.frequencyHz === SHIELDS_PROTOCOL.frequencyHz &&
    trains.trainOnMs === SHIELDS_PROTOCOL.trainOnMs &&
    trains.trainPeriodMs === SHIELDS_PROTOCOL.trainPeriodMs;

  return (
    <section className="card fatigue" aria-label="Fadiga">
      <header className="fatigue-head">
        <h2>Fadiga</h2>
        <HelpPopover label="Sobre a fadiga">
          Fadiga periférica de Potvin & Fuglevand 2017: cada disparo consome capacidade de força da unidade, mais nas
          unidades rápidas (FF) que nas lentas (S), e o abalo fica mais lento. Não há recuperação no modelo. O índice de
          fadiga é o pico de força do último trem dividido pelo do primeiro, como na clínica (Chang & Shields 2011).
        </HelpPopover>
      </header>

      <div className="fatigue-stats">
        <div className="stat">
          <span className="stat-label">Capacidade restante do músculo</span>
          <span className="stat-value">{lastCapacity === null ? '—' : pct(lastCapacity)}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Índice de fadiga (último trem ÷ 1º)</span>
          <span className="stat-value">{last && Number.isFinite(last.ratio) ? num(last.ratio) : '—'}</span>
          <small className="dial-hint">{trains ? `${peaks.length} trens completos` : 'ative os trens no Estimulador'}</small>
        </div>
        <div className="stat">
          <span className="stat-label">Referência publicada</span>
          {shields ? (
            <span className="fatigue-ref-text">
              Sóleo, 20 Hz, 330 / 670 ms, 120 trens: <strong>0,89 ± 0,08</strong> (lesão aguda) e 0,19 ± 0,06 (crônica) —
              Chang & Shields 2011
            </span>
          ) : (
            <span className="fatigue-ref-text muted">
              Comparável só no protocolo de Shields: 20 Hz, trens de 330 ms a cada 1000 ms, 120 trens (duração 120 000 ms).
            </span>
          )}
        </div>
      </div>

      <LiveChart
        title="Capacidade de força restante (1 = descansado)"
        yLabel="capacidade"
        series={CAPACITY}
        height={220}
        theme={theme}
        buffer={fatigue}
        samples={state.samples}
        runId={state.runId}
        xMaxMs={state.run?.durationMs ?? null}
        yRange={[0, 1.05]}
        zoom={zoom}
      />

      {trains ? (
        <figure className="chart">
          <figcaption>Pico de cada trem ÷ pico do 1º trem{shields ? ' — faixa: referência 0,89 ± 0,08' : ''}</figcaption>
          <TrainBars ratios={peaks.map((p) => p.ratio)} reference={shields} />
        </figure>
      ) : null}
    </section>
  );
}
