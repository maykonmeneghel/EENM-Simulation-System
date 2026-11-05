import type { FieldPath } from '../application/formModel';
import { CALIBRATION_TARGETS } from '../domain/simulation';

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

export type GroupId = 'model' | 'stimulus' | 'muscle' | 'simulation';

export interface FieldGroup {
  id: GroupId;
  title: string;
  /** Less-used sections start collapsed (macOS inspector disclosure). */
  collapsed?: boolean;
  fields: FieldSpec[];
}

const opts = <T extends string>(values: readonly T[], labels: Record<T, string>) =>
  values.map((v) => ({ value: v, label: labels[v] }));

export const CALIBRATION_TARGET_HELP: Record<string, string> = {
  WHOLE_MUSCLE:
    'Twitch ajustado ao músculo inteiro (tríceps sural humano, CT 121 ms). O twitch confere; a f50 fica baixa (≈ 5 Hz contra 9,6 Hz).',
  SINGLE_UNIT:
    'Twitch ajustado às unidades motoras humanas isoladas (Macefield 1996, CT 75 ms). A f50 confere (≈ 9 Hz); o twitch do músculo inteiro fica rápido (CT ≈ 71 ms).',
};

/** Sidebar sections. The stimulus itself is set in the Estimulador view (`STIMULATOR_FIELDS`). */
export const FIELD_GROUPS: FieldGroup[] = [
  {
    id: 'model',
    title: 'Modelo',
    fields: [
      {
        path: 'calibrationTarget',
        kind: 'select',
        segmented: true,
        label: 'Calibração do twitch',
        options: opts(CALIBRATION_TARGETS, {
          WHOLE_MUSCLE: 'Músculo inteiro',
          SINGLE_UNIT: 'Unidade isolada',
        }),
      },
    ],
  },
  { id: 'stimulus', title: 'Estímulo', fields: [] },
  {
    id: 'muscle',
    title: 'Músculo / unidades motoras',
    fields: [
      { path: 'muscle', kind: 'select', label: 'Músculo', options: null },
      { path: 'unitsPerType.S', kind: 'number', stepBy: 1, label: 'Unidades S', step: '1', hint: '0 – 200' },
      { path: 'unitsPerType.FR', kind: 'number', stepBy: 1, label: 'Unidades FR', step: '1', hint: '0 – 200' },
      { path: 'unitsPerType.FF', kind: 'number', stepBy: 1, label: 'Unidades FF', step: '1', hint: '0 – 200' },
      { path: 'axonLengthPercent', kind: 'number', stepBy: 1, label: 'Comprimento do axônio', unit: '%', step: 'any', hint: '1 – 100' },
    ],
  },
  {
    id: 'simulation',
    title: 'Simulação',
    fields: [
      { path: 'stimulus.durationMs', kind: 'number', stepBy: 100, label: 'Duração', unit: 'ms', step: 'any', hint: '10 – 300000' },
      { path: 'stimulus.stepMs', kind: 'number', stepBy: 0.005, label: 'Passo de integração', unit: 'ms', step: 'any', hint: '0,005 – 0,1' },
      { path: 'outputStepMs', kind: 'number', stepBy: 0.1, label: 'Passo de saída', unit: 'ms', step: 'any', hint: 'múltiplo do passo, ≤ 10' },
      { path: 'seed', kind: 'number', stepBy: 1, label: 'Semente', step: '1', hint: '≥ 0 (ordem de recrutamento)' },
    ],
  },
];

/** Stimulator controls (Estimulador view). `min`/`max` drive the sliders; the API ranges are the authority. */
export interface StimulatorControl {
  path: FieldPath;
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
  /** Shown under the control. */
  hint: string;
}

export const STIMULATOR_CONTROLS: Record<
  'frequency' | 'pulseWidth' | 'amplitude' | 'trainOn' | 'trainOff' | 'rampUp' | 'rampDown',
  StimulatorControl
> = {
  frequency: { path: 'stimulus.frequencyHz', label: 'Frequência', unit: 'Hz', min: 1, max: 100, step: 1, hint: 'FES: 20–50 Hz' },
  pulseWidth: {
    path: 'stimulus.pulseWidthUs',
    label: 'Largura de pulso',
    unit: 'µs',
    min: 20,
    max: 1000,
    step: 10,
    hint: 'FES: 300–600 µs (por fase)',
  },
  amplitude: { path: 'stimulus.amplitude', label: 'Amplitude', unit: 'u.m.', min: 0, max: 300, step: 1, hint: 'unidade do modelo' },
  trainOn: { path: 'stimulus.trainOnMs', label: 'Tempo ligado', unit: 'ms', min: 10, max: 20000, step: 10, hint: 'inclui as rampas' },
  trainOff: { path: 'stimulus.trainOffMs', label: 'Tempo desligado', unit: 'ms', min: 0, max: 20000, step: 10, hint: 'repouso entre trens' },
  rampUp: { path: 'stimulus.rampUpMs', label: 'Rampa de subida', unit: 'ms', min: 0, max: 5000, step: 50, hint: '0 = início abrupto' },
  rampDown: { path: 'stimulus.rampDownMs', label: 'Rampa de descida', unit: 'ms', min: 0, max: 5000, step: 50, hint: '0 = fim abrupto' },
};

export const STIMULATOR_WAVEFORMS = [
  { value: 'BIPHASIC_SYMMETRIC', label: 'Bifásica simétrica' },
  { value: 'MONOPHASIC', label: 'Monofásica' },
] as const;
