import type { Localized } from '../i18n/locale';
import { tr } from '../i18n/locale';
import { FIELD_GROUPS, STIMULATION_SITE_OPTIONS, STIMULATOR_WAVEFORMS } from './formFields';

/** Settings that are not inputs of FIELD_GROUPS (the stimulator panel and the switches). */
const EXTRA: Record<string, Localized> = {
  stimulationSite: { 'pt-BR': 'Modo de aplicação', en: 'Application mode' },
  'stimulus.frequencyHz': { 'pt-BR': 'Frequência (Hz)', en: 'Frequency (Hz)' },
  'stimulus.pulseWidthUs': { 'pt-BR': 'Largura de pulso (µs)', en: 'Pulse width (µs)' },
  'stimulus.amplitude': { 'pt-BR': 'Amplitude (u.m.)', en: 'Amplitude (m.u.)' },
  'stimulus.waveform': { 'pt-BR': 'Forma de onda', en: 'Waveform' },
  'stimulus.dutyCyclePercent': { 'pt-BR': 'Ciclo de trabalho (%)', en: 'Duty cycle (%)' },
  trainsEnabled: { 'pt-BR': 'Trens', en: 'Trains' },
  'stimulus.trainOnMs': { 'pt-BR': 'Tempo ligado (ms)', en: 'On time (ms)' },
  'stimulus.trainOffMs': { 'pt-BR': 'Tempo desligado (ms)', en: 'Off time (ms)' },
  'stimulus.rampUpMs': { 'pt-BR': 'Rampa de subida (ms)', en: 'Ramp up (ms)' },
  'stimulus.rampDownMs': { 'pt-BR': 'Rampa de descida (ms)', en: 'Ramp down (ms)' },
  driveEnabled: { 'pt-BR': 'Drive central', en: 'Central drive' },
  manualUnits: { 'pt-BR': 'Unidades por tipo manuais', en: 'Manual units per type' },
  conditionAdjustments: { 'pt-BR': 'Ajustes da condição', en: 'Condition adjustments' },
};

/** Label of a form field (current locale); the raw path when it has none. */
export function fieldLabel(key: string): string {
  const extra = EXTRA[key];
  if (extra) return tr(extra);
  for (const g of FIELD_GROUPS) {
    const f = g.fields.find((x) => x.path === key);
    if (f) return 'unit' in f && f.unit ? `${f.label} (${f.unit})` : f.label;
  }
  return key;
}

/** A value as the form shows it: an option's label for a select, the number otherwise. */
export function fieldValue(key: string, raw: string, muscleLabel?: (id: string) => string): string {
  if (key === 'muscle' && muscleLabel) return muscleLabel(raw);
  if (key === 'stimulationSite') return STIMULATION_SITE_OPTIONS.find((o) => o.value === raw)?.label ?? raw;
  if (key === 'stimulus.waveform') return STIMULATOR_WAVEFORMS.find((o) => o.value === raw)?.label ?? raw;
  for (const g of FIELD_GROUPS) {
    const f = g.fields.find((x) => x.path === key);
    if (f && f.kind === 'select' && f.options) return f.options.find((o) => o.value === raw)?.label ?? raw;
  }
  return raw;
}
