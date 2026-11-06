import type { FieldPath } from '../application/formModel';
import type { Localized } from '../i18n/locale';
import { localizedRecord, withTexts } from '../i18n/lazy';
import { CALIBRATION_TARGETS, CURRENT_SCALES, GEOMETRIES, INJECTION_SITES, STIMULATION_SITES, THRESHOLD_RULES } from '../domain/simulation';

/** Presentation metadata for each input (labels and hints follow the current locale). */
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

const L = (pt: string, en: string): Localized => ({ 'pt-BR': pt, en });

const opts = <T extends string>(values: readonly T[], labels: Record<T, Localized>) =>
  values.map((v) => withTexts<{ value: T }, 'label'>({ value: v }, { label: labels[v] }));

const num = (base: Omit<NumberField, 'label' | 'hint'>, label: Localized, hint?: Localized): NumberField =>
  hint ? withTexts(base, { label, hint }) : withTexts(base, { label });

const select = (base: Omit<SelectField, 'label'>, label: Localized): SelectField => withTexts(base, { label });

const group = (base: Omit<FieldGroup, 'title'>, title: Localized): FieldGroup => withTexts(base, { title });

export const CALIBRATION_TARGET_HELP: Readonly<Record<string, string>> = localizedRecord({
  WHOLE_MUSCLE: L(
    'Twitch ajustado ao músculo inteiro (tríceps sural humano, CT 121 ms). O twitch confere; a f50 fica baixa (≈ 5 Hz contra 9,6 Hz).',
    'Twitch fitted to the whole muscle (human triceps surae, CT 121 ms). The twitch matches; f50 comes out low (≈ 5 Hz against 9.6 Hz).',
  ),
  SINGLE_UNIT: L(
    'Twitch ajustado às unidades motoras humanas isoladas (Macefield 1996, CT 75 ms). A f50 confere (≈ 9 Hz); o twitch do músculo inteiro fica rápido (CT ≈ 71 ms).',
    'Twitch fitted to single human motor units (Macefield 1996, CT 75 ms). f50 matches (≈ 9 Hz); the whole-muscle twitch comes out fast (CT ≈ 71 ms).',
  ),
});

const GEOMETRY_LABELS = { CYLINDRICAL: L('Cilíndrica', 'Cylindrical'), SPHERICAL: L('Esférica', 'Spherical') };

/** Sidebar sections. The stimulus itself is set in the Estimulador view (`STIMULATOR_FIELDS`). */
export const FIELD_GROUPS: FieldGroup[] = [
  group(
    {
      id: 'model',
      fields: [
        select(
          {
            path: 'calibrationTarget',
            kind: 'select',
            segmented: true,
            options: opts(CALIBRATION_TARGETS, {
              WHOLE_MUSCLE: L('Músculo inteiro', 'Whole muscle'),
              SINGLE_UNIT: L('Unidade isolada', 'Single unit'),
            }),
          },
          L('Calibração do twitch', 'Twitch calibration'),
        ),
      ],
    },
    L('Modelo', 'Model'),
  ),
  group({ id: 'condition', fields: [] }, L('Condição', 'Condition')),
  group(
    {
      id: 'drive',
      fields: [
        num({ path: 'centralDrive.backgroundNa', kind: 'number', stepBy: 0.5, unit: 'nA', step: 'any' }, L('Corrente de fundo', 'Background current'), L('0 – 20', '0 – 20')),
        num(
          { path: 'centralDrive.voluntaryNa', kind: 'number', stepBy: 0.5, unit: 'nA', step: 'any' },
          L('Comando voluntário', 'Voluntary command'),
          L('0 – 20 (postura: 4,5 – 5,5)', '0 – 20 (posture: 4.5 – 5.5)'),
        ),
        num({ path: 'centralDrive.noiseCv', kind: 'number', stepBy: 0.05, step: 'any' }, L('Ruído (DP / média)', 'Noise (SD / mean)'), L('0 – 2', '0 – 2')),
        select(
          {
            path: 'centralDrive.currentScale',
            kind: 'select',
            segmented: true,
            options: opts(CURRENT_SCALES, { PUBLISHED: L('nA publicados', 'published nA'), RHEOBASE: L('pela reobase', 'by rheobase') }),
          },
          L('Escala das correntes', 'Current scale'),
        ),
        select(
          {
            path: 'centralDrive.thresholdRule',
            kind: 'select',
            segmented: true,
            options: opts(THRESHOLD_RULES, {
              CISI_KOHN_2008: L('Cisi & Kohn 2008', 'Cisi & Kohn 2008'),
              WATANABE_2013: L('Watanabe 2013', 'Watanabe 2013'),
            }),
          },
          L('Limiar do motoneurônio', 'Motoneuron threshold'),
        ),
        num(
          { path: 'centralDrive.tremor.frequencyHz', kind: 'number', stepBy: 0.1, unit: 'Hz', step: 'any' },
          L('Frequência do tremor', 'Tremor frequency'),
          L('0,1 – 20', '0.1 – 20'),
        ),
        num({ path: 'centralDrive.tremor.amplitudeNa', kind: 'number', stepBy: 0.5, unit: 'nA', step: 'any' }, L('Amplitude do tremor', 'Tremor amplitude'), L('0 – 20', '0 – 20')),
        num(
          { path: 'centralDrive.electrodeFraction', kind: 'number', stepBy: 0.05, step: 'any' },
          L('Posição do eletrodo no axônio', 'Electrode position on the axon'),
          L('0,01 – 1 (do soma)', '0.01 – 1 (from the soma)'),
        ),
      ],
    },
    L('Drive central', 'Central drive'),
  ),
  group({ id: 'stimulus', fields: [] }, L('Estímulo', 'Stimulus')),
  group(
    {
      id: 'muscle',
      fields: [
        select({ path: 'muscle', kind: 'select', options: null }, L('Músculo', 'Muscle')),
        num({ path: 'unitsPerType.S', kind: 'number', stepBy: 1, step: '1' }, L('Unidades S', 'S units'), L('0 – 200', '0 – 200')),
        num({ path: 'unitsPerType.FR', kind: 'number', stepBy: 1, step: '1' }, L('Unidades FR', 'FR units'), L('0 – 200', '0 – 200')),
        num({ path: 'unitsPerType.FF', kind: 'number', stepBy: 1, step: '1' }, L('Unidades FF', 'FF units'), L('0 – 200', '0 – 200')),
        num({ path: 'axonLengthPercent', kind: 'number', stepBy: 1, unit: '%', step: 'any' }, L('Comprimento do axônio', 'Axon length'), L('1 – 100', '1 – 100')),
      ],
    },
    L('Músculo / unidades motoras', 'Muscle / motor units'),
  ),
  // shown only with the stimulus in the motoneuron pool (the compartments are simulated only then)
  group(
    {
      id: 'motoneuron',
      fields: [
        select(
          {
            path: 'injectionSite',
            kind: 'select',
            segmented: true,
            options: opts(INJECTION_SITES, { SOMA: L('Soma', 'Soma'), DENDRITE: L('Dendrito', 'Dendrite') }),
          },
          L('Local de injeção', 'Injection site'),
        ),
        select({ path: 'somaGeometry', kind: 'select', segmented: true, options: opts(GEOMETRIES, GEOMETRY_LABELS) }, L('Geometria do soma', 'Soma geometry')),
        select(
          { path: 'dendriteGeometry', kind: 'select', segmented: true, options: opts(GEOMETRIES, GEOMETRY_LABELS) },
          L('Geometria do dendrito', 'Dendrite geometry'),
        ),
        num({ path: 'temperatureCelsius', kind: 'number', stepBy: 0.1, unit: '°C', step: 'any' }, L('Temperatura', 'Temperature'), L('0 – 45', '0 – 45')),
      ],
    },
    L('Motoneurônio', 'Motoneuron'),
  ),
  group(
    {
      id: 'simulation',
      fields: [
        num({ path: 'stimulus.durationMs', kind: 'number', stepBy: 100, unit: 'ms', step: 'any' }, L('Duração', 'Duration'), L('10 – 300000', '10 – 300000')),
        num(
          { path: 'stimulus.stepMs', kind: 'number', stepBy: 0.005, unit: 'ms', step: 'any' },
          L('Passo de integração', 'Integration step'),
          L('0,005 – 0,1', '0.005 – 0.1'),
        ),
        num(
          { path: 'outputStepMs', kind: 'number', stepBy: 0.1, unit: 'ms', step: 'any' },
          L('Passo de saída', 'Output step'),
          L('múltiplo do passo, ≤ 10', 'multiple of the step, ≤ 10'),
        ),
        num({ path: 'seed', kind: 'number', stepBy: 1, step: '1' }, L('Semente', 'Seed'), L('≥ 0 (ordem de recrutamento)', '≥ 0 (recruitment order)')),
      ],
    },
    L('Simulação', 'Simulation'),
  ),
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

const control = (base: Omit<StimulatorControl, 'label' | 'hint' | 'unit'>, label: Localized, unit: Localized, hint: Localized): StimulatorControl =>
  withTexts(base, { label, unit, hint });

export const STIMULATOR_CONTROLS: Record<
  'frequency' | 'pulseWidth' | 'amplitude' | 'trainOn' | 'trainOff' | 'rampUp' | 'rampDown',
  StimulatorControl
> = {
  frequency: control({ path: 'stimulus.frequencyHz', min: 1, max: 100, step: 1 }, L('Frequência', 'Frequency'), L('Hz', 'Hz'), L('FES: 20–50 Hz', 'FES: 20–50 Hz')),
  pulseWidth: control(
    { path: 'stimulus.pulseWidthUs', min: 20, max: 1000, step: 10 },
    L('Largura de pulso', 'Pulse width'),
    L('µs', 'µs'),
    L('FES: 300–600 µs (por fase)', 'FES: 300–600 µs (per phase)'),
  ),
  amplitude: control({ path: 'stimulus.amplitude', min: 0, max: 300, step: 1 }, L('Amplitude', 'Amplitude'), L('u.m.', 'm.u.'), L('unidade do modelo', 'model unit')),
  trainOn: control({ path: 'stimulus.trainOnMs', min: 10, max: 20000, step: 10 }, L('Tempo ligado', 'On time'), L('ms', 'ms'), L('inclui as rampas', 'includes the ramps')),
  trainOff: control(
    { path: 'stimulus.trainOffMs', min: 0, max: 20000, step: 10 },
    L('Tempo desligado', 'Off time'),
    L('ms', 'ms'),
    L('repouso entre trens', 'rest between trains'),
  ),
  rampUp: control({ path: 'stimulus.rampUpMs', min: 0, max: 5000, step: 50 }, L('Rampa de subida', 'Ramp up'), L('ms', 'ms'), L('0 = início abrupto', '0 = abrupt start')),
  rampDown: control({ path: 'stimulus.rampDownMs', min: 0, max: 5000, step: 50 }, L('Rampa de descida', 'Ramp down'), L('ms', 'ms'), L('0 = fim abrupto', '0 = abrupt end')),
};

export const STIMULATION_SITE_OPTIONS = opts(STIMULATION_SITES, {
  SKIN_SURFACE: L('Não invasivo (pele)', 'Non-invasive (skin)'),
  MOTONEURON_POOL: L('Invasivo (pool)', 'Invasive (pool)'),
});

export const STIMULATION_SITE_HELP: Readonly<Record<string, string>> = localizedRecord({
  SKIN_SURFACE: L(
    'FES de superfície: a corrente excita os axônios motores sob o eletrodo (lei de Weiss). Sem drive central, o motoneurônio não é simulado. Com drive central (ou tremor), os motoneurônios de Hodgkin–Huxley disparam pelo drive e os disparos centrais encontram os do FES no axônio: colidem, são bloqueados pelo período refratário ou reiniciam o soma (Formento 2018).',
    'Surface FES: the current excites the motor axons under the electrode (Weiss law). Without a central drive, the motoneuron is not simulated. With a central drive (or tremor), the Hodgkin–Huxley motoneurons fire from the drive and the central spikes meet the FES spikes on the axon: they collide, are blocked by the refractory period, or reset the soma (Formento 2018).',
  ),
  MOTONEURON_POOL: L(
    'Aplicação direta no pool: a corrente entra no soma dos motoneurônios de dois compartimentos (Hodgkin–Huxley), somada ao drive central quando ele está ligado; os disparos dos motoneurônios vão ao músculo.',
    'Direct application to the pool: the current enters the soma of the two-compartment (Hodgkin–Huxley) motoneurons, added to the central drive when it is on; the motoneurons’ spikes go to the muscle.',
  ),
});

export const STIMULATOR_WAVEFORMS = [
  withTexts({ value: 'BIPHASIC_SYMMETRIC' as const }, { label: L('Bifásica simétrica', 'Symmetric biphasic') }),
  withTexts({ value: 'MONOPHASIC' as const }, { label: L('Monofásica', 'Monophasic') }),
] as const;
