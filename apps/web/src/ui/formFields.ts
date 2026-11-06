import type { FieldPath } from '../application/formModel';
import { CALIBRATION_TARGETS, CURRENT_SCALES, GEOMETRIES, INJECTION_SITES, STIMULATION_SITES, THRESHOLD_RULES } from '../domain/simulation';

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

export type GroupId = 'model' | 'condition' | 'drive' | 'stimulus' | 'muscle' | 'motoneuron' | 'simulation';

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
  { id: 'condition', title: 'Condição', fields: [] },
  {
    id: 'drive',
    title: 'Drive central',
    fields: [
      { path: 'centralDrive.backgroundNa', kind: 'number', stepBy: 0.5, label: 'Corrente de fundo', unit: 'nA', step: 'any', hint: '0 – 20' },
      { path: 'centralDrive.voluntaryNa', kind: 'number', stepBy: 0.5, label: 'Comando voluntário', unit: 'nA', step: 'any', hint: '0 – 20 (postura: 4,5 – 5,5)' },
      { path: 'centralDrive.noiseCv', kind: 'number', stepBy: 0.05, label: 'Ruído (DP / média)', step: 'any', hint: '0 – 2' },
      {
        path: 'centralDrive.currentScale',
        kind: 'select',
        segmented: true,
        label: 'Escala das correntes',
        options: opts(CURRENT_SCALES, { PUBLISHED: 'nA publicados', RHEOBASE: 'pela reobase' }),
      },
      {
        path: 'centralDrive.thresholdRule',
        kind: 'select',
        segmented: true,
        label: 'Limiar do motoneurônio',
        options: opts(THRESHOLD_RULES, { CISI_KOHN_2008: 'Cisi & Kohn 2008', WATANABE_2013: 'Watanabe 2013' }),
      },
      { path: 'centralDrive.tremor.frequencyHz', kind: 'number', stepBy: 0.1, label: 'Frequência do tremor', unit: 'Hz', step: 'any', hint: '0,1 – 20' },
      { path: 'centralDrive.tremor.amplitudeNa', kind: 'number', stepBy: 0.5, label: 'Amplitude do tremor', unit: 'nA', step: 'any', hint: '0 – 20' },
      { path: 'centralDrive.electrodeFraction', kind: 'number', stepBy: 0.05, label: 'Posição do eletrodo no axônio', step: 'any', hint: '0,01 – 1 (do soma)' },
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
    // shown only with the stimulus in the motoneuron pool (the compartments are simulated only then)
    id: 'motoneuron',
    title: 'Motoneurônio',
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

export const STIMULATION_SITE_OPTIONS = opts(STIMULATION_SITES, {
  SKIN_SURFACE: 'Não invasivo (pele)',
  MOTONEURON_POOL: 'Invasivo (pool)',
});

export const STIMULATION_SITE_HELP: Record<string, string> = {
  SKIN_SURFACE:
    'FES de superfície: a corrente excita os axônios motores sob o eletrodo (lei de Weiss). Sem drive central, o motoneurônio não é simulado. Com drive central (ou tremor), os motoneurônios de Hodgkin–Huxley disparam pelo drive e os disparos centrais encontram os do FES no axônio: colidem, são bloqueados pelo período refratário ou reiniciam o soma (Formento 2018).',
  MOTONEURON_POOL:
    'Aplicação direta no pool: a corrente entra no soma dos motoneurônios de dois compartimentos (Hodgkin–Huxley), somada ao drive central quando ele está ligado; os disparos dos motoneurônios vão ao músculo.',
};

export const STIMULATOR_WAVEFORMS = [
  { value: 'BIPHASIC_SYMMETRIC', label: 'Bifásica simétrica' },
  { value: 'MONOPHASIC', label: 'Monofásica' },
] as const;
