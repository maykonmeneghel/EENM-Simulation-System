import type { FieldPath } from '../application/formModel';
import {
  GEOMETRIES,
  INJECTION_SITES,
  MODEL_VARIANTS,
  MODULATION_SHAPES,
  MODULATION_TARGETS,
  WAVEFORMS,
} from '../domain/simulation';

/** Presentation metadata for each input (labels in Portuguese). */
export interface NumberField {
  path: FieldPath;
  kind: 'number';
  label: string;
  unit?: string;
  step?: string;
  hint?: string;
  /** Stepper increment. */
  stepBy: number;
}
export interface SelectField {
  path: FieldPath;
  kind: 'select';
  label: string;
  /** `null` = options come from the muscle catalog. */
  options: readonly { value: string; label: string }[] | null;
  /** Render as a segmented control (small enums). */
  segmented?: boolean;
}
export type FieldSpec = NumberField | SelectField;

export type GroupId = 'model' | 'stimulus' | 'modulation' | 'muscle' | 'motoneuron';

export interface FieldGroup {
  id: GroupId;
  title: string;
  /** Less-used sections start collapsed (macOS inspector disclosure). */
  collapsed?: boolean;
  fields: FieldSpec[];
}

const opts = <T extends string>(values: readonly T[], labels: Record<T, string>) =>
  values.map((v) => ({ value: v, label: labels[v] }));

export const MODEL_VARIANT_HELP: Record<string, string> = {
  ORIGINAL: 'Modelo da dissertação portado do MATLAB sem alterações (compartimentos do motoneurônio, Hodgkin–Huxley).',
  LITERATURE:
    'Correções validadas na literatura: unidades representativas na proporção do músculo, twitch humano, ' +
    'saturação de força, estimulação dos axônios motores (Weiss) e fadiga periférica.',
};

export const FIELD_GROUPS: FieldGroup[] = [
  {
    id: 'model',
    title: 'Modelo',
    fields: [
      {
        path: 'modelVariant',
        kind: 'select',
        segmented: true,
        label: 'Modelo',
        options: opts(MODEL_VARIANTS, {
          ORIGINAL: 'Original (MATLAB fiel)',
          LITERATURE: 'Corrigido pela literatura',
        }),
      },
    ],
  },
  {
    id: 'stimulus',
    title: 'Estímulo',
    fields: [
      { path: 'stimulus.amplitude', kind: 'number', stepBy: 1, label: 'Amplitude', unit: 'µA/cm²', step: 'any', hint: '0 – 500' },
      { path: 'stimulus.frequencyHz', kind: 'number', stepBy: 1, label: 'Frequência', unit: 'Hz', step: 'any', hint: '1 – 200' },
      { path: 'stimulus.dutyCyclePercent', kind: 'number', stepBy: 0.1, label: 'Ciclo de trabalho', unit: '%', step: 'any', hint: '1 – 99' },
      {
        path: 'stimulus.waveform',
        kind: 'select',
        segmented: true,
        label: 'Forma de onda',
        options: opts(WAVEFORMS, { MONOPHASIC: 'Monofásica', BIPHASIC: 'Bifásica' }),
      },
      { path: 'stimulus.durationMs', kind: 'number', stepBy: 100, label: 'Duração', unit: 'ms', step: 'any', hint: '10 – 300000' },
      { path: 'stimulus.stepMs', kind: 'number', stepBy: 0.005, label: 'Passo de integração', unit: 'ms', step: 'any', hint: '0,005 – 0,1' },
      { path: 'outputStepMs', kind: 'number', stepBy: 0.1, label: 'Passo de saída', unit: 'ms', step: 'any', hint: 'múltiplo do passo, ≤ 10' },
      { path: 'stimulus.trainOnMs', kind: 'number', stepBy: 10, label: 'Trem ligado', unit: 'ms', step: 'any', hint: '0 < ligado ≤ período' },
      { path: 'stimulus.trainPeriodMs', kind: 'number', stepBy: 100, label: 'Período do trem', unit: 'ms', step: 'any', hint: '≤ duração' },
    ],
  },
  {
    id: 'modulation',
    title: 'Modulação',
    collapsed: true,
    fields: [
      {
        path: 'stimulus.modulation.target',
        kind: 'select',
        label: 'Parâmetro modulado',
        options: opts(MODULATION_TARGETS, {
          AMPLITUDE: 'Amplitude',
          FREQUENCY: 'Frequência',
          PULSE_WIDTH: 'Largura de pulso',
        }),
      },
      {
        path: 'stimulus.modulation.shape',
        kind: 'select',
        label: 'Forma da modulação',
        options: opts(MODULATION_SHAPES, {
          STEP: 'Degrau',
          RAMP: 'Rampa',
          TRIANGLE: 'Triangular',
          SINUSOIDAL: 'Senoidal',
        }),
      },
      {
        path: 'stimulus.modulation.peakTimeMs',
        kind: 'number', stepBy: 10,
        label: 'Instante do pico',
        unit: 'ms',
        step: 'any',
        hint: 'somente Triangular; 0 < t < duração',
      },
    ],
  },
  {
    id: 'muscle',
    title: 'Músculo / unidades motoras',
    fields: [
      { path: 'muscle', kind: 'select', label: 'Músculo', options: null },
      { path: 'unitsPerType.S', kind: 'number', stepBy: 1, label: 'Unidades S', step: '1', hint: '0 – 200' },
      { path: 'unitsPerType.FR', kind: 'number', stepBy: 1, label: 'Unidades FR', step: '1', hint: '0 – 200' },
      { path: 'unitsPerType.FF', kind: 'number', stepBy: 1, label: 'Unidades FF', step: '1', hint: '0 – 200' },
      { path: 'axonLengthPercent', kind: 'number', stepBy: 1, label: 'Comprimento do axônio', unit: '%', step: 'any', hint: '1 – 100' },
      { path: 'seed', kind: 'number', stepBy: 1, label: 'Semente (MUAP)', step: '1', hint: '≥ 0' },
    ],
  },
  {
    id: 'motoneuron',
    title: 'Motoneurônio',
    collapsed: true,
    fields: [
      {
        path: 'injectionSite',
        kind: 'select',
        segmented: true,
        label: 'Local de injeção',
        options: opts(INJECTION_SITES, { SOMA: 'Soma', DENDRITE: 'Dendrito' }),
      },
      {
        path: 'somaGeometry',
        kind: 'select',
        segmented: true,
        label: 'Geometria do soma',
        options: opts(GEOMETRIES, { CYLINDRICAL: 'Cilíndrica', SPHERICAL: 'Esférica' }),
      },
      {
        path: 'dendriteGeometry',
        kind: 'select',
        segmented: true,
        label: 'Geometria do dendrito',
        options: opts(GEOMETRIES, { CYLINDRICAL: 'Cilíndrica', SPHERICAL: 'Esférica' }),
      },
      { path: 'temperatureCelsius', kind: 'number', stepBy: 0.1, label: 'Temperatura', unit: '°C', step: 'any', hint: '0 – 45' },
    ],
  },
];
