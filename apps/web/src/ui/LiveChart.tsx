import { useEffect, useRef } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
/** Any columnar store with a `timeMs` column (SeriesBuffer, FatigueBuffer). */
export interface ChartSource {
  view(): { timeMs: Float64Array } & Record<string, Float64Array>;
}
import type { ChartTheme } from './theme';
import type { ZoomSync } from './zoomSync';

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
  /** Shared time zoom: a box dragged here zooms every chart in time (and this one in amplitude). */
  zoom?: ZoomSync;
}

/** Canvas can't use CSS variables: read the app font and type scale once. */
function chartFonts(): { ticks: string; label: string } {
  const css = typeof document !== 'undefined' ? getComputedStyle(document.documentElement) : null;
  const v = (name: string, fallback: string) => css?.getPropertyValue(name).trim() || fallback;
  const family = v('--font', '-apple-system, BlinkMacSystemFont, system-ui, sans-serif');
  return { ticks: `${v('--fs-2xs', '10px')} ${family}`, label: `500 ${v('--fs-sm', '12px')} ${family}` };
}

/** Smaller drags are clicks, not zooms (px). */
const MIN_DRAG_PX = 6;

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
  zoom,
}: LiveChartProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const plotRef = useRef<uPlot | null>(null);
  const xMaxRef = useRef<number | null>(xMaxMs);
  const frameRef = useRef<number | null>(null);
  const specRef = useRef(series);
  const yRangeRef = useRef(yRange);
  /** Amplitude zoom of this chart only; cleared when the shared zoom is reset. */
  const yZoomRef = useRef<[number, number] | null>(null);

  // Create / destroy.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const specs = specRef.current;
    const fonts = chartFonts();
    const paths = stepped ? uPlot.paths.stepped?.({ align: 1 }) : undefined;
    const opts: uPlot.Options = {
      width: Math.max(300, host.clientWidth),
      height,
      legend: { show: true, live: true },
      // Drag a box to zoom (handled in setSelect); double-click restores the whole run.
      cursor: { drag: { x: true, y: true, uni: MIN_DRAG_PX, setScale: false }, bind: { dblclick: () => () => null } },
      scales: {
        x: {
          time: false,
          range: (_u, _min, max) => {
            const w = zoom?.x;
            return w ? [w[0], w[1]] : [0, xMaxRef.current ?? (Number.isFinite(max) ? max : 1)];
          },
        },
        y: {
          range: (_u, min, max) =>
            yZoomRef.current ??
            yRangeRef.current ??
            (Number.isFinite(min) && Number.isFinite(max) ? uPlot.rangeNum(min, max, 0.1, true) : [0, 1]),
        },
      },
      hooks: {
        setSelect: [
          (u) => {
            const { left, top, width, height: h } = u.select;
            u.setSelect({ left: 0, top: 0, width: 0, height: 0 }, false);
            if (!zoom || width < MIN_DRAG_PX) return;
            yZoomRef.current =
              h >= MIN_DRAG_PX ? [u.posToVal(top + h, 'y'), u.posToVal(top, 'y')] : null;
            zoom.set(u.posToVal(left, 'x'), u.posToVal(left + width, 'x'));
          },
        ],
      },
      axes: [
        {
          label: 'tempo',
          font: fonts.ticks,
          labelFont: fonts.label,
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
        { label: yLabel, font: fonts.ticks, labelFont: fonts.label, stroke: theme.axis, grid: { stroke: theme.grid, width: 1 }, ticks: { stroke: theme.grid, width: 1 }, size: 60 },
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
    const onDblClick = () => {
      yZoomRef.current = null;
      if (zoom?.x) zoom.reset();
      else redraw(); // amplitude-only zoom of this chart
    };
    const redraw = () => {
      const d = buffer.view();
      plot.setData([d.timeMs, ...specs.map((s) => d[s.key]!)]);
    };
    plot.over.addEventListener('dblclick', onDblClick);
    // Hand: in pan mode (or with Shift) a drag moves the shared time window instead of selecting a box.
    const panEnd = () => xMaxRef.current ?? buffer.view().timeMs.at(-1) ?? 0;
    const onPanStart = (e: MouseEvent) => {
      if (!zoom || e.button !== 0 || (zoom.mode !== 'pan' && !e.shiftKey)) return;
      e.preventDefault();
      e.stopPropagation(); // keep uPlot from starting a selection box
      let lastX = e.clientX;
      plot.over.classList.add('u-over--grabbing');
      const move = (ev: MouseEvent) => {
        const w = zoom.x;
        const px = plot.over.clientWidth;
        if (w && px > 0) zoom.pan(((lastX - ev.clientX) / px) * (w[1] - w[0]), panEnd());
        lastX = ev.clientX;
      };
      const up = () => {
        plot.over.classList.remove('u-over--grabbing');
        window.removeEventListener('mousemove', move);
        window.removeEventListener('mouseup', up);
      };
      window.addEventListener('mousemove', move);
      window.addEventListener('mouseup', up);
    };
    plot.over.addEventListener('mousedown', onPanStart, { capture: true });
    const syncCursor = () => plot.over.classList.toggle('u-over--hand', zoom?.mode === 'pan');
    syncCursor();
    // Another chart zoomed or the zoom was reset: rescale (a reset also drops this chart's amplitude zoom).
    const unsubscribe = zoom?.subscribe(() => {
      if (!zoom.x) yZoomRef.current = null;
      syncCursor();
      redraw();
    });
    return () => {
      unsubscribe?.();
      plot.over.removeEventListener('mousedown', onPanStart, { capture: true });
      plot.over.removeEventListener('dblclick', onDblClick);
      ro?.disconnect();
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
      plot.destroy();
      plotRef.current = null;
    };
  }, [buffer, height, yLabel, stepped, theme, zoom]);

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
