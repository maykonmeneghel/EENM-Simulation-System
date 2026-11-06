import { describe, expect, it } from 'vitest';
import { savedFixture } from './savedSimulation.fixture';
import { EXPORT_FORMAT, ImportError, parseExportFile, toExportFile } from './savedSimulation';

describe('saved simulation export file', () => {
  it('round-trips every column, NaN included (JSON has no NaN: it travels as null)', () => {
    const sim = savedFixture();
    const text = JSON.stringify(toExportFile([sim], new Date('2026-11-06T12:00:00Z')));
    expect(text).toContain('"format":"eenm-simulations"');
    const [back] = parseExportFile(text);
    expect(back!.name).toBe('Run A');
    expect(back!.request).toEqual(sim.request);
    expect(Array.from(back!.series.total)).toEqual(Array.from(sim.series.total));
    expect(Number.isNaN(back!.fatigue!.FR[1])).toBe(true);
    expect(back!.samples).toBe(5);
  });

  it('names what does not fit', () => {
    expect(() => parseExportFile('nope')).toThrow(ImportError);
    expect(() => parseExportFile('{"format":"other"}')).toThrow(/not an eenm-simulations file/);
    expect(() => parseExportFile(JSON.stringify({ format: EXPORT_FORMAT, version: 2, simulations: [] }))).toThrow(/version 2/);
    const file = toExportFile([savedFixture()]);
    file.simulations[0]!.series.emg.pop();
    expect(() => parseExportFile(JSON.stringify(file))).toThrow(/series\.emg: columns of different lengths/);
    const noName = toExportFile([savedFixture()]) as unknown as { simulations: Record<string, unknown>[] };
    delete noName.simulations[0]!.name;
    expect(() => parseExportFile(JSON.stringify(noName))).toThrow(/simulations\[0\]\.name/);
  });
});
