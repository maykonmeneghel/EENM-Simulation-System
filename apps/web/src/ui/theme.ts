import { useSyncExternalStore } from 'react';

export type ColorScheme = 'light' | 'dark';

/**
 * Canvas colours for uPlot (canvas can't read CSS variables). Categorical slots 1–4 of the
 * validated reference palette, light and dark steps; axis/grid ink matches the CSS tokens.
 */
export interface ChartTheme {
  axis: string;
  grid: string;
  series: { blue: string; orange: string; aqua: string; yellow: string };
}

export const CHART_THEMES: Record<ColorScheme, ChartTheme> = {
  light: {
    axis: '#6e6e73',
    grid: 'rgba(60, 60, 67, 0.12)',
    series: { blue: '#2a78d6', orange: '#eb6834', aqua: '#1baf7a', yellow: '#eda100' },
  },
  dark: {
    axis: '#a1a1a6',
    grid: 'rgba(235, 235, 245, 0.12)',
    series: { blue: '#3987e5', orange: '#d95926', aqua: '#199e70', yellow: '#c98500' },
  },
};

/**
 * Colours of compared simulations: the reference palette's eight categorical slots, in fixed order (slots 1–4 are
 * the chart series above). Validated with the dataviz skill's checker: all checks pass in both modes; in light mode
 * aqua, yellow and magenta are under 3:1 against the surface, so every comparison also has a legend and a table.
 */
export const COMPARE_COLORS: Record<ColorScheme, readonly string[]> = {
  light: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'],
  dark: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'],
};

const QUERY = '(prefers-color-scheme: dark)';
const media = () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(QUERY) : null);

function subscribe(cb: () => void): () => void {
  const m = media();
  if (!m) return () => undefined;
  m.addEventListener('change', cb);
  return () => m.removeEventListener('change', cb);
}
const getScheme = (): ColorScheme => (media()?.matches ? 'dark' : 'light');

export function useColorScheme(): ColorScheme {
  return useSyncExternalStore(subscribe, getScheme, () => 'light');
}
