import { useMemo } from 'react';
import type { FatigueBuffer } from '../application/fatigue';
import { SHIELDS_PROTOCOL, SHIELDS_REFERENCE, trainPeaks } from '../application/fatigue';
import type { SeriesBuffer } from '../application/seriesBuffer';
import type { InspectorTopic } from '../application/inspectorTopics';
import type { SessionState } from '../application/session';
import { HelpButton } from './HelpButton';
import { useSvgScale } from './useSvgScale';
import type { LiveSeriesSpec } from './LiveChart';
import { InfoIcon } from './InfoIcon';
import { LiveChart } from './LiveChart';
import { CHART_THEMES, useColorScheme } from './theme';
import type { ZoomSync } from './zoomSync';
import { fmtNumber, tr } from '../i18n/locale';

const capacity = (): LiveSeriesSpec[] => [
  { key: 'muscle', label: tr({ 'pt-BR': 'Músculo', en: 'Muscle' }), color: 'blue', width: 2.5 },
  { key: 'S', label: 'S', color: 'orange' },
  { key: 'FR', label: 'FR', color: 'aqua' },
  { key: 'FF', label: 'FF', color: 'yellow' },
];

const pct = (x: number) => `${fmtNumber(x * 100, { maximumFractionDigits: 1 })} %`;
const num = (x: number, d = 2) => fmtNumber(x, { minimumFractionDigits: d, maximumFractionDigits: d });

const W = 640;
const H = 170;
const PAD = { l: 36, r: 10, t: 10, b: 24 };

/** Peak of each train ÷ the first train's peak, on a fixed 0–1 scale, with the published reference band. */
function TrainBars({ ratios, reference, chronic }: { ratios: number[]; reference: boolean; chronic: boolean }) {
  const [measureSvg, svgScale] = useSvgScale(W);
  const n = ratios.length;
  const bw = (W - PAD.l - PAD.r) / Math.max(n, 1);
  const y = (v: number) => H - PAD.b - Math.min(1.05, Math.max(0, v)) * ((H - PAD.t - PAD.b) / 1.05);
  const band = chronic ? SHIELDS_REFERENCE.chronic : SHIELDS_REFERENCE.acute;
  return (
    <svg ref={measureSvg} style={svgScale} className="fatigue-bars" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={tr({ 'pt-BR': `Pico de cada trem relativo ao primeiro, ${n} trens`, en: `Peak of each train relative to the first, ${n} trains` })}>
      {reference ? (
        <rect
          className="fatigue-ref"
          x={PAD.l}
          width={W - PAD.l - PAD.r}
          y={y(band.mean + band.sd)}
          height={y(band.mean - band.sd) - y(band.mean + band.sd)}
        >
          <title>
            {`Chang & Shields 2011: ${num(band.mean)} ± ${num(band.sd)} (${tr({
              'pt-BR': `sóleo, lesão ${chronic ? 'crônica' : 'aguda'}`,
              en: `soleus, ${chronic ? 'chronic' : 'acute'} injury`,
            })})`}
          </title>
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
        {tr({ 'pt-BR': '1º trem', en: '1st train' })}
      </text>
      <text x={W - PAD.r} y={H - 6} textAnchor="end" className="fatigue-axis">
        {n > 0 ? tr({ 'pt-BR': `${n}º trem`, en: `train ${n}` }) : ''}
      </text>
    </svg>
  );
}

export function FatiguePanel({
  state,
  fatigue,
  series,
  zoom,
  onInspect,
}: {
  state: SessionState;
  fatigue: FatigueBuffer;
  series: SeriesBuffer;
  zoom: ZoomSync;
  onInspect?(topic: InspectorTopic): void;
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
  const chronic = request.condition === 'SCI_CHRONIC';
  const lastCapacity = fv.muscle.length ? fv.muscle[fv.muscle.length - 1]! : null;
  const last = peaks.at(-1);
  const shields =
    trains !== null &&
    stimulus!.frequencyHz === SHIELDS_PROTOCOL.frequencyHz &&
    trains.trainOnMs === SHIELDS_PROTOCOL.trainOnMs &&
    trains.trainPeriodMs === SHIELDS_PROTOCOL.trainPeriodMs;

  const fatigueWord = tr({ 'pt-BR': 'Fadiga', en: 'Fatigue' });
  return (
    <section className="card fatigue" aria-label={fatigueWord}>
      <header className="fatigue-head">
        {onInspect ? (
          <h2>
            <button type="button" className="caption-button" onClick={() => onInspect({ kind: 'fatigue' })} aria-label={`${fatigueWord} — ${tr({ 'pt-BR': 'ver explicação', en: 'see explanation' })}`}>
              <span>{fatigueWord}</span>
              <InfoIcon />
            </button>
          </h2>
        ) : (
          <h2>{fatigueWord}</h2>
        )}
        <HelpButton label={tr({ 'pt-BR': 'Sobre a fadiga', en: 'About fatigue' })}>
          {tr({
            'pt-BR':
              'Fadiga periférica de Potvin & Fuglevand 2017: cada disparo consome capacidade de força da unidade, mais nas unidades rápidas (FF) que nas lentas (S), e o abalo fica mais lento. Não há recuperação no modelo. O índice de fadiga é o pico de força do último trem dividido pelo do primeiro, como na clínica (Chang & Shields 2011).',
            en: 'Peripheral fatigue of Potvin & Fuglevand 2017: each spike uses up force capacity of the unit, more in fast (FF) than in slow (S) units, and the twitch slows down. There is no recovery in the model. The fatigue index is the force peak of the last train divided by that of the first, as in the clinic (Chang & Shields 2011).',
          })}
        </HelpButton>
      </header>

      <div className="fatigue-stats">
        <div className="stat">
          <span className="stat-label">{tr({ 'pt-BR': 'Capacidade restante do músculo', en: 'Remaining muscle capacity' })}</span>
          <span className="stat-value">{lastCapacity === null ? '—' : pct(lastCapacity)}</span>
        </div>
        <div className="stat">
          <span className="stat-label">{tr({ 'pt-BR': 'Índice de fadiga (último trem ÷ 1º)', en: 'Fatigue index (last train ÷ 1st)' })}</span>
          <span className="stat-value">{last && Number.isFinite(last.ratio) ? num(last.ratio) : '—'}</span>
          <small className="dial-hint">{trains
              ? tr({ 'pt-BR': `${peaks.length} trens completos`, en: `${peaks.length} complete trains` })
              : tr({ 'pt-BR': 'ative os trens no Estimulador', en: 'turn the trains on in the Stimulator' })}</small>
        </div>
        <div className="stat">
          <span className="stat-label">{tr({ 'pt-BR': 'Referência publicada', en: 'Published reference' })}</span>
          {shields ? (
            <span className="fatigue-ref-text">
              {tr({ 'pt-BR': 'Sóleo, 20 Hz, 330 / 670 ms, 120 trens:', en: 'Soleus, 20 Hz, 330 / 670 ms, 120 trains:' })}{' '}
              <strong>{tr({ 'pt-BR': '0,89 ± 0,08', en: '0.89 ± 0.08' })}</strong>{' '}
              {tr({ 'pt-BR': '(lesão aguda) e 0,19 ± 0,06 (crônica) —', en: '(acute injury) and 0.19 ± 0.06 (chronic) —' })} Chang &
              Shields 2011
            </span>
          ) : (
            <span className="fatigue-ref-text muted">
              {tr({
                'pt-BR': 'Comparável só no protocolo de Shields: 20 Hz, trens de 330 ms a cada 1000 ms, 120 trens (duração 120 000 ms).',
                en: "Comparable only under Shields's protocol: 20 Hz, 330 ms trains every 1000 ms, 120 trains (duration 120 000 ms).",
              })}
            </span>
          )}
        </div>
      </div>

      <LiveChart
        title={tr({ 'pt-BR': 'Capacidade de força restante (1 = descansado)', en: 'Remaining force capacity (1 = rested)' })}
        yLabel={tr({ 'pt-BR': 'capacidade', en: 'capacity' })}
        series={capacity()}
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
          <figcaption>
            {tr({ 'pt-BR': 'Pico de cada trem ÷ pico do 1º trem', en: 'Peak of each train ÷ peak of the 1st train' })}
            {shields
              ? tr({
                  'pt-BR': ` — faixa: referência ${chronic ? '0,19 ± 0,06 (lesão crônica)' : '0,89 ± 0,08 (lesão aguda)'}`,
                  en: ` — band: reference ${chronic ? '0.19 ± 0.06 (chronic injury)' : '0.89 ± 0.08 (acute injury)'}`,
                })
              : ''}
          </figcaption>
          <TrainBars ratios={peaks.map((p) => p.ratio)} reference={shields} chronic={chronic} />
        </figure>
      ) : null}
    </section>
  );
}
