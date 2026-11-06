import { useMemo } from 'react';
import { maxForceOf, percentSource } from '../application/forcePercent';
import type { SeriesBuffer } from '../application/seriesBuffer';
import type { InspectorTopic } from '../application/inspectorTopics';
import type { SessionState } from '../application/session';
import type { LiveSeriesSpec } from './LiveChart';
import { LiveChart } from './LiveChart';
import { CHART_THEMES, useColorScheme } from './theme';
import type { ZoomSync } from './zoomSync';


const FORCE: LiveSeriesSpec[] = [
  { key: 'total', label: 'Total', color: 'blue', width: 2 },
  { key: 'S', label: 'S', color: 'orange' },
  { key: 'FR', label: 'FR', color: 'aqua' },
  { key: 'FF', label: 'FF', color: 'yellow' },
];
const STIMULUS: LiveSeriesSpec[] = [{ key: 'stimulus', label: 'Corrente', color: 'blue' }];
const EMG: LiveSeriesSpec[] = [{ key: 'emg', label: 'MUAP médio', color: 'blue' }];

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
            ? 'Força muscular — % da força máxima do músculo saudável (total e por tipo de unidade motora)'
            : 'Força muscular (total e por tipo de unidade motora)'
        }
        yLabel={maxForce ? 'força (% da máxima)' : 'força (unidades do modelo)'}
        series={FORCE}
        height={280}
        {...common}
        {...(forceSource ? { buffer: forceSource } : {})}
        {...(maxForce ? { yRange: [0, 105] as [number, number] } : {})}
        {...inspect('force')}
      />
      <LiveChart title="Corrente de estímulo" yLabel="µA/cm²" series={STIMULUS} stepped {...common} {...inspect('stimulus')} />
      <LiveChart title="EMG — potencial de ação médio das unidades motoras" yLabel="EMG (unidades do modelo)" series={EMG} {...common} {...inspect('emg')} />
    </div>
  );
}
