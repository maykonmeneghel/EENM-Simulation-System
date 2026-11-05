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
