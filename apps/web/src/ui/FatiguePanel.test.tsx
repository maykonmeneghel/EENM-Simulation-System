import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FatigueBuffer } from '../application/fatigue';
import { SeriesBuffer } from '../application/seriesBuffer';
import type { SessionState } from '../application/session';
import { initialSessionState } from '../application/session';
import { defaultRequest } from '../domain/defaults';
import type { LiveChartProps } from './LiveChart';
import { ZoomSync } from './zoomSync';

const charts: LiveChartProps[] = [];
vi.mock('./LiveChart', () => ({
  LiveChart: (props: LiveChartProps) => {
    charts.push(props);
    return null;
  },
}));

const { FatiguePanel } = await import('./FatiguePanel');

/** Four 330 ms trains every 1000 ms at 20 Hz (Shields's protocol), force falling train by train. */
function run(): { state: SessionState; series: SeriesBuffer } {
  const base = defaultRequest('LITERATURE');
  const request = { ...base, stimulus: { ...base.stimulus, frequencyHz: 20, durationMs: 4000, trainOnMs: 330, trainPeriodMs: 1000 } };
  const series = new SeriesBuffer();
  const t = Array.from({ length: 4001 }, (_, i) => i);
  const total = t.map((ms) => (ms % 1000 < 330 ? 1 - Math.floor(ms / 1000) * 0.1 : 0));
  const zeros = t.map(() => 0);
  series.append({ type: 'chunk', progress: 1, timeMs: t, stimulus: zeros, force: { total, S: zeros, FR: zeros, FF: zeros }, emg: zeros });
  const state: SessionState = {
    ...initialSessionState,
    status: 'completed',
    runId: 3,
    request,
    run: { type: 'started', simulationId: 'x', durationMs: 4000, outputStepMs: 1, motorUnits: { S: 1, FR: 1, FF: 1 }, muscle: request.muscle },
    samples: series.length,
  };
  return { state, series };
}

describe('FatiguePanel', () => {
  it('the train-peak chart shares the run zoom, one bar per train at its time, with the reference band', () => {
    charts.length = 0;
    const zoom = new ZoomSync();
    const { state, series } = run();
    render(<FatiguePanel state={state} fatigue={new FatigueBuffer()} series={series} zoom={zoom} />);
    const peaks = charts.find((c) => c.bars);
    expect(peaks).toBeDefined();
    expect(peaks!.zoom).toBe(zoom);
    expect(peaks!.xMaxMs).toBe(4000);
    expect(peaks!.bars).toBeCloseTo(0.33); // a bar is as wide as the train's on time
    const v = peaks!.buffer.view();
    expect(Array.from(v.timeMs)).toEqual([165, 1165, 2165, 3165]); // the four complete trains, at the middle of their on time
    expect(Array.from(v.ratio as Float64Array).map((r) => +r.toFixed(3))).toEqual([1, 0.9, 0.8, 0.7]);
    expect(peaks!.band).toEqual({ lo: 0.89 - 0.08, hi: 0.89 + 0.08 });
  });
});
