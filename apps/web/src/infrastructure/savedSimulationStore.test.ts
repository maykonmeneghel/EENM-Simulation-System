import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { savedFixture } from '../domain/savedSimulation.fixture';
import { IndexedDbSavedSimulationStore, MemorySavedSimulationStore } from './savedSimulationStore';

describe.each([
  ['IndexedDB', () => new IndexedDbSavedSimulationStore(new IDBFactory())],
  ['memory', () => new MemorySavedSimulationStore()],
])('%s saved-simulation store', (_name, make) => {
  it('lists without the series, reads them back, renames and removes', async () => {
    const store = make();
    await store.put(savedFixture({ id: 'b', name: 'B', savedAt: '2026-11-06T11:00:00.000Z' }));
    await store.put(savedFixture({ id: 'a', name: 'A' }));
    const list = await store.list();
    expect(list.map((m) => m.id)).toEqual(['a', 'b']); // oldest first
    expect('series' in list[0]!).toBe(false);
    const a = await store.get('a');
    expect(Array.from(a!.series.total)).toEqual([0, 1, 2, 3, 4]);
    expect(a!.fatigue!.muscle[1]).toBeCloseTo(0.9);
    await store.rename('a', 'Renamed');
    expect((await store.list())[0]!.name).toBe('Renamed');
    await store.remove('a');
    expect((await store.list()).map((m) => m.id)).toEqual(['b']);
    expect(await store.get('a')).toBeNull();
  });
});

it('IndexedDB keeps the simulations for the next visit (a new store on the same database)', async () => {
  const factory = new IDBFactory();
  await new IndexedDbSavedSimulationStore(factory).put(savedFixture());
  const again = await new IndexedDbSavedSimulationStore(factory).get('a');
  expect(again?.name).toBe('Run A');
});
