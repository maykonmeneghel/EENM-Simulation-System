import type { FormValues } from './formModel';
import type { StageId } from '../domain/modelEquations';

/**
 * Which equation a physiology setting changes, so the equations view can bring it to the centre when the setting is
 * edited. The sidebar groups follow the same order as the equations (drive → 2c, motoneuron → 2a, muscle → 3 and 8b,
 * twitch calibration → 5b, condition → its adjustment's stage).
 */
const FIELD_STAGES: Readonly<Record<string, StageId>> = {
  driveEnabled: '2c',
  'centralDrive.backgroundNa': '2c',
  'centralDrive.voluntaryNa': '2c',
  'centralDrive.noiseCv': '2c',
  'centralDrive.currentScale': '2c',
  'centralDrive.thresholdRule': '2c',
  'centralDrive.tremor.frequencyHz': '2c',
  'centralDrive.tremor.amplitudeNa': '2c',
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
  PD_TREMOR: '2c',
};

const FIELD_LABELS: Readonly<Record<string, string>> = {
  driveEnabled: 'Drive central',
  'centralDrive.backgroundNa': 'Corrente de fundo',
  'centralDrive.voluntaryNa': 'Comando voluntário',
  'centralDrive.noiseCv': 'Ruído',
  'centralDrive.currentScale': 'Escala das correntes',
  'centralDrive.thresholdRule': 'Limiar do motoneurônio',
  'centralDrive.tremor.frequencyHz': 'Frequência do tremor',
  'centralDrive.tremor.amplitudeNa': 'Amplitude do tremor',
  'centralDrive.electrodeFraction': 'Posição do eletrodo',
  injectionSite: 'Local de injeção',
  somaGeometry: 'Geometria do soma',
  dendriteGeometry: 'Geometria do dendrito',
  temperatureCelsius: 'Temperatura',
  axonLengthPercent: 'Comprimento do axônio',
  muscle: 'Músculo',
  manualUnits: 'Contagens manuais',
  'unitsPerType.S': 'Unidades S',
  'unitsPerType.FR': 'Unidades FR',
  'unitsPerType.FF': 'Unidades FF',
  calibrationTarget: 'Calibração do twitch',
  condition: 'Condição',
};

const VALUE_LABELS: Readonly<Record<string, string>> = {
  true: 'ligado',
  false: 'desligado',
  WHOLE_MUSCLE: 'músculo inteiro',
  SINGLE_UNIT: 'unidade isolada',
  PUBLISHED: 'nA publicados',
  RHEOBASE: 'pela reobase',
  CISI_KOHN_2008: 'Cisi & Kohn 2008',
  WATANABE_2013: 'Watanabe 2013',
  SOMA: 'soma',
  DENDRITE: 'dendrito',
  CYLINDRICAL: 'cilíndrica',
  SPHERICAL: 'esférica',
  NORMAL: 'Normal',
  PARKINSON: 'Doença de Parkinson',
  SCI_CHRONIC: 'Lesão medular crônica',
};

export interface PhysiologyChange {
  stage: StageId;
  /** "Setting: new value", shown on the stage. */
  change: string;
}

/** The first physiology setting that differs between ``before`` and ``after``: its stage and a short description. */
export function changedStage(
  before: FormValues,
  after: FormValues,
  adjustmentLabel: (id: string) => string = (id) => id,
): PhysiologyChange | null {
  const a = before.conditionAdjustments ?? [];
  const b = after.conditionAdjustments ?? [];
  const added = b.filter((x) => !a.includes(x));
  const removed = a.filter((x) => !b.includes(x));
  if (before.condition === after.condition && added.length + removed.length > 0) {
    const id = (added[0] ?? removed[0])!;
    return { stage: ADJUSTMENT_STAGES[id] ?? '8b', change: `${adjustmentLabel(id)}: ${added.length ? 'ligado' : 'desligado'}` };
  }
  if (before.condition !== after.condition) {
    const first = added[0];
    return {
      stage: first ? (ADJUSTMENT_STAGES[first] ?? '8b') : '8b',
      change: `Condição: ${VALUE_LABELS[after.condition] ?? after.condition}`,
    };
  }
  for (const key of Object.keys(FIELD_STAGES)) {
    const v = after[key as keyof FormValues];
    if (before[key as keyof FormValues] !== v) {
      const text = String(v);
      return { stage: FIELD_STAGES[key]!, change: `${FIELD_LABELS[key] ?? key}: ${VALUE_LABELS[text] ?? text.replace('.', ',')}` };
    }
  }
  return null;
}
