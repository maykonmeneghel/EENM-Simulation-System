import type { SimulationRequest } from '../domain/simulation';
import { fmtNumber } from '../i18n/locale';

/** Display names of ids (they follow the catalogs' language). */
export interface RunLabels {
  muscle?(id: string): string;
  condition?(id: string): string;
}

/** Suggested name of a saved run: what tells two runs apart at a glance. */
export function suggestedName(r: SimulationRequest, labels: RunLabels = {}): string {
  const s = r.stimulus;
  const parts = [labels.muscle?.(r.muscle) ?? r.muscle, `${fmtNumber(s.frequencyHz)} Hz`];
  if (s.pulseWidthUs != null) parts.push(`${fmtNumber(s.pulseWidthUs)} µs`);
  parts.push(`A ${fmtNumber(s.amplitude)}`);
  if (r.condition !== 'NORMAL') parts.push(labels.condition?.(r.condition) ?? r.condition);
  return parts.join(' · ');
}
