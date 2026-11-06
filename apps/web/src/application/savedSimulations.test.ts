import { describe, expect, it } from 'vitest';
import { defaultRequest } from '../domain/defaults';
import { savedFixture } from '../domain/savedSimulation.fixture';
import { toExportFile } from '../domain/savedSimulation';
import type { ApiClient } from '../infrastructure/apiClient';
import { MemorySavedSimulationStore } from '../infrastructure/savedSimulationStore';
import { MAX_COMPARED, SavedSimulations } from './savedSimulations';
import { SimulationController } from './simulationController';

/** A controller whose run streams three samples and completes (or stops before completing). */
async function finishedRun(complete = true): Promise<SimulationController> {
  const api: ApiClient = {
    getMuscles: async () => [],
    getConditions: async () => [],
    async *streamSimulation(r) {
      yield { type: 'started', simulationId: 'x', durationMs: 10, outputStepMs: 1, motorUnits: { S: 1, FR: 1, FF: 1 }, muscle: r.muscle, maxForce: 4 };
      const z = [0, 0, 0];
      yield { type: 'chunk', progress: 1, timeMs: [0, 1, 2], stimulus: z, force: { total: [0, 2, 4], S: z, FR: z, FF: z }, emg: z, fatigue: { timeMs: 2, muscle: 0.95, S: 1, FR: null, FF: 0.9 } };
      if (complete) yield { type: 'completed', elapsedSeconds: 0.1, summary: { peakForce: 4, meanForce: 2, timeToPeakMs: 2 } };
    },
  };
  const c = new SimulationController(api);
  await c.start(defaultRequest('LITERATURE'));
  return c;
}

const saved = async (n: number) => {
  const s = new SavedSimulations(new MemorySavedSimulationStore());
  const ids: string[] = [];
  for (let i = 0; i < n; i++) ids.push((await s.saveRun(await finishedRun(), `run ${i}`))!);
  return { s, ids };
};

describe('SavedSimulations', () => {
  it('saves a completed run with its series and fatigue, and ticks it for comparison', async () => {
    const s = new SavedSimulations(new MemorySavedSimulationStore());
    const c = await finishedRun();
    const id = await s.saveRun(c, '  TA 40 Hz  ');
    expect(id).not.toBeNull();
    const state = s.getState();
    expect(state.list.map((m) => m.name)).toEqual(['TA 40 Hz']);
    expect(state.savedRunId).toBe(c.getState().runId);
    expect(state.selected.get(id!)).toBe(0);
    const sim = state.data.get(id!)!;
    expect(Array.from(sim.series.total)).toEqual([0, 2, 4]);
    expect(Array.from(sim.fatigue!.muscle)).toEqual([0.95]);
    // (the buffer is pre-sized for the announced 10 ms) a copy that owns just its samples: a view of the controller's buffer would drag its whole pre-sized
    // capacity into IndexedDB, and would change with the next run
    expect(sim.series.total.buffer.byteLength).toBe(3 * 8);
    c.series.reset();
    expect(Array.from(s.getState().data.get(id!)!.series.total)).toEqual([0, 2, 4]);
  });

  it('does not save a run that did not complete', async () => {
    const s = new SavedSimulations(new MemorySavedSimulationStore());
    expect(await s.saveRun(await finishedRun(false), 'partial')).toBeNull();
    expect(s.getState().list).toEqual([]);
  });

  it(`gives each compared simulation its own colour slot (at most ${MAX_COMPARED}); a freed slot is reused, the others keep theirs`, async () => {
    const { s, ids } = await saved(MAX_COMPARED + 1);
    const slots = s.getState().selected;
    expect(slots.size).toBe(MAX_COMPARED);
    expect(slots.has(ids[MAX_COMPARED]!)).toBe(false); // every colour taken
    expect(await s.select(ids[MAX_COMPARED]!, true)).toBe(false);
    await s.select(ids[2]!, false);
    expect(await s.select(ids[MAX_COMPARED]!, true)).toBe(true);
    expect(s.getState().selected.get(ids[MAX_COMPARED]!)).toBe(2);
    expect(s.getState().selected.get(ids[3]!)).toBe(3);
    expect(s.getState().data.has(ids[2]!)).toBe(false);
  });

  it('renames and removes (a removed simulation leaves the comparison)', async () => {
    const { s, ids } = await saved(2);
    await s.rename(ids[0]!, 'Baseline');
    expect(s.getState().list[0]!.name).toBe('Baseline');
    expect(s.getState().data.get(ids[0]!)!.name).toBe('Baseline');
    await s.remove(ids[1]!);
    expect(s.getState().list.map((m) => m.id)).toEqual([ids[0]]);
    expect(s.getState().selected.has(ids[1]!)).toBe(false);
  });

  it('exports and imports; an id already saved is not duplicated; a bad file is reported', async () => {
    const { s } = await saved(2);
    const json = (await s.exportJson())!;
    expect(JSON.parse(json).simulations).toHaveLength(2);
    expect(await s.importJson(json)).toBe(0);
    expect(await s.importJson(JSON.stringify(toExportFile([savedFixture({ id: 'other' })])))).toBe(1);
    expect(s.getState().list).toHaveLength(3);
    expect(await s.importJson('{}')).toBe(0);
    expect(s.getState().error).toMatch(/not an eenm-simulations file/);
  });
});
