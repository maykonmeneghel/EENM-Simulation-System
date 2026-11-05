import { useEffect, useRef } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
/** Any columnar store with a `timeMs` column (SeriesBuffer, FatigueBuffer). */
export interface ChartSource {
  view(): { timeMs: Float64Array } & Record<string, Float64Array>;
}
import type { ChartTheme } from './theme';

const LONG_RUN_MS = 2_000;
const formatTick = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 3 });

export interface LiveSeriesSpec {
  key: string;
  label: string;
  color: keyof ChartTheme['series'];
  width?: number;
}

export interface LiveChartProps {
  title: string;
  yLabel: string;
  series: readonly LiveSeriesSpec[];
  buffer: ChartSource;
  /** Number of samples currently in the buffer; a change triggers a redraw. */
  samples: number;
  /** Changes when a new run starts. */
  runId: number;
  /** Fixed x-axis end (simulation duration) so the trace visibly grows left → right. */
  xMaxMs: number | null;
  height?: number;
  theme: ChartTheme;
  /** Draw as steps (useful for the rectangular stimulus pulses). */
  stepped?: boolean;
  /** Fixed y range (e.g. 0–1 for a fraction); default: fitted to the data. */
  yRange?: [number, number];
}

/**
 * uPlot wrapper. The chart is created once per mount; each new chunk only calls `setData`
 * with zero-copy views of the buffer, coalesced to one redraw per animation frame.
 */
export function LiveChart({
  title,
  yLabel,
  series,
  buffer,
  samples,
  runId,
  xMaxMs,
  height = 220,
  stepped = false,
  theme,
  yRange,
}: LiveChartProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const plotRef = useRef<uPlot | null>(null);
  const xMaxRef = useRef<number | null>(xMaxMs);
  const frameRef = useRef<number | null>(null);
  const specRef = useRef(series);
  const yRangeRef = useRef(yRange);

  // Create / destroy.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const specs = specRef.current;
    const paths = stepped ? uPlot.paths.stepped?.({ align: 1 }) : undefined;
    const opts: uPlot.Options = {
      width: Math.max(300, host.clientWidth),
      height,
      legend: { show: true, live: true },
      cursor: { drag: { x: true, y: false, setScale: true } },
      scales: {
        x: {
          time: false,
          range: (_u, _min, max) => [0, xMaxRef.current ?? (Number.isFinite(max) ? max : 1)],
        },
        ...(yRangeRef.current ? { y: { range: () => yRangeRef.current! } } : {}),
      },
      axes: [
        {
          label: 'tempo',
          space: 72,
          stroke: theme.axis,
          grid: { stroke: theme.grid, width: 1 },
          ticks: { stroke: theme.grid, width: 1 },
          // Long (fatigue) runs read better in seconds.
          values: (_u, splits) =>
            (xMaxRef.current ?? 0) > LONG_RUN_MS
              ? splits.map((v) => `${formatTick(v / 1000)} s`)
              : splits.map((v) => `${formatTick(v)} ms`),
        },
        { label: yLabel, stroke: theme.axis, grid: { stroke: theme.grid, width: 1 }, ticks: { stroke: theme.grid, width: 1 }, size: 60 },
      ],
      series: [
        { label: 't (ms)', value: (_u, v) => (v == null ? '—' : v.toFixed(2)) },
        ...specs.map<uPlot.Series>((s) => ({
          label: s.label,
          stroke: theme.series[s.color],
          width: s.width ?? 1.5,
          points: { show: false },
          ...(paths ? { paths } : {}),
          value: (_u, v) => (v == null ? '—' : v.toFixed(4)),
        })),
      ],
    };
    const empty: uPlot.AlignedData = [new Float64Array(0), ...specs.map(() => new Float64Array(0))];
    const plot = new uPlot(opts, empty, host);
    plotRef.current = plot;
    // (Re)mounted: draw whatever the buffer already holds.
    const v = buffer.view();
    if (v.timeMs.length > 0) plot.setData([v.timeMs, ...specs.map((s) => v[s.key]!)]);

    const ro =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => plot.setSize({ width: Math.max(300, host.clientWidth), height }))
        : null;
    ro?.observe(host);
    return () => {
      ro?.disconnect();
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
      plot.destroy();
      plotRef.current = null;
    };
  }, [buffer, height, yLabel, stepped, theme]);

  // Push new data (also on new run, which resets to an empty buffer).
  useEffect(() => {
    xMaxRef.current = xMaxMs;
    if (frameRef.current !== null) return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      const plot = plotRef.current;
      if (!plot) return;
      const v = buffer.view();
      plot.setData([v.timeMs, ...specRef.current.map((s) => v[s.key]!)]);
    });
  }, [buffer, samples, runId, xMaxMs]);

  return (
    <figure className="chart">
      <figcaption>{title}</figcaption>
      <div ref={hostRef} className="chart-host" />
    </figure>
  );
}
