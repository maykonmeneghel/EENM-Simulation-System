import type { SeriesBuffer } from '../application/seriesBuffer';
import type { SessionState } from '../application/session';
import type { LiveSeriesSpec } from './LiveChart';
import { LiveChart } from './LiveChart';
import { CHART_THEMES, useColorScheme } from './theme';


const FORCE: LiveSeriesSpec[] = [
  { key: 'total', label: 'Total', color: 'blue', width: 2 },
  { key: 'S', label: 'S', color: 'orange' },
  { key: 'FR', label: 'FR', color: 'aqua' },
  { key: 'FF', label: 'FF', color: 'yellow' },
];
const STIMULUS: LiveSeriesSpec[] = [{ key: 'stimulus', label: 'Corrente', color: 'blue' }];
const EMG: LiveSeriesSpec[] = [{ key: 'emg', label: 'MUAP médio', color: 'blue' }];

export function LiveCharts({ state, buffer }: { state: SessionState; buffer: SeriesBuffer }) {
  const theme = CHART_THEMES[useColorScheme()];
  const common = {
    theme,
    buffer,
    samples: state.samples,
    runId: state.runId,
    xMaxMs: state.run?.durationMs ?? null,
  };
  return (
    <div className="charts">
      <LiveChart title="Força muscular (total e por tipo de unidade motora)" yLabel="força (u.a.)" series={FORCE} height={280} {...common} />
      <LiveChart title="Corrente de estímulo" yLabel="µA/cm²" series={STIMULUS} stepped {...common} />
      <LiveChart title="EMG — potencial de ação médio das unidades motoras" yLabel="EMG (u.a.)" series={EMG} {...common} />
    </div>
  );
}
