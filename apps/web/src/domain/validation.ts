import type { FieldError, MusclePreset, SimulationRequest } from './simulation';
import {
  MAX_DURATION_MS,
  MAX_OUTPUT_STEP_MS,
  MAX_RAMP_MS,
  MAX_UNITS_PER_TYPE,
  MIN_DURATION_MS,
  PULSE_WIDTH_US,
} from './defaults';
import { MOTOR_UNIT_TYPES } from './simulation';
import { tr } from '../i18n/locale';

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
    if (!Number.isFinite(value)) errors.push({ field, message: tr({ 'pt-BR': 'deve ser um número', en: 'must be a number' }) });
    else if (value < min || value > max)
      errors.push({ field, message: tr({ 'pt-BR': `deve estar entre ${min} e ${max}`, en: `must be between ${min} and ${max}` }) });
  };
  const integer = (field: string, value: number) => {
    if (Number.isFinite(value) && !Number.isInteger(value))
      errors.push({ field, message: tr({ 'pt-BR': 'deve ser um número inteiro', en: 'must be a whole number' }) });
  };

  const s = req.stimulus;
  range('stimulus.durationMs', s.durationMs, MIN_DURATION_MS, MAX_DURATION_MS);
  range('stimulus.stepMs', s.stepMs, 0.005, 0.1);
  range('stimulus.frequencyHz', s.frequencyHz, 1, 200);
  range('stimulus.dutyCyclePercent', s.dutyCyclePercent, 1, 99);
  range('stimulus.amplitude', s.amplitude, 0, 500);
  if (s.pulseWidthUs !== undefined && s.pulseWidthUs !== null) {
    range('stimulus.pulseWidthUs', s.pulseWidthUs, PULSE_WIDTH_US.min, PULSE_WIDTH_US.max);
    const phases = s.waveform === 'BIPHASIC_SYMMETRIC' ? 2 : 1;
    if (Number.isFinite(s.frequencyHz) && s.frequencyHz > 0 && phases * s.pulseWidthUs >= 1e6 / s.frequencyHz) {
      errors.push({
        field: 'stimulus.pulseWidthUs',
        message: phases === 2 ? tr({ 'pt-BR': 'as duas fases devem caber no período', en: 'both phases must fit in the period' }) : tr({ 'pt-BR': 'deve ser menor que o período', en: 'must be shorter than the period' }),
      });
    }
  } else if (s.waveform === 'BIPHASIC_SYMMETRIC') {
    errors.push({ field: 'stimulus.pulseWidthUs', message: tr({ 'pt-BR': 'obrigatório para bifásica simétrica', en: 'required for symmetric biphasic' }) });
  }
  const up = s.rampUpMs ?? 0;
  const down = s.rampDownMs ?? 0;
  range('stimulus.rampUpMs', up, 0, MAX_RAMP_MS);
  range('stimulus.rampDownMs', down, 0, MAX_RAMP_MS);
  const onTime = s.trainOnMs ?? s.durationMs;
  if (up + down > 0 && Number.isFinite(onTime) && up + down > onTime) {
    errors.push({ field: 'stimulus.rampUpMs', message: tr({ 'pt-BR': 'subida + descida deve caber no tempo ligado', en: 'ramp up + ramp down must fit in the on time' }) });
  }

  if (s.modulation.shape === 'TRIANGLE') {
    const p = s.modulation.peakTimeMs;
    if (p === null || !Number.isFinite(p)) {
      errors.push({ field: 'stimulus.modulation.peakTimeMs', message: tr({ 'pt-BR': 'obrigatório para TRIANGLE', en: 'required for TRIANGLE' }) });
    } else if (!(p > 0 && p < s.durationMs)) {
      errors.push({
        field: 'stimulus.modulation.peakTimeMs',
        message: tr({ 'pt-BR': 'deve estar entre 0 e a duração (exclusivo)', en: 'must be between 0 and the duration (exclusive)' }),
      });
    }
  }

  const on = s.trainOnMs;
  const period = s.trainPeriodMs;
  if ((on === null) !== (period === null)) {
    const missing = on === null ? 'stimulus.trainOnMs' : 'stimulus.trainPeriodMs';
    errors.push({ field: missing, message: tr({ 'pt-BR': 'informe a duração ligada e o período do trem juntos', en: 'give the train on time and period together' }) });
  } else if (on !== null && period !== null) {
    if (!Number.isFinite(on) || on <= 0) {
      errors.push({ field: 'stimulus.trainOnMs', message: tr({ 'pt-BR': 'deve ser > 0', en: 'must be > 0' }) });
    } else if (Number.isFinite(period) && on > period) {
      errors.push({ field: 'stimulus.trainOnMs', message: tr({ 'pt-BR': 'deve ser ≤ período do trem', en: 'must be ≤ the train period' }) });
    }
    if (!Number.isFinite(period) || period <= 0) {
      errors.push({ field: 'stimulus.trainPeriodMs', message: tr({ 'pt-BR': 'deve ser > 0', en: 'must be > 0' }) });
    } else if (Number.isFinite(s.durationMs) && period > s.durationMs) {
      errors.push({ field: 'stimulus.trainPeriodMs', message: tr({ 'pt-BR': 'deve ser ≤ duração', en: 'must be ≤ the duration' }) });
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
    if (sum < 1) errors.push({ field: 'unitsPerType', message: tr({ 'pt-BR': 'pelo menos uma unidade motora', en: 'at least one motor unit' }) });
  }

  range('axonLengthPercent', req.axonLengthPercent, 1, 100);
  range('temperatureCelsius', req.temperatureCelsius, 0, 45);

  if (!Number.isFinite(req.seed)) errors.push({ field: 'seed', message: tr({ 'pt-BR': 'deve ser um número', en: 'must be a number' }) });
  else if (req.seed < 0) errors.push({ field: 'seed', message: tr({ 'pt-BR': 'deve ser ≥ 0', en: 'must be ≥ 0' }) });
  integer('seed', req.seed);

  const out = req.outputStepMs;
  if (!Number.isFinite(out)) {
    errors.push({ field: 'outputStepMs', message: tr({ 'pt-BR': 'deve ser um número', en: 'must be a number' }) });
  } else if (out > MAX_OUTPUT_STEP_MS) {
    errors.push({ field: 'outputStepMs', message: tr({ 'pt-BR': `deve ser ≤ ${MAX_OUTPUT_STEP_MS}`, en: `must be ≤ ${MAX_OUTPUT_STEP_MS}` }) });
  } else if (Number.isFinite(s.stepMs) && s.stepMs > 0) {
    const ratio = out / s.stepMs;
    if (out < s.stepMs - 1e-12) {
      errors.push({ field: 'outputStepMs', message: tr({ 'pt-BR': 'deve ser ≥ passo de integração', en: 'must be ≥ the integration step' }) });
    } else if (Math.abs(ratio - Math.round(ratio)) > 1e-6) {
      errors.push({ field: 'outputStepMs', message: tr({ 'pt-BR': 'deve ser múltiplo do passo de integração', en: 'must be a multiple of the integration step' }) });
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
