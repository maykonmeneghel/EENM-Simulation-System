import { describe, expect, it } from 'vitest';
import { defaultFormValues } from './formModel';
import { changedStage } from './physiologyStages';
import { texSpan } from '../ui/stageTex';

describe('changedStage', () => {
  const base = defaultFormValues();
  it('maps each physiology setting to the equation it changes', () => {
    expect(changedStage(base, { ...base, calibrationTarget: 'SINGLE_UNIT' })).toEqual({ stage: '5b', change: 'Calibração do twitch: unidade isolada' });
    expect(changedStage(base, { ...base, axonLengthPercent: '60' })?.stage).toBe('3');
    expect(changedStage(base, { ...base, 'centralDrive.voluntaryNa': '5' })?.stage).toBe('2c');
    expect(changedStage(base, { ...base, temperatureCelsius: '30' })?.stage).toBe('2a');
  });
  it('a toggled condition adjustment points at its own stage', () => {
    const sci = { ...base, condition: 'SCI_CHRONIC', conditionAdjustments: ['SCI_FATIGABILITY'] };
    expect(changedStage(sci, { ...sci, conditionAdjustments: ['SCI_FATIGABILITY', 'SCI_CHRONAXIE'] })?.stage).toBe('2b');
    expect(changedStage(sci, { ...sci, conditionAdjustments: [] })).toEqual({ stage: '7', change: 'SCI_FATIGABILITY: desligado' });
  });
  it('ignores settings of the other steps', () => {
    expect(changedStage(base, { ...base, 'stimulus.frequencyHz': '20' })).toBeNull();
    expect(changedStage(base, base)).toBeNull();
  });
});

describe('stages of each mode', () => {
  it('the motoneuron of the drive (2c) replaces the inherited one (2a) and joins the axon layer non-invasively', async () => {
    const { stagesFor } = await import('../domain/modelEquations');
    expect(stagesFor('LITERATURE', 'SKIN_SURFACE')).not.toContain('2c');
    expect(stagesFor('LITERATURE', 'MOTONEURON_POOL')).toContain('2a');
    expect(stagesFor('LITERATURE', 'MOTONEURON_POOL', true)).toEqual(expect.arrayContaining(['2c']));
    expect(stagesFor('LITERATURE', 'MOTONEURON_POOL', true)).not.toContain('2a');
    expect(stagesFor('LITERATURE', 'SKIN_SURFACE', true).slice(0, 3)).toEqual(['1', '2c', '2b']);
  });
});

describe('condition effects in the equations', () => {
  it('each adjustment shows in the stage it changes', async () => {
    const { buildModelSnapshot } = await import('./modelView');
    const { buildStageContents } = await import('../ui/stageTex');
    const values = {
      ...defaultFormValues(),
      condition: 'SCI_CHRONIC',
      conditionAdjustments: ['SCI_FATIGABILITY', 'SCI_FAST_TWITCH', 'SCI_ATROPHY', 'SCI_CHRONAXIE'],
    };
    const stages = Object.fromEntries(buildStageContents(buildModelSnapshot({ values, muscles: [] })).map((s) => [s.id, s]));
    expect(stages['2b']!.condition?.[0]).toMatch(/τ = 0,13 ms/);
    expect(stages['5b']!.condition?.[0]).toMatch(/× 0,86/);
    expect(stages['7']!.condition?.[0]).toMatch(/0,997/);
    expect(stages['8b']!.condition?.[0]).toMatch(/× 0,557/);
    expect(stages['8b']!.substituted.join(' ')).toMatch(/s = /);
    const normal = buildStageContents(buildModelSnapshot({ values: defaultFormValues(), muscles: [] }));
    expect(normal.every((s) => s.condition === undefined)).toBe(true);
  });
  it('a changed condition points at its first default adjustment', () => {
    const base = defaultFormValues();
    expect(changedStage(base, { ...base, condition: 'SCI_CHRONIC', conditionAdjustments: ['SCI_FATIGABILITY'] })).toEqual({
      stage: '7',
      change: 'Condição: Lesão medular crônica',
    });
  });
});

describe('electrode position in the equations', () => {
  it('stage 3 splits the conduction delay at the electrode and changes with the position', async () => {
    const { buildModelSnapshot } = await import('./modelView');
    const { buildStageContents } = await import('../ui/stageTex');
    const drive = { ...defaultFormValues(), driveEnabled: true, stimulationSite: 'SKIN_SURFACE' as const };
    const stage3 = (f: string) =>
      buildStageContents(buildModelSnapshot({ values: { ...drive, 'centralDrive.electrodeFraction': f }, muscles: [] })).find(
        (s) => s.id === '3',
      )!;
    const near = stage3('0.5');
    const far = stage3('0.9');
    expect(changedStage(drive, { ...drive, 'centralDrive.electrodeFraction': '0.5' })?.stage).toBe('3');
    expect(near.symbolic.join(' ')).toMatch(/eletrodo/);
    expect(near.substituted).toContain('f = 0{,}5');
    expect(near.substituted.join(' ')).not.toBe(far.substituted.join(' '));
    // the two parts add up to the whole delay: f = 0.9 puts 0.1 of it after the electrode
    const lit = buildModelSnapshot({ values: drive, muscles: [] }).typeSpans.S.delayMs!;
    expect(far.substituted.join(' ')).toContain(`\\Delta_2 = ${texSpan({ from: lit.from * 0.1, to: lit.to * 0.1 }, 2)}`);
  });
  it('without the drive or in the invasive mode stage 3 has no electrode split', async () => {
    const { buildModelSnapshot } = await import('./modelView');
    const { buildStageContents } = await import('../ui/stageTex');
    for (const values of [
      defaultFormValues(),
      { ...defaultFormValues(), driveEnabled: true, stimulationSite: 'MOTONEURON_POOL' as const },
    ]) {
      const s3 = buildStageContents(buildModelSnapshot({ values, muscles: [] })).find((s) => s.id === '3')!;
      expect(s3.symbolic.join(' ')).not.toMatch(/eletrodo/);
    }
  });
});
