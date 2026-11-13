import type { Localized } from '../i18n/locale';
import { tr } from '../i18n/locale';
import { FIELD_GROUPS, STIMULATION_SITE_OPTIONS, STIMULATOR_WAVEFORMS } from './formFields';
import { EFFECT_OPTIONS } from '../domain/electrode';

/** Settings that are not inputs of FIELD_GROUPS (the stimulator panel and the switches). */
const EXTRA: Record<string, Localized> = {
  stimulationSite: { 'pt-BR': 'Modo de aplicação', en: 'Application mode' },
  'stimulus.frequencyHz': { 'pt-BR': 'Frequência (Hz)', en: 'Frequency (Hz)' },
  'stimulus.pulseWidthUs': { 'pt-BR': 'Largura de pulso (µs)', en: 'Pulse width (µs)' },
  'stimulus.amplitude': { 'pt-BR': 'Amplitude (u.m. ou mA calibrado)', en: 'Amplitude (m.u. or calibrated mA)' },
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
  // the Electrode section of the stimulator panel
  'electrode.shape': { 'pt-BR': 'Formato do eletrodo', en: 'Electrode shape' },
  'electrode.widthCm': { 'pt-BR': 'Largura do eletrodo (cm)', en: 'Electrode width (cm)' },
  'electrode.lengthCm': { 'pt-BR': 'Comprimento do eletrodo (cm)', en: 'Electrode length (cm)' },
  'electrode.diameterCm': { 'pt-BR': 'Diâmetro do eletrodo (cm)', en: 'Electrode diameter (cm)' },
  'electrode.fatThicknessCm': { 'pt-BR': 'Gordura subcutânea (cm)', en: 'Subcutaneous fat (cm)' },
  'electrode.axonDepthCm': { 'pt-BR': 'Profundidade do axônio (cm)', en: 'Axon depth (cm)' },
  'electrode.effectModel': { 'pt-BR': 'Efeito do eletrodo', en: 'Electrode effect' },
  calibrationEnabled: { 'pt-BR': 'Calibração em mA', en: 'Calibration in mA' },
  'electrode.calibration.motorThresholdMa': { 'pt-BR': 'Limiar motor medido (mA)', en: 'Measured motor threshold (mA)' },
  'electrode.calibration.fullRecruitmentMa': { 'pt-BR': 'Recrutamento total medido (mA)', en: 'Measured full recruitment (mA)' },
  'electrode.calibration.pulseWidthUs': { 'pt-BR': 'Largura de pulso da medida (µs)', en: 'Pulse width of the measurement (µs)' },
  'electrode.calibration.electrodeAreaCm2': { 'pt-BR': 'Área do eletrodo da medida (cm²)', en: 'Area of the measurement electrode (cm²)' },
  'centralDrive.electrodeFraction': { 'pt-BR': 'Posição do eletrodo no axônio', en: 'Electrode position on the axon' },
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
  if (key === 'electrode.shape') return raw === 'ROUND' ? tr({ 'pt-BR': 'Redondo', en: 'Round' }) : tr({ 'pt-BR': 'Retangular', en: 'Rectangular' });
  if (key === 'electrode.effectModel') {
    const o = EFFECT_OPTIONS.find((x) => x.value === raw);
    return o ? tr(o.label) : raw;
  }
  for (const g of FIELD_GROUPS) {
    const f = g.fields.find((x) => x.path === key);
    if (f && f.kind === 'select' && f.options) return f.options.find((o) => o.value === raw)?.label ?? raw;
  }
  return raw;
}
