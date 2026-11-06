import { useMemo, useState } from 'react';
import type { CompareMeasure } from '../application/comparison';
import { commonGrid, compareSource, comparisonCsv, differingFields, forceInPercent } from '../application/comparison';
import { maxForceOf, toPercent } from '../application/forcePercent';
import type { SavedSimulations } from '../application/savedSimulations';
import type { SavedSimulation } from '../domain/savedSimulation';
import { fmtNumber, tr } from '../i18n/locale';
import { fieldLabel, fieldValue } from './compareLabels';
import type { LiveSeriesSpec } from './LiveChart';
import { LiveChart } from './LiveChart';
import { SegmentedControl } from './SegmentedControl';
import { CHART_THEMES, COMPARE_COLORS, useColorScheme } from './theme';
import { download } from './download';
import { useSavedSimulations } from './useSavedSimulations';
import { ZoomBar } from './ZoomBar';
import { ZoomSync } from './zoomSync';

type MeasureId = 'total' | 'S' | 'FR' | 'FF' | 'emg' | 'stimulus' | 'fatigue';

const MEASURES: Record<MeasureId, CompareMeasure> = {
  total: { kind: 'series', key: 'total' },
  S: { kind: 'series', key: 'S' },
  FR: { kind: 'series', key: 'FR' },
  FF: { kind: 'series', key: 'FF' },
  emg: { kind: 'series', key: 'emg' },
  stimulus: { kind: 'series', key: 'stimulus' },
  fatigue: { kind: 'fatigue', key: 'muscle' },
};

const fmt = (x: number, digits = 2) => (Number.isFinite(x) ? fmtNumber(x, { maximumFractionDigits: digits }) : '—');

function measureOptions(withFatigue: boolean) {
  const out: { value: MeasureId; label: string }[] = [
    { value: 'total', label: tr({ 'pt-BR': 'Força total', en: 'Total force' }) },
    { value: 'S', label: tr({ 'pt-BR': 'Força S', en: 'S force' }) },
    { value: 'FR', label: tr({ 'pt-BR': 'Força FR', en: 'FR force' }) },
    { value: 'FF', label: tr({ 'pt-BR': 'Força FF', en: 'FF force' }) },
    { value: 'emg', label: 'EMG' },
    { value: 'stimulus', label: tr({ 'pt-BR': 'Corrente', en: 'Current' }) },
  ];
  if (withFatigue) out.push({ value: 'fatigue', label: tr({ 'pt-BR': 'Fadiga', en: 'Fatigue' }) });
  return out;
}

function axisLabel(m: MeasureId, percent: boolean): string {
  if (m === 'emg') return tr({ 'pt-BR': 'EMG (unidades do modelo)', en: 'EMG (model units)' });
  if (m === 'stimulus') return 'µA/cm²';
  if (m === 'fatigue') return tr({ 'pt-BR': 'capacidade de força (1 = descansado)', en: 'force capacity (1 = rested)' });
  return percent
    ? tr({ 'pt-BR': 'força (% da máxima)', en: 'force (% of maximum)' })
    : tr({ 'pt-BR': 'força (unidades do modelo)', en: 'force (model units)' });
}

function SummaryTable({ sims, colors, percent }: { sims: readonly SavedSimulation[]; colors: readonly string[]; percent: boolean }) {
  const force = (s: SavedSimulation, x: number) => {
    const max = maxForceOf(s.run.maxForce);
    return percent && max ? `${fmt(toPercent(x, max), 1)} %` : fmt(x);
  };
  const lastFatigue = (s: SavedSimulation) => {
    const m = s.fatigue?.muscle;
    return m && m.length > 0 ? fmt(m[m.length - 1]!, 3) : '—';
  };
  return (
    <div className="table-scroll">
      <table className="compare-table">
        <caption>{tr({ 'pt-BR': 'Resumo de cada simulação', en: 'Summary of each simulation' })}</caption>
        <thead>
          <tr>
            <th scope="col">{tr({ 'pt-BR': 'Simulação', en: 'Simulation' })}</th>
            <th scope="col">{tr({ 'pt-BR': 'Força de pico', en: 'Peak force' })}</th>
            <th scope="col">{tr({ 'pt-BR': 'Força média', en: 'Mean force' })}</th>
            <th scope="col">{tr({ 'pt-BR': 'Tempo até o pico', en: 'Time to peak' })}</th>
            <th scope="col">{tr({ 'pt-BR': 'Fadiga no fim', en: 'Fatigue at the end' })}</th>
            <th scope="col">{tr({ 'pt-BR': 'Duração', en: 'Duration' })}</th>
          </tr>
        </thead>
        <tbody>
          {sims.map((s, i) => (
            <tr key={s.id}>
              <th scope="row">
                <span className="saved-swatch" style={{ background: colors[i] }} aria-hidden="true" /> {s.name}
              </th>
              <td>{force(s, s.result.summary.peakForce)}</td>
              <td>{force(s, s.result.summary.meanForce)}</td>
              <td>{fmt(s.result.summary.timeToPeakMs, 1)} ms</td>
              <td>{lastFatigue(s)}</td>
              <td>{fmt(s.run.durationMs, 0)} ms</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DifferencesTable({
  sims,
  colors,
  muscleLabel,
}: {
  sims: readonly SavedSimulation[];
  colors: readonly string[];
  muscleLabel?: (id: string) => string;
}) {
  const rows = differingFields(sims);
  if (sims.length < 2) return null;
  return (
    <div className="table-scroll">
      <table className="compare-table">
        <caption>{tr({ 'pt-BR': 'Parâmetros que diferem', en: 'Settings that differ' })}</caption>
        {rows.length === 0 ? null : (
          <thead>
            <tr>
              <th scope="col">{tr({ 'pt-BR': 'Parâmetro', en: 'Setting' })}</th>
              {sims.map((s, i) => (
                <th key={s.id} scope="col">
                  <span className="saved-swatch" style={{ background: colors[i] }} aria-hidden="true" /> {s.name}
                </th>
              ))}
            </tr>
          </thead>
        )}
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td className="muted">
                {tr({ 'pt-BR': 'Todas usam os mesmos parâmetros.', en: 'They all use the same settings.' })}
              </td>
            </tr>
          ) : (
            rows.map((r) => (
              <tr key={r.key}>
                <th scope="row">{fieldLabel(r.key)}</th>
                {r.values.map((v, i) => (
                  <td key={sims[i]!.id}>{fieldValue(r.key, v, muscleLabel)}</td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

/** Compare step, centre: the ticked simulations over one time axis, their summaries and what sets them apart. */
export function CompareView({ saved, muscleLabel }: { saved: SavedSimulations; muscleLabel?: (id: string) => string }) {
  const state = useSavedSimulations(saved);
  const scheme = useColorScheme();
  const theme = CHART_THEMES[scheme];
  const palette = COMPARE_COLORS[scheme];
  const [measure, setMeasure] = useState<MeasureId>('total');
  const zoom = useMemo(() => new ZoomSync(), []);

  // in the order they were saved (the list's order), each with the colour slot it was given when ticked
  const sims = useMemo(
    () => state.list.map((m) => state.data.get(m.id)).filter((s): s is SavedSimulation => s !== undefined && state.selected.has(s.id)),
    [state.list, state.data, state.selected],
  );
  const colors = sims.map((s) => palette[state.selected.get(s.id)!]!);
  const withFatigue = sims.some((s) => s.fatigue !== null);
  const shown: MeasureId = measure === 'fatigue' && !withFatigue ? 'total' : measure;
  const grid = useMemo(() => commonGrid(sims), [sims]);
  const source = useMemo(() => compareSource(sims, MEASURES[shown], grid), [sims, shown, grid]);
  const percent = forceInPercent(sims);

  if (sims.length === 0) {
    return (
      <div className="card empty-state">
        <h2>{tr({ 'pt-BR': 'Comparar simulações', en: 'Compare simulations' })}</h2>
        <p className="muted">
          {state.list.length === 0
            ? tr({
                'pt-BR': 'Salve simulações na etapa Resultados (botão “Salvar para comparar”); elas aparecem na barra lateral desta etapa.',
                en: 'Save simulations in the Results step (“Save to compare” button); they appear in this step’s sidebar.',
              })
            : tr({
                'pt-BR': 'Marque na barra lateral as simulações que quer comparar.',
                en: 'Tick the simulations you want to compare in the sidebar.',
              })}
        </p>
      </div>
    );
  }

  const series: LiveSeriesSpec[] = sims.map((s, i) => ({ key: s.id, label: s.name, color: 'blue', stroke: colors[i]!, width: 1.75 }));
  const options = measureOptions(withFatigue);
  const measureLabel = options.find((o) => o.value === shown)!.label;
  return (
    <>
      <div className="compare-toolbar">
        <SegmentedControl<MeasureId>
          label={tr({ 'pt-BR': 'Medida comparada', en: 'Compared measure' })}
          options={options}
          value={shown}
          onChange={setMeasure}
          size="small"
        />
        <button
          type="button"
          className="btn btn--small"
          onClick={() => download(`eenm-${shown}-comparison.csv`, comparisonCsv(source.view(), sims), 'text/csv')}
        >
          {tr({ 'pt-BR': 'Baixar CSV', en: 'Download CSV' })}
        </button>
      </div>
      <ZoomBar zoom={zoom} durationMs={grid.endMs} />
      <div className="charts">
        <LiveChart
          key={`${shown}-${sims.map((s) => s.id).join()}-${percent}`}
          title={`${measureLabel} — ${tr({ 'pt-BR': `${sims.length} simulação(ões)`, en: `${sims.length} simulation(s)` })}`}
          yLabel={axisLabel(shown, source.percent)}
          series={series}
          buffer={source}
          samples={grid.timeMs.length}
          runId={0}
          xMaxMs={grid.endMs}
          height={340}
          theme={theme}
          stepped={shown === 'stimulus'}
          zoom={zoom}
          {...(source.percent ? { yRange: [0, 105] as [number, number] } : {})}
        />
      </div>
      <SummaryTable sims={sims} colors={colors} percent={percent} />
      <DifferencesTable sims={sims} colors={colors} {...(muscleLabel ? { muscleLabel } : {})} />
    </>
  );
}
