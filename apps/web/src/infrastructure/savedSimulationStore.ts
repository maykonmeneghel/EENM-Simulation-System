import type { SavedSimulation, SavedSimulationMeta } from '../domain/savedSimulation';
import { metaOf } from '../domain/savedSimulation';

/** Where saved simulations live. The list reads only the small part; the series are read when compared. */
export interface SavedSimulationStore {
  list(): Promise<SavedSimulationMeta[]>;
  get(id: string): Promise<SavedSimulation | null>;
  put(sim: SavedSimulation): Promise<void>;
  rename(id: string, name: string): Promise<void>;
  remove(id: string): Promise<void>;
}

const DB_NAME = 'eenm';
const DB_VERSION = 1;
/** Two stores so listing does not load megabytes of series: `meta` (list) and `data` (series, by the same id). */
const META = 'simulation-meta';
const DATA = 'simulation-data';

type Data = Pick<SavedSimulation, 'id' | 'series' | 'fatigue' | 'axonEvents'>;

const done = <T>(req: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'));
  });

const committed = (tx: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
  });

/** The browser's IndexedDB (kept on this computer, in this browser profile). */
export class IndexedDbSavedSimulationStore implements SavedSimulationStore {
  private db: Promise<IDBDatabase> | null = null;
  private readonly factory: IDBFactory;

  constructor(factory: IDBFactory = indexedDB) {
    this.factory = factory;
  }

  private open(): Promise<IDBDatabase> {
    this.db ??= new Promise((resolve, reject) => {
      const req = this.factory.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(META)) db.createObjectStore(META, { keyPath: 'id' });
        if (!db.objectStoreNames.contains(DATA)) db.createObjectStore(DATA, { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error('IndexedDB could not be opened'));
    });
    return this.db;
  }

  async list(): Promise<SavedSimulationMeta[]> {
    const db = await this.open();
    const all = await done(db.transaction(META).objectStore(META).getAll() as IDBRequest<SavedSimulationMeta[]>);
    return all.sort((a, b) => a.savedAt.localeCompare(b.savedAt));
  }

  async get(id: string): Promise<SavedSimulation | null> {
    const db = await this.open();
    const tx = db.transaction([META, DATA]);
    const [meta, data] = await Promise.all([
      done(tx.objectStore(META).get(id) as IDBRequest<SavedSimulationMeta | undefined>),
      done(tx.objectStore(DATA).get(id) as IDBRequest<Data | undefined>),
    ]);
    return meta && data ? { ...meta, series: data.series, fatigue: data.fatigue, axonEvents: data.axonEvents } : null;
  }

  async put(sim: SavedSimulation): Promise<void> {
    const db = await this.open();
    const tx = db.transaction([META, DATA], 'readwrite');
    tx.objectStore(META).put(metaOf(sim));
    tx.objectStore(DATA).put({ id: sim.id, series: sim.series, fatigue: sim.fatigue, axonEvents: sim.axonEvents } satisfies Data);
    await committed(tx);
  }

  async rename(id: string, name: string): Promise<void> {
    const db = await this.open();
    const tx = db.transaction(META, 'readwrite');
    const store = tx.objectStore(META);
    const meta = (await done(store.get(id) as IDBRequest<SavedSimulationMeta | undefined>)) ?? null;
    if (meta) store.put({ ...meta, name });
    await committed(tx);
  }

  async remove(id: string): Promise<void> {
    const db = await this.open();
    const tx = db.transaction([META, DATA], 'readwrite');
    tx.objectStore(META).delete(id);
    tx.objectStore(DATA).delete(id);
    await committed(tx);
  }
}

/** In memory (tests, or a browser without IndexedDB): lost when the page closes. */
export class MemorySavedSimulationStore implements SavedSimulationStore {
  private readonly sims = new Map<string, SavedSimulation>();

  list(): Promise<SavedSimulationMeta[]> {
    return Promise.resolve([...this.sims.values()].map(metaOf).sort((a, b) => a.savedAt.localeCompare(b.savedAt)));
  }

  get(id: string): Promise<SavedSimulation | null> {
    return Promise.resolve(this.sims.get(id) ?? null);
  }

  put(sim: SavedSimulation): Promise<void> {
    this.sims.set(sim.id, sim);
    return Promise.resolve();
  }

  rename(id: string, name: string): Promise<void> {
    const s = this.sims.get(id);
    if (s) this.sims.set(id, { ...s, name });
    return Promise.resolve();
  }

  remove(id: string): Promise<void> {
    this.sims.delete(id);
    return Promise.resolve();
  }
}

/** IndexedDB when the browser has it, else memory. */
export function defaultSavedSimulationStore(): SavedSimulationStore {
  return typeof indexedDB !== 'undefined' ? new IndexedDbSavedSimulationStore(indexedDB) : new MemorySavedSimulationStore();
}
