import type { FieldPath } from '../application/formModel';
import type { GroupId } from './formFields';
import type { Localized } from '../i18n/locale';
import { tr } from '../i18n/locale';
import { withTexts } from '../i18n/lazy';

/** The four steps of the app, in order: each one's settings live in the left sidebar, its visual in the centre. */
export type StepId = 'stimulator' | 'physiology' | 'simulation' | 'results';

export interface Step {
  id: StepId;
  number: number;
  label: string;
  /** What the centre column shows for this step. */
  visual: string;
}

const step = (base: Omit<Step, 'label' | 'visual'>, label: Localized, visual: Localized): Step => withTexts(base, { label, visual });

/** Labels follow the current locale (read on access). */
export const STEPS: readonly Step[] = [
  step({ id: 'stimulator', number: 1 }, { 'pt-BR': 'Estimulador', en: 'Stimulator' }, { 'pt-BR': 'osciloscópio', en: 'oscilloscope' }),
  step({ id: 'physiology', number: 2 }, { 'pt-BR': 'Fisiologia', en: 'Physiology' }, { 'pt-BR': 'equações', en: 'equations' }),
  step({ id: 'simulation', number: 3 }, { 'pt-BR': 'Simulação', en: 'Simulation' }, { 'pt-BR': 'diagrama', en: 'diagram' }),
  step({ id: 'results', number: 4 }, { 'pt-BR': 'Resultados', en: 'Results' }, { 'pt-BR': 'gráficos', en: 'charts' }),
];

/** "Etapa 2 de 4" / "Step 2 of 4". */
export function stepCounter(s: Step): string {
  return tr({ 'pt-BR': `Etapa ${s.number} de ${STEPS.length}`, en: `Step ${s.number} of ${STEPS.length}` });
}

/** Sidebar groups of each step (the stimulus itself is the stimulator step's own panel). */
export const GROUPS_BY_STEP: Record<StepId, readonly GroupId[]> = {
  stimulator: [],
  // the condition first (the author's choice), then in the order of the equations they change: 2c/2a (drive,
  // motoneuron), 3 and 8b (muscle), 5b (calibration)
  physiology: ['condition', 'drive', 'motoneuron', 'muscle', 'model'],
  simulation: ['simulation'],
  results: [],
};

const SIMULATION_FIELDS: ReadonlySet<string> = new Set([
  'stimulus.durationMs',
  'stimulus.stepMs',
  'outputStepMs',
  'seed',
]);

/** The step where a field (or a server error path) is set. */
export function stepOfField(path: FieldPath | string): StepId {
  if (SIMULATION_FIELDS.has(path)) return 'simulation';
  if (path === 'stimulationSite' || path.startsWith('stimulus.')) return 'stimulator';
  return 'physiology';
}

export function nextStep(step: StepId): Step | null {
  const i = STEPS.findIndex((s) => s.id === step);
  return STEPS[i + 1] ?? null;
}
