import type { SeriesBuffer } from '../application/seriesBuffer';
import type { SessionState } from '../application/session';
import type { LiveSeriesSpec } from './LiveChart';
import { LiveChart } from './LiveChart';

// Categorical slots 1–4 of the reference palette (validated, fixed order).
const C = { blue: '#2a78d6', orange: '#eb6834', aqua: '#1baf7a', yellow: '#eda100' };

const FORCE: LiveSeriesSpec[] = [
  { key: 'total', label: 'Total', color: C.blue, width: 2 },
  { key: 'S', label: 'S', color: C.orange },
  { key: 'FR', label: 'FR', color: C.aqua },
  { key: 'FF', label: 'FF', color: C.yellow },
];
const STIMULUS: LiveSeriesSpec[] = [{ key: 'stimulus', label: 'Corrente', color: C.blue }];
const EMG: LiveSeriesSpec[] = [{ key: 'emg', label: 'MUAP médio', color: C.blue }];

export function LiveCharts({ state, buffer }: { state: SessionState; buffer: SeriesBuffer }) {
  const common = {
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
