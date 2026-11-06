import type { FormValues } from './formModel';
import type { StageId } from '../domain/modelEquations';
import type { Localized } from '../i18n/locale';
import { decimalSeparator, tr } from '../i18n/locale';

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

const FIELD_LABELS: Readonly<Record<string, Localized>> = {
  driveEnabled: { 'pt-BR': 'Drive central', en: 'Central drive' },
  'centralDrive.backgroundNa': { 'pt-BR': 'Corrente de fundo', en: 'Background current' },
  'centralDrive.voluntaryNa': { 'pt-BR': 'Comando voluntário', en: 'Voluntary command' },
  'centralDrive.noiseCv': { 'pt-BR': 'Ruído', en: 'Noise' },
  'centralDrive.currentScale': { 'pt-BR': 'Escala das correntes', en: 'Current scale' },
  'centralDrive.thresholdRule': { 'pt-BR': 'Limiar do motoneurônio', en: 'Motoneuron threshold' },
  'centralDrive.tremor.frequencyHz': { 'pt-BR': 'Frequência do tremor', en: 'Tremor frequency' },
  'centralDrive.tremor.amplitudeNa': { 'pt-BR': 'Amplitude do tremor', en: 'Tremor amplitude' },
  'centralDrive.electrodeFraction': { 'pt-BR': 'Posição do eletrodo', en: 'Electrode position' },
  injectionSite: { 'pt-BR': 'Local de injeção', en: 'Injection site' },
  somaGeometry: { 'pt-BR': 'Geometria do soma', en: 'Soma geometry' },
  dendriteGeometry: { 'pt-BR': 'Geometria do dendrito', en: 'Dendrite geometry' },
  temperatureCelsius: { 'pt-BR': 'Temperatura', en: 'Temperature' },
  axonLengthPercent: { 'pt-BR': 'Comprimento do axônio', en: 'Axon length' },
  muscle: { 'pt-BR': 'Músculo', en: 'Muscle' },
  manualUnits: { 'pt-BR': 'Contagens manuais', en: 'Manual counts' },
  'unitsPerType.S': { 'pt-BR': 'Unidades S', en: 'S units' },
  'unitsPerType.FR': { 'pt-BR': 'Unidades FR', en: 'FR units' },
  'unitsPerType.FF': { 'pt-BR': 'Unidades FF', en: 'FF units' },
  calibrationTarget: { 'pt-BR': 'Calibração do twitch', en: 'Twitch calibration' },
  condition: { 'pt-BR': 'Condição', en: 'Condition' },
};

const VALUE_LABELS: Readonly<Record<string, Localized>> = {
  true: { 'pt-BR': 'ligado', en: 'on' },
  false: { 'pt-BR': 'desligado', en: 'off' },
  WHOLE_MUSCLE: { 'pt-BR': 'músculo inteiro', en: 'whole muscle' },
  SINGLE_UNIT: { 'pt-BR': 'unidade isolada', en: 'single unit' },
  PUBLISHED: { 'pt-BR': 'nA publicados', en: 'published nA' },
  RHEOBASE: { 'pt-BR': 'pela reobase', en: 'by rheobase' },
  CISI_KOHN_2008: { 'pt-BR': 'Cisi & Kohn 2008', en: 'Cisi & Kohn 2008' },
  WATANABE_2013: { 'pt-BR': 'Watanabe 2013', en: 'Watanabe 2013' },
  SOMA: { 'pt-BR': 'soma', en: 'soma' },
  DENDRITE: { 'pt-BR': 'dendrito', en: 'dendrite' },
  CYLINDRICAL: { 'pt-BR': 'cilíndrica', en: 'cylindrical' },
  SPHERICAL: { 'pt-BR': 'esférica', en: 'spherical' },
  NORMAL: { 'pt-BR': 'Normal', en: 'Normal' },
  PARKINSON: { 'pt-BR': 'Doença de Parkinson', en: 'Parkinson\'s disease' },
  SCI_CHRONIC: { 'pt-BR': 'Lesão medular crônica', en: 'Chronic spinal cord injury' },
};

const label = (t: Localized | undefined): string | undefined => (t ? tr(t) : undefined);

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
    return { stage: ADJUSTMENT_STAGES[id] ?? '8b', change: `${adjustmentLabel(id)}: ${tr(added.length ? VALUE_LABELS.true! : VALUE_LABELS.false!)}` };
  }
  if (before.condition !== after.condition) {
    const first = added[0];
    return {
      stage: first ? (ADJUSTMENT_STAGES[first] ?? '8b') : '8b',
      change: `${tr(FIELD_LABELS.condition!)}: ${label(VALUE_LABELS[after.condition]) ?? after.condition}`,
    };
  }
  for (const key of Object.keys(FIELD_STAGES)) {
    const v = after[key as keyof FormValues];
    if (before[key as keyof FormValues] !== v) {
      const text = String(v);
      return { stage: FIELD_STAGES[key]!, change: `${label(FIELD_LABELS[key]) ?? key}: ${label(VALUE_LABELS[text]) ?? text.replace('.', decimalSeparator())}` };
    }
  }
  return null;
}
