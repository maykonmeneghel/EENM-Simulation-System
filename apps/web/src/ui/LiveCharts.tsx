import { useMemo } from 'react';
import { maxForceOf, percentSource } from '../application/forcePercent';
import type { SeriesBuffer } from '../application/seriesBuffer';
import type { InspectorTopic } from '../application/inspectorTopics';
import type { SessionState } from '../application/session';
import type { LiveSeriesSpec } from './LiveChart';
import { LiveChart } from './LiveChart';
import { CHART_THEMES, useColorScheme } from './theme';
import type { ZoomSync } from './zoomSync';
import { tr } from '../i18n/locale';


const force = (): LiveSeriesSpec[] => [
  { key: 'total', label: 'Total', color: 'blue', width: 2 },
  { key: 'S', label: 'S', color: 'orange' },
  { key: 'FR', label: 'FR', color: 'aqua' },
  { key: 'FF', label: 'FF', color: 'yellow' },
];
const stimulus = (): LiveSeriesSpec[] => [{ key: 'stimulus', label: tr({ 'pt-BR': 'Corrente', en: 'Current' }), color: 'blue' }];
const emg = (): LiveSeriesSpec[] => [{ key: 'emg', label: tr({ 'pt-BR': 'MUAP médio', en: 'Mean MUAP' }), color: 'blue' }];

export function LiveCharts({
  state,
  buffer,
  zoom,
  onInspect,
}: {
  state: SessionState;
  buffer: SeriesBuffer;
  zoom: ZoomSync;
  onInspect?(topic: InspectorTopic): void;
}) {
  const inspect = (chart: 'force' | 'stimulus' | 'emg') => (onInspect ? { onInspect: () => onInspect({ kind: 'chart', chart }) } : {});
  const theme = CHART_THEMES[useColorScheme()];
  const maxForce = maxForceOf(state.run?.maxForce);
  const forceSource = useMemo(() => (maxForce ? percentSource(buffer, maxForce) : null), [buffer, maxForce]);
  const common = {
    theme,
    buffer,
    samples: state.samples,
    runId: state.runId,
    xMaxMs: state.run?.durationMs ?? null,
    zoom,
  };
  return (
    <div className="charts">
      <LiveChart
        key={maxForce ? 'percent' : 'model-units'}
        title={
          maxForce
            ? tr({
                'pt-BR': 'Força muscular — % da força máxima do músculo saudável (total e por tipo de unidade motora)',
                en: 'Muscle force — % of the maximum force of the healthy muscle (total and per motor unit type)',
              })
            : tr({ 'pt-BR': 'Força muscular (total e por tipo de unidade motora)', en: 'Muscle force (total and per motor unit type)' })
        }
        yLabel={
          maxForce
            ? tr({ 'pt-BR': 'força (% da máxima)', en: 'force (% of maximum)' })
            : tr({ 'pt-BR': 'força (unidades do modelo)', en: 'force (model units)' })
        }
        series={force()}
        height={280}
        {...common}
        {...(forceSource ? { buffer: forceSource } : {})}
        {...(maxForce ? { yRange: [0, 105] as [number, number] } : {})}
        {...inspect('force')}
      />
      <LiveChart title={tr({ 'pt-BR': 'Corrente de estímulo', en: 'Stimulus current' })} yLabel={state.run?.amplitudeUnit === 'MA' ? 'mA' : state.run?.electrode ? tr({ 'pt-BR': 'u.m.', en: 'm.u.' }) : 'µA/cm²'} series={stimulus()} stepped {...common} {...inspect('stimulus')} />
      <LiveChart
        title={tr({ 'pt-BR': 'EMG — potencial de ação médio das unidades motoras', en: 'EMG — mean motor unit action potential' })}
        yLabel={tr({ 'pt-BR': 'EMG (unidades do modelo)', en: 'EMG (model units)' })}
        series={emg()}
        {...common}
        {...inspect('emg')}
      />
    </div>
  );
}
