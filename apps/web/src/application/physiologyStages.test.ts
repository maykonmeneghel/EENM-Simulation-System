import { describe, expect, it } from 'vitest';
import { defaultFormValues } from './formModel';
import { changedStage } from './physiologyStages';

describe('changedStage', () => {
  const base = defaultFormValues();
  it('maps each physiology setting to the equation it changes', () => {
    expect(changedStage(base, { ...base, calibrationTarget: 'SINGLE_UNIT' })).toBe('5b');
    expect(changedStage(base, { ...base, axonLengthPercent: '60' })).toBe('3');
    expect(changedStage(base, { ...base, 'centralDrive.voluntaryNa': '5' })).toBe('2c');
    expect(changedStage(base, { ...base, temperatureCelsius: '30' })).toBe('2a');
  });
  it('a toggled condition adjustment points at its own stage', () => {
    const sci = { ...base, condition: 'SCI_CHRONIC', conditionAdjustments: ['SCI_FATIGABILITY'] };
    expect(changedStage(sci, { ...sci, conditionAdjustments: ['SCI_FATIGABILITY', 'SCI_CHRONAXIE'] })).toBe('2b');
    expect(changedStage(sci, { ...sci, conditionAdjustments: [] })).toBe('7');
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
