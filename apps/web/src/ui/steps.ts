import type { FieldPath } from '../application/formModel';
import type { GroupId } from './formFields';

/** The four steps of the app, in order: each one's settings live in the left sidebar, its visual in the centre. */
export type StepId = 'stimulator' | 'physiology' | 'simulation' | 'results';

export interface Step {
  id: StepId;
  number: number;
  label: string;
  /** What the centre column shows for this step. */
  visual: string;
}

export const STEPS: readonly Step[] = [
  { id: 'stimulator', number: 1, label: 'Estimulador', visual: 'osciloscópio' },
  { id: 'physiology', number: 2, label: 'Fisiologia', visual: 'equações' },
  { id: 'simulation', number: 3, label: 'Simulação', visual: 'diagrama' },
  { id: 'results', number: 4, label: 'Resultados', visual: 'gráficos' },
];

/** Sidebar groups of each step (the stimulus itself is the stimulator step's own panel). */
export const GROUPS_BY_STEP: Record<StepId, readonly GroupId[]> = {
  stimulator: [],
  // in the order of the equations they change: 2a (drive, motoneuron), 3 and 8b (muscle), 5b (calibration), 7/8b (condition)
  physiology: ['drive', 'motoneuron', 'muscle', 'model', 'condition'],
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
