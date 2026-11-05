import type { FieldPath } from '../application/formModel';
import {
  GEOMETRIES,
  INJECTION_SITES,
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
}
export interface SelectField {
  path: FieldPath;
  kind: 'select';
  label: string;
  /** `null` = options come from the muscle catalog. */
  options: readonly { value: string; label: string }[] | null;
}
export type FieldSpec = NumberField | SelectField;

export interface FieldGroup {
  id: string;
  title: string;
  fields: FieldSpec[];
}

const opts = <T extends string>(values: readonly T[], labels: Record<T, string>) =>
  values.map((v) => ({ value: v, label: labels[v] }));

export const FIELD_GROUPS: FieldGroup[] = [
  {
    id: 'stimulus',
    title: 'Estímulo',
    fields: [
      { path: 'stimulus.amplitude', kind: 'number', label: 'Amplitude', unit: 'µA/cm²', step: 'any', hint: '0 – 500' },
      { path: 'stimulus.frequencyHz', kind: 'number', label: 'Frequência', unit: 'Hz', step: 'any', hint: '1 – 200' },
      { path: 'stimulus.dutyCyclePercent', kind: 'number', label: 'Ciclo de trabalho', unit: '%', step: 'any', hint: '1 – 99' },
      {
        path: 'stimulus.waveform',
        kind: 'select',
        label: 'Forma de onda',
        options: opts(WAVEFORMS, { MONOPHASIC: 'Monofásica', BIPHASIC: 'Bifásica' }),
      },
      { path: 'stimulus.durationMs', kind: 'number', label: 'Duração', unit: 'ms', step: 'any', hint: '10 – 5000' },
      { path: 'stimulus.stepMs', kind: 'number', label: 'Passo de integração', unit: 'ms', step: 'any', hint: '0,005 – 0,1' },
      { path: 'outputStepMs', kind: 'number', label: 'Passo de saída', unit: 'ms', step: 'any', hint: 'múltiplo do passo, ≤ 10' },
    ],
  },
  {
    id: 'modulation',
    title: 'Modulação',
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
        kind: 'number',
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
      { path: 'unitsPerType.S', kind: 'number', label: 'Unidades S', step: '1', hint: '0 – 50' },
      { path: 'unitsPerType.FR', kind: 'number', label: 'Unidades FR', step: '1', hint: '0 – 50' },
      { path: 'unitsPerType.FF', kind: 'number', label: 'Unidades FF', step: '1', hint: '0 – 50' },
      { path: 'axonLengthPercent', kind: 'number', label: 'Comprimento do axônio', unit: '%', step: 'any', hint: '1 – 100' },
      { path: 'seed', kind: 'number', label: 'Semente (MUAP)', step: '1', hint: '≥ 0' },
    ],
  },
  {
    id: 'motoneuron',
    title: 'Motoneurônio',
    fields: [
      {
        path: 'injectionSite',
        kind: 'select',
        label: 'Local de injeção',
        options: opts(INJECTION_SITES, { SOMA: 'Soma', DENDRITE: 'Dendrito' }),
      },
      {
        path: 'somaGeometry',
        kind: 'select',
        label: 'Geometria do soma',
        options: opts(GEOMETRIES, { CYLINDRICAL: 'Cilíndrica', SPHERICAL: 'Esférica' }),
      },
      {
        path: 'dendriteGeometry',
        kind: 'select',
        label: 'Geometria do dendrito',
        options: opts(GEOMETRIES, { CYLINDRICAL: 'Cilíndrica', SPHERICAL: 'Esférica' }),
      },
      { path: 'temperatureCelsius', kind: 'number', label: 'Temperatura', unit: '°C', step: 'any', hint: '0 – 45' },
    ],
  },
];
