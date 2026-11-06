import type { SavedSimulation, SavedSimulationMeta } from '../domain/savedSimulation';
import { metaOf, parseExportFile, SAVED_FATIGUE_KEYS, SAVED_SERIES_KEYS, toExportFile } from '../domain/savedSimulation';
import type { SavedSimulationStore } from '../infrastructure/savedSimulationStore';
import type { SimulationController } from './simulationController';

/** At most this many simulations are compared at once: one categorical colour each, never a generated one. */
export const MAX_COMPARED = 8;

export interface SavedSimulationsState {
  /** Oldest first. */
  list: readonly SavedSimulationMeta[];
  loaded: boolean;
  /** Compared simulations: id → colour slot (0..MAX_COMPARED-1). A slot stays with its simulation while selected. */
  selected: ReadonlyMap<string, number>;
  /** Series of the selected simulations, read from the store when selected. */
  data: ReadonlyMap<string, SavedSimulation>;
  /** Id of the simulation saved from the current run (the Save button turns into "Saved"). */
  savedRunId: number | null;
  error: string | null;
}

type Listener = () => void;

const copy = (a: ArrayLike<number>) => Float64Array.from(a);

const newId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

/** Saved simulations and the comparison selection; React binds with useSyncExternalStore. */
export class SavedSimulations {
  private state: SavedSimulationsState = {
    list: [],
    loaded: false,
    selected: new Map(),
    data: new Map(),
    savedRunId: null,
    error: null,
  };
  private listeners = new Set<Listener>();
  private readonly store: SavedSimulationStore;

  constructor(store: SavedSimulationStore) {
    this.store = store;
  }

  getState = (): SavedSimulationsState => this.state;

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private set(patch: Partial<SavedSimulationsState>): void {
    this.state = { ...this.state, ...patch };
    for (const l of this.listeners) l();
  }

  private async guard<T>(work: () => Promise<T>): Promise<T | undefined> {
    try {
      const out = await work();
      if (this.state.error) this.set({ error: null });
      return out;
    } catch (err) {
      this.set({ error: err instanceof Error ? err.message : String(err) });
      return undefined;
    }
  }

  async load(): Promise<void> {
    await this.guard(async () => this.set({ list: await this.store.list(), loaded: true }));
  }

  /**
   * Saves the controller's finished run under `name`. Returns the new id, or null when there is no finished run
   * (only completed runs are saved: an aborted one would compare a part against a whole).
   */
  async saveRun(controller: SimulationController, name: string, now = new Date()): Promise<string | null> {
    const s = controller.getState();
    if (s.status !== 'completed' || !s.request || !s.run || !s.result) return null;
    const v = controller.series.view();
    const f = controller.fatigue.length > 0 ? controller.fatigue.view() : null;
    const series = {} as SavedSimulation['series'];
    for (const k of SAVED_SERIES_KEYS) series[k] = copy(v[k]);
    let fatigue: SavedSimulation['fatigue'] = null;
    if (f) {
      fatigue = {} as NonNullable<SavedSimulation['fatigue']>;
      for (const k of SAVED_FATIGUE_KEYS) fatigue[k] = copy(f[k]);
    }
    const sim: SavedSimulation = {
      id: newId(),
      name: name.trim() || now.toLocaleString(),
      savedAt: now.toISOString(),
      request: s.request,
      run: s.run,
      result: s.result,
      samples: series.timeMs.length,
      series,
      fatigue,
      axonEvents: controller.axonEvents,
    };
    try {
      await this.store.put(sim);
    } catch (err) {
      // e.g. the browser's storage quota
      this.set({ error: err instanceof Error ? err.message : String(err) });
      return null;
    }
    this.set({ list: [...this.state.list, metaOf(sim)], savedRunId: s.runId, error: null });
    // a run worth saving is usually one to compare: select it at once (when a colour is free)
    await this.select(sim.id, true, sim);
    return sim.id;
  }

  async rename(id: string, name: string): Promise<void> {
    const trimmed = name.trim();
    if (!trimmed) return;
    await this.guard(async () => {
      await this.store.rename(id, trimmed);
      const data = new Map(this.state.data);
      const d = data.get(id);
      if (d) data.set(id, { ...d, name: trimmed });
      this.set({ list: this.state.list.map((m) => (m.id === id ? { ...m, name: trimmed } : m)), data });
    });
  }

  async remove(id: string): Promise<void> {
    await this.guard(async () => {
      await this.store.remove(id);
      const selected = new Map(this.state.selected);
      const data = new Map(this.state.data);
      selected.delete(id);
      data.delete(id);
      this.set({ list: this.state.list.filter((m) => m.id !== id), selected, data });
    });
  }

  /** Adds to or removes from the comparison. Returns false when every colour is taken. */
  async select(id: string, on: boolean, known?: SavedSimulation): Promise<boolean> {
    const selected = new Map(this.state.selected);
    if (!on) {
      selected.delete(id);
      const data = new Map(this.state.data);
      data.delete(id);
      this.set({ selected, data });
      return true;
    }
    if (selected.has(id)) return true;
    const used = new Set(selected.values());
    const slot = Array.from({ length: MAX_COMPARED }, (_, i) => i).find((i) => !used.has(i));
    if (slot === undefined) return false;
    selected.set(id, slot);
    this.set({ selected });
    const sim = known ?? (await this.guard(() => this.store.get(id)));
    if (!sim) return false;
    // deselected while it was being read: keep it out
    if (!this.state.selected.has(id)) return false;
    this.set({ data: new Map(this.state.data).set(id, sim) });
    return true;
  }

  /** The export file of the given simulations (all saved ones by default). */
  async exportJson(ids: readonly string[] = this.state.list.map((m) => m.id)): Promise<string | null> {
    const sims = await this.guard(async () => {
      const out: SavedSimulation[] = [];
      for (const id of ids) {
        const sim = this.state.data.get(id) ?? (await this.store.get(id));
        if (sim) out.push(sim);
      }
      return out;
    });
    return sims ? JSON.stringify(toExportFile(sims)) : null;
  }

  /** Imports an export file; a simulation already saved (same id) is kept as it is. Returns how many were added. */
  async importJson(text: string): Promise<number> {
    const added = await this.guard(async () => {
      const sims = parseExportFile(text);
      const known = new Set(this.state.list.map((m) => m.id));
      const fresh = sims.filter((s) => !known.has(s.id));
      for (const s of fresh) await this.store.put(s);
      this.set({ list: [...this.state.list, ...fresh.map(metaOf)].sort((a, b) => a.savedAt.localeCompare(b.savedAt)) });
      return fresh.length;
    });
    return added ?? 0;
  }
}
