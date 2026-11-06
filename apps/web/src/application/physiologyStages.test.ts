import { describe, expect, it } from 'vitest';
import { defaultFormValues } from './formModel';
import { changedStage } from './physiologyStages';

describe('changedStage', () => {
  const base = defaultFormValues();
  it('maps each physiology setting to the equation it changes', () => {
    expect(changedStage(base, { ...base, calibrationTarget: 'SINGLE_UNIT' })).toBe('5b');
    expect(changedStage(base, { ...base, axonLengthPercent: '60' })).toBe('3');
    expect(changedStage(base, { ...base, 'centralDrive.voluntaryNa': '5' })).toBe('2a');
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
