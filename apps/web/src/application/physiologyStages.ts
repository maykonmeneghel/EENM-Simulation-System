import type { FormValues } from './formModel';
import type { StageId } from '../domain/modelEquations';

/**
 * Which equation a physiology setting changes, so the equations view can bring it to the centre when the setting is
 * edited. The sidebar groups follow the same order as the equations (drive and motoneuron → 2a, muscle → 3 and 8b,
 * twitch calibration → 5b, condition → its adjustment's stage).
 */
const FIELD_STAGES: Readonly<Record<string, StageId>> = {
  driveEnabled: '2a',
  'centralDrive.backgroundNa': '2a',
  'centralDrive.voluntaryNa': '2a',
  'centralDrive.noiseCv': '2a',
  'centralDrive.currentScale': '2a',
  'centralDrive.tremor.frequencyHz': '2a',
  'centralDrive.tremor.amplitudeNa': '2a',
  'centralDrive.electrodeFraction': '3',
  injectionSite: '2a',
  somaGeometry: '2a',
  dendriteGeometry: '2a',
  temperatureCelsius: '2a',
  axonLengthPercent: '3',
  muscle: '8b',
  manualUnits: '8b',
  'unitsPerType.S': '8b',
  'unitsPerType.FR': '8b',
  'unitsPerType.FF': '8b',
  calibrationTarget: '5b',
  condition: '8b',
};

/** Stage of each condition adjustment (``domain/conditions.py``). */
const ADJUSTMENT_STAGES: Readonly<Record<string, StageId>> = {
  SCI_FATIGABILITY: '7',
  SCI_FAST_TWITCH: '5b',
  SCI_ATROPHY: '8b',
  SCI_CHRONAXIE: '2b',
  PD_MOTOR_UNIT_LOSS: '8b',
  PD_NEUROPATHY: '8b',
  PD_TREMOR: '2a',
};

/** The stage of the first setting that differs between ``before`` and ``after``, if it is a physiology setting. */
export function changedStage(before: FormValues, after: FormValues): StageId | null {
  const a = before.conditionAdjustments ?? [];
  const b = after.conditionAdjustments ?? [];
  const toggled = [...a.filter((x) => !b.includes(x)), ...b.filter((x) => !a.includes(x))];
  if (before.condition === after.condition && toggled.length > 0) return ADJUSTMENT_STAGES[toggled[0]!] ?? '8b';
  for (const key of Object.keys(FIELD_STAGES)) {
    if (before[key as keyof FormValues] !== after[key as keyof FormValues]) return FIELD_STAGES[key]!;
  }
  return null;
}
