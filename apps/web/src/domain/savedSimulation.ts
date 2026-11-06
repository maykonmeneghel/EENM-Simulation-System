import type { AxonEvents, CompletedEvent, SimulationRequest, StartedEvent } from './simulation';

/** Columns of a saved run, as streamed (`SeriesBuffer`). */
export const SAVED_SERIES_KEYS = ['timeMs', 'stimulus', 'total', 'S', 'FR', 'FF', 'emg'] as const;
export type SavedSeriesKey = (typeof SAVED_SERIES_KEYS)[number];

/** Columns of the fatigue snapshots (`FatigueBuffer`); a type with no units is NaN. */
export const SAVED_FATIGUE_KEYS = ['timeMs', 'muscle', 'S', 'FR', 'FF'] as const;
export type SavedFatigueKey = (typeof SAVED_FATIGUE_KEYS)[number];

/** What the list of saved simulations shows: small, read without the series. */
export interface SavedSimulationMeta {
  id: string;
  name: string;
  /** ISO 8601. */
  savedAt: string;
  request: SimulationRequest;
  run: StartedEvent;
  result: CompletedEvent;
  samples: number;
}

/** A finished run kept for comparison: what was asked, what came back, and every streamed sample. */
export interface SavedSimulation extends SavedSimulationMeta {
  series: Record<SavedSeriesKey, Float64Array>;
  /** Null when the run has no fatigue (ORIGINAL). */
  fatigue: Record<SavedFatigueKey, Float64Array> | null;
  axonEvents: AxonEvents | null;
}

export const metaOf = (s: SavedSimulation): SavedSimulationMeta => ({
  id: s.id,
  name: s.name,
  savedAt: s.savedAt,
  request: s.request,
  run: s.run,
  result: s.result,
  samples: s.samples,
});

// ---------- export file ----------

export const EXPORT_FORMAT = 'eenm-simulations';
export const EXPORT_VERSION = 1;

/** Plain JSON: typed arrays become number arrays (NaN, which JSON cannot hold, becomes null). */
export interface ExportFile {
  format: typeof EXPORT_FORMAT;
  version: typeof EXPORT_VERSION;
  exportedAt: string;
  simulations: ExportedSimulation[];
}

type Columns<K extends string> = Record<K, (number | null)[]>;

interface ExportedSimulation extends SavedSimulationMeta {
  series: Columns<SavedSeriesKey>;
  fatigue: Columns<SavedFatigueKey> | null;
  axonEvents: AxonEvents | null;
}

const toJsonColumns = <K extends string>(cols: Record<K, Float64Array>, keys: readonly K[]): Columns<K> => {
  const out = {} as Columns<K>;
  for (const k of keys) out[k] = Array.from(cols[k], (x) => (Number.isFinite(x) ? x : null));
  return out;
};

export function toExportFile(sims: readonly SavedSimulation[], now = new Date()): ExportFile {
  return {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt: now.toISOString(),
    simulations: sims.map((s) => ({
      ...metaOf(s),
      series: toJsonColumns(s.series, SAVED_SERIES_KEYS),
      fatigue: s.fatigue ? toJsonColumns(s.fatigue, SAVED_FATIGUE_KEYS) : null,
      axonEvents: s.axonEvents,
    })),
  };
}

export class ImportError extends Error {
  override name = 'ImportError';
}

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

function fromJsonColumns<K extends string>(raw: unknown, keys: readonly K[], where: string): Record<K, Float64Array> {
  if (!isObject(raw)) throw new ImportError(`${where}: missing columns`);
  const out = {} as Record<K, Float64Array>;
  let length: number | null = null;
  for (const k of keys) {
    const col = raw[k];
    if (!Array.isArray(col) || !col.every((x) => x === null || typeof x === 'number')) {
      throw new ImportError(`${where}.${k}: expected an array of numbers`);
    }
    if (length !== null && col.length !== length) throw new ImportError(`${where}.${k}: columns of different lengths`);
    length = col.length;
    out[k] = Float64Array.from(col as (number | null)[], (x) => (x === null ? NaN : x));
  }
  return out;
}

/** Reads an export file. Throws `ImportError` naming the first thing that does not fit. */
export function parseExportFile(text: string): SavedSimulation[] {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new ImportError('not a JSON file');
  }
  if (!isObject(raw) || raw.format !== EXPORT_FORMAT) throw new ImportError(`not an ${EXPORT_FORMAT} file`);
  if (raw.version !== EXPORT_VERSION) throw new ImportError(`unsupported version ${String(raw.version)}`);
  if (!Array.isArray(raw.simulations)) throw new ImportError('simulations: expected an array');
  return raw.simulations.map((s: unknown, i: number) => {
    const where = `simulations[${i}]`;
    if (!isObject(s)) throw new ImportError(`${where}: expected an object`);
    for (const k of ['id', 'name', 'savedAt'] as const) {
      if (typeof s[k] !== 'string') throw new ImportError(`${where}.${k}: expected a string`);
    }
    for (const k of ['request', 'run', 'result'] as const) {
      if (!isObject(s[k])) throw new ImportError(`${where}.${k}: expected an object`);
    }
    const series = fromJsonColumns(s.series, SAVED_SERIES_KEYS, `${where}.series`);
    return {
      id: s.id as string,
      name: s.name as string,
      savedAt: s.savedAt as string,
      request: s.request as unknown as SimulationRequest,
      run: s.run as unknown as StartedEvent,
      result: s.result as unknown as CompletedEvent,
      samples: series.timeMs.length,
      series,
      fatigue: s.fatigue == null ? null : fromJsonColumns(s.fatigue, SAVED_FATIGUE_KEYS, `${where}.fatigue`),
      axonEvents: isObject(s.axonEvents) ? (s.axonEvents as unknown as AxonEvents) : null,
    };
  });
}
