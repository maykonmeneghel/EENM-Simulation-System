import type { FieldError, MusclePreset, SimulationRequest } from './simulation';
import { MAX_DURATION_MS, MAX_OUTPUT_STEP_MS, MAX_UNITS_PER_TYPE, MIN_DURATION_MS } from './defaults';
import { MOTOR_UNIT_TYPES } from './simulation';

/**
 * Client-side mirror of the ranges the API enforces (docs/contracts.md §1).
 * The API remains the authority; this only gives earlier feedback.
 * Field paths use the same dotted notation as problem+json `errors[].field`.
 */
export function validateRequest(
  req: SimulationRequest,
  muscle?: MusclePreset,
): FieldError[] {
  const errors: FieldError[] = [];
  const range = (field: string, value: number, min: number, max: number) => {
    if (!Number.isFinite(value)) errors.push({ field, message: 'deve ser um número' });
    else if (value < min || value > max)
      errors.push({ field, message: `deve estar entre ${min} e ${max}` });
  };
  const integer = (field: string, value: number) => {
    if (Number.isFinite(value) && !Number.isInteger(value))
      errors.push({ field, message: 'deve ser um número inteiro' });
  };

  const s = req.stimulus;
  range('stimulus.durationMs', s.durationMs, MIN_DURATION_MS, MAX_DURATION_MS);
  range('stimulus.stepMs', s.stepMs, 0.005, 0.1);
  range('stimulus.frequencyHz', s.frequencyHz, 1, 200);
  range('stimulus.dutyCyclePercent', s.dutyCyclePercent, 1, 99);
  range('stimulus.amplitude', s.amplitude, 0, 500);

  if (s.modulation.shape === 'TRIANGLE') {
    const p = s.modulation.peakTimeMs;
    if (p === null || !Number.isFinite(p)) {
      errors.push({ field: 'stimulus.modulation.peakTimeMs', message: 'obrigatório para TRIANGLE' });
    } else if (!(p > 0 && p < s.durationMs)) {
      errors.push({
        field: 'stimulus.modulation.peakTimeMs',
        message: 'deve estar entre 0 e a duração (exclusivo)',
      });
    }
  }

  const on = s.trainOnMs;
  const period = s.trainPeriodMs;
  if ((on === null) !== (period === null)) {
    const missing = on === null ? 'stimulus.trainOnMs' : 'stimulus.trainPeriodMs';
    errors.push({ field: missing, message: 'informe a duração ligada e o período do trem juntos' });
  } else if (on !== null && period !== null) {
    if (!Number.isFinite(on) || on <= 0) {
      errors.push({ field: 'stimulus.trainOnMs', message: 'deve ser > 0' });
    } else if (Number.isFinite(period) && on > period) {
      errors.push({ field: 'stimulus.trainOnMs', message: 'deve ser ≤ período do trem' });
    }
    if (!Number.isFinite(period) || period <= 0) {
      errors.push({ field: 'stimulus.trainPeriodMs', message: 'deve ser > 0' });
    } else if (Number.isFinite(s.durationMs) && period > s.durationMs) {
      errors.push({ field: 'stimulus.trainPeriodMs', message: 'deve ser ≤ duração' });
    }
  }

  if (req.unitsPerType) {
    let sum = 0;
    for (const type of MOTOR_UNIT_TYPES) {
      const field = `unitsPerType.${type}`;
      const value = req.unitsPerType[type];
      const max = Math.min(MAX_UNITS_PER_TYPE, muscle?.poolSize[type] ?? MAX_UNITS_PER_TYPE);
      range(field, value, 0, max);
      integer(field, value);
      if (Number.isFinite(value)) sum += value;
    }
    if (sum < 1) errors.push({ field: 'unitsPerType', message: 'pelo menos uma unidade motora' });
  }

  range('axonLengthPercent', req.axonLengthPercent, 1, 100);
  range('temperatureCelsius', req.temperatureCelsius, 0, 45);

  if (!Number.isFinite(req.seed)) errors.push({ field: 'seed', message: 'deve ser um número' });
  else if (req.seed < 0) errors.push({ field: 'seed', message: 'deve ser ≥ 0' });
  integer('seed', req.seed);

  const out = req.outputStepMs;
  if (!Number.isFinite(out)) {
    errors.push({ field: 'outputStepMs', message: 'deve ser um número' });
  } else if (out > MAX_OUTPUT_STEP_MS) {
    errors.push({ field: 'outputStepMs', message: `deve ser ≤ ${MAX_OUTPUT_STEP_MS}` });
  } else if (Number.isFinite(s.stepMs) && s.stepMs > 0) {
    const ratio = out / s.stepMs;
    if (out < s.stepMs - 1e-12) {
      errors.push({ field: 'outputStepMs', message: 'deve ser ≥ passo de integração' });
    } else if (Math.abs(ratio - Math.round(ratio)) > 1e-6) {
      errors.push({ field: 'outputStepMs', message: 'deve ser múltiplo do passo de integração' });
    }
  }

  return errors;
}

/** Group field errors by path (several messages may target one field). */
export function groupFieldErrors(errors: readonly FieldError[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const e of errors) (out[e.field] ??= []).push(e.message);
  return out;
}
