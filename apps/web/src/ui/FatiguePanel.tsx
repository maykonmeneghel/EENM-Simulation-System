import { useMemo } from 'react';
import type { FatigueBuffer } from '../application/fatigue';
import { SHIELDS_PROTOCOL, SHIELDS_REFERENCE, trainPeaks } from '../application/fatigue';
import type { SeriesBuffer } from '../application/seriesBuffer';
import type { InspectorTopic } from '../application/inspectorTopics';
import type { SessionState } from '../application/session';
import { HelpButton } from './HelpButton';
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

/** Peak of each complete train ÷ the first train's peak, one bar per train at its time, sharing the run's zoom. */
function trainBarsSource(peaks: readonly { startMs: number; ratio: number }[], onMs: number) {
  const timeMs = Float64Array.from(peaks, (p) => p.startMs + onMs / 2);
  const ratio = Float64Array.from(peaks, (p) => p.ratio);
  return { view: () => ({ timeMs, ratio }) };
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

  const onMs = trains?.trainOnMs ?? 0;
  const barsSource = useMemo(() => trainBarsSource(peaks, onMs), [peaks, onMs]);

  if (!request || request.modelVariant !== 'LITERATURE' || state.status === 'idle') return null;

  const fv = fatigue.view();
  const chronic = request.condition === 'SCI_CHRONIC';
  const band = chronic ? SHIELDS_REFERENCE.chronic : SHIELDS_REFERENCE.acute;
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
        <LiveChart
          title={
            tr({ 'pt-BR': 'Pico de cada trem ÷ pico do 1º trem', en: 'Peak of each train ÷ peak of the 1st train' }) +
            (shields
              ? tr({
                  'pt-BR': ` — faixa: referência ${chronic ? '0,19 ± 0,06 (lesão crônica)' : '0,89 ± 0,08 (lesão aguda)'}`,
                  en: ` — band: reference ${chronic ? '0.19 ± 0.06 (chronic injury)' : '0.89 ± 0.08 (acute injury)'}`,
                })
              : '')
          }
          yLabel={tr({ 'pt-BR': 'pico ÷ pico do 1º trem', en: 'peak ÷ 1st train peak' })}
          series={[{ key: 'ratio', label: tr({ 'pt-BR': 'Pico relativo', en: 'Relative peak' }), color: 'blue' }]}
          bars={trains.trainOnMs! / trains.trainPeriodMs!} // each bar spans its train's on time
          height={200}
          theme={theme}
          buffer={barsSource}
          samples={peaks.length}
          runId={state.runId}
          xMaxMs={state.run?.durationMs ?? null}
          yRange={[0, 1.05]}
          zoom={zoom}
          {...(shields ? { band: { lo: band.mean - band.sd, hi: band.mean + band.sd } } : {})}
        />
      ) : null}
    </section>
  );
}
