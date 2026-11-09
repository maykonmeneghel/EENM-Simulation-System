import type { SavedFatigueKey, SavedSeriesKey, SavedSimulation } from '../domain/savedSimulation';
import type { FormValues } from './formModel';
import { toFormValues } from './formModel';
import { maxForceOf } from './forcePercent';

/** Points per compared trace at most: past this the grid step grows (a canvas has ~2000 px anyway). */
export const MAX_GRID_POINTS = 100_000;

export interface Grid {
  stepMs: number;
  endMs: number;
  timeMs: Float64Array;
}

/**
 * One time axis for every compared run (uPlot draws series over a shared x): from 0 to the longest run, at the
 * finest output step among them, coarser only past `MAX_GRID_POINTS`.
 */
export function commonGrid(sims: readonly { run: { durationMs: number; outputStepMs: number } }[], maxPoints = MAX_GRID_POINTS): Grid {
  const endMs = Math.max(0, ...sims.map((s) => s.run.durationMs));
  const finest = Math.min(...sims.map((s) => s.run.outputStepMs).filter((x) => x > 0));
  let stepMs = Number.isFinite(finest) ? finest : 1;
  if (endMs / stepMs + 1 > maxPoints) stepMs = endMs / (maxPoints - 1);
  const n = endMs > 0 ? Math.floor(endMs / stepMs + 1e-9) + 1 : 1;
  const timeMs = new Float64Array(n);
  for (let i = 0; i < n; i++) timeMs[i] = i * stepMs;
  return { stepMs, endMs, timeMs };
}

/**
 * Linear interpolation of (t, y) at the grid times; null outside the run (a shorter run ends, it does not drop
 * to zero) and where a value is not finite.
 */
export function resample(t: ArrayLike<number>, y: ArrayLike<number>, grid: ArrayLike<number>): (number | null)[] {
  const out: (number | null)[] = new Array<number | null>(grid.length).fill(null);
  const n = t.length;
  if (n === 0) return out;
  const first = t[0]!;
  const last = t[n - 1]!;
  let j = 0;
  for (let i = 0; i < grid.length; i++) {
    const g = grid[i]!;
    if (g < first - 1e-9 || g > last + 1e-9) continue;
    while (j < n - 2 && t[j + 1]! < g) j++;
    const t0 = t[j]!;
    const t1 = t[Math.min(j + 1, n - 1)]!;
    const y0 = y[j]!;
    const y1 = y[Math.min(j + 1, n - 1)]!;
    // on a sample, its own value (a missing neighbour does not blank it)
    const v = g <= t0 || t1 <= t0 ? y0 : g >= t1 ? y1 : y0 + ((y1 - y0) * (g - t0)) / (t1 - t0);
    out[i] = Number.isFinite(v) ? v : null;
  }
  return out;
}

/** Force is compared as % of the healthy muscle's maximum only when every run has that maximum. */
export function forceInPercent(sims: readonly SavedSimulation[]): boolean {
  return sims.length > 0 && sims.every((s) => maxForceOf(s.run.maxForce) !== null);
}

export type CompareMeasure =
  | { kind: 'series'; key: Exclude<SavedSeriesKey, 'timeMs'> }
  | { kind: 'fatigue'; key: Exclude<SavedFatigueKey, 'timeMs'> };

const FORCE: ReadonlySet<string> = new Set(['total', 'S', 'FR', 'FF']);

/** A chart source: one column per compared simulation (keyed by id) over the common grid. */
export function compareSource(sims: readonly SavedSimulation[], measure: CompareMeasure, grid: Grid) {
  const percent = measure.kind === 'series' && FORCE.has(measure.key) && forceInPercent(sims);
  const columns: Record<string, (number | null)[]> = {};
  for (const s of sims) {
    const cols = measure.kind === 'series' ? s.series : s.fatigue;
    if (!cols) {
      columns[s.id] = new Array<number | null>(grid.timeMs.length).fill(null);
      continue;
    }
    let y: ArrayLike<number> = cols[measure.key as keyof typeof cols];
    if (percent) {
      const max = maxForceOf(s.run.maxForce)!;
      y = Float64Array.from(y, (x) => (x / max) * 100);
    }
    columns[s.id] = resample(cols.timeMs, y, grid.timeMs);
  }
  return {
    percent,
    view: () => ({ timeMs: grid.timeMs, ...columns }) as { timeMs: Float64Array } & Record<string, readonly (number | null)[]>,
  };
}

// ---------- parameters ----------

/** Form fields that only mirror another one, or are bookkeeping: not shown as a difference of their own. */
const IGNORED: ReadonlySet<string> = new Set(['autoUnits']);

const show = (v: unknown): string => (Array.isArray(v) ? v.join(', ') : typeof v === 'boolean' ? (v ? '✓' : '—') : String(v ?? ''));

/** The settings (as form fields) whose value is not the same in every compared simulation. */
export function differingFields(sims: readonly { request: SavedSimulation['request'] }[]): { key: string; values: string[] }[] {
  if (sims.length < 2) return [];
  const forms = sims.map((s) => toFormValues(s.request) as FormValues & Record<string, unknown>);
  const keys = Object.keys(forms[0]!).filter((k) => !IGNORED.has(k));
  return keys
    .map((key) => ({ key, values: forms.map((f) => show(f[key])) }))
    .filter((row) => new Set(row.values).size > 1);
}

// ---------- CSV ----------

/**
 * A text cell (header, simulation name). Names come from the user or from imported files: a cell starting with
 * `=`, `+`, `-`, `@`, tab or carriage return would run as a formula in a spreadsheet, so it gets a leading `'`
 * (OWASP, CSV injection), then the usual quoting. The numeric cells are written as numbers, untouched.
 */
export const csvCell = (text: string) => {
  const s = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** The compared columns as CSV (time in ms, one column per simulation, empty where a run has ended). */
export function comparisonCsv(view: { timeMs: ArrayLike<number> } & Record<string, ArrayLike<number | null>>, sims: readonly Pick<SavedSimulation, 'id' | 'name'>[]): string {
  const lines = [['time_ms', ...sims.map((s) => s.name)].map(csvCell).join(',')];
  for (let i = 0; i < view.timeMs.length; i++) {
    lines.push([view.timeMs[i], ...sims.map((s) => view[s.id]?.[i] ?? '')].join(','));
  }
  return lines.join('\n');
}
