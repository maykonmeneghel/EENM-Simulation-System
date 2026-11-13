import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { InspectorTopic } from '../application/inspectorTopics';
import type { Dispatch, SetStateAction } from 'react';
import type { FieldPath, FormValues } from '../application/formModel';
import { electrodeActive, partitionFieldErrors, stepNumber } from '../application/formModel';
import type { Excitability } from '../domain/electrode';
import { formExcitability, settingsFromForm } from '../application/stimulatorForm';
import { axonRecruitment, CONSTANTS } from '../domain/modelEquations';
import { ElectrodeSection } from './ElectrodeSection';
import type { FieldError, StimulationSite } from '../domain/simulation';
import type { Point, StimulatorSettings, StimulatorWaveform } from '../domain/stimulator';
import {
  changePoints,
  envelopeOutline,
  envelopeWindowMs,
  periodMs,
  PULSE_SCOPE_US,
  pulseOutline,
  pulseRecruitment,
  stimulatorProblems,
  stepped,
} from '../domain/stimulator';
import type { StimulatorControl } from './formFields';
import {
  STIMULATION_SITE_HELP,
  STIMULATION_SITE_OPTIONS,
  STIMULATOR_CONTROLS,
  STIMULATOR_WAVEFORMS,
} from './formFields';
import { HelpButton } from './HelpButton';
import { SegmentedControl } from './SegmentedControl';
import { Switch } from './Switch';
import { useSvgScale } from './useSvgScale';
import { fmtNumber, tr } from '../i18n/locale';

export interface StimulatorViewProps {
  values: FormValues;
  onValuesChange: Dispatch<SetStateAction<FormValues>>;
  /** Client and server errors of the last submit. */
  errors: readonly FieldError[];
  running: boolean;
}

const parse = (raw: string) => {
  const t = raw.trim().replace(',', '.');
  return t === '' ? NaN : Number(t);
};
const fmt = (x: number, digits = 1) =>
  Number.isFinite(x) ? fmtNumber(x, { maximumFractionDigits: digits }) : '—';

// ---------- scopes (plain SVG; exact outlines, not sampled) ----------

const W = 560;
const H = 180;
const PAD = { l: 44, r: 12, t: 12, b: 26 };

function scale(domain: [number, number], range: [number, number]) {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  return (x: number) => r0 + ((x - d0) / (d1 - d0 || 1)) * (r1 - r0);
}

const path = (pts: Point[], sx: (x: number) => number, sy: (y: number) => number) =>
  pts.map(([x, y], i) => `${i ? 'L' : 'M'}${sx(x).toFixed(1)},${sy(y).toFixed(1)}`).join(' ');

function Axis({ ticks, sx, y }: { ticks: number[]; sx: (x: number) => number; y: number }) {
  return (
    <g className="scope-axis">
      <line x1={PAD.l} x2={W - PAD.r} y1={y} y2={y} />
      {ticks.map((t) => (
        <text key={t} x={sx(t)} y={H - 8} textAnchor="middle">
          {fmt(t, 2)}
        </text>
      ))}
    </g>
  );
}

/** Round ticks (1, 2, 2.5 or 5 × 10^k apart) from 0 up to `max`, about `n` intervals. */
function ticksOf(max: number, n = 4): number[] {
  if (!(max > 0)) return [0];
  const raw = max / n;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((x) => x >= raw) ?? raw;
  const out: number[] = [];
  for (let t = 0; t <= max * 0.97 + 1e-9; t += step) out.push(t);
  return out;
}

/** Fixed amplitude range of both scopes: the amplitude control's maximum (grows only above it). */
const ampRange = (s: StimulatorSettings) => Math.max(STIMULATOR_CONTROLS.amplitude.max, s.amplitude);

function PulseScope({ s }: { s: StimulatorSettings }) {
  const [measureSvg, svgScale] = useSvgScale(W);
  const { points, spanUs } = pulseOutline(s);
  const x0 = -PULSE_SCOPE_US.lead;
  const sx = scale([x0, spanUs + x0], [PAD.l, W - PAD.r]);
  const biphasic = s.waveform === 'BIPHASIC_SYMMETRIC';
  const top = ampRange(s) * 1.1;
  const sy = scale([-top, top], [H - PAD.b, PAD.t]);
  const scaled: Point[] = points.map(([x, y]) => [x, y * s.amplitude]);
  return (
    <figure className="scope" aria-label={tr({ 'pt-BR': 'Forma do pulso', en: 'Pulse shape' })}>
      <figcaption>
        {tr({ 'pt-BR': 'Pulso', en: 'Pulse' })}{' '}
        <span className="muted">
          {tr({
            'pt-BR': `— uma fase de ${fmt(s.pulseWidthUs, 0)} µs${biphasic ? ' + fase oposta' : ''} · tempo em µs`,
            en: `— one phase of ${fmt(s.pulseWidthUs, 0)} µs${biphasic ? ' + opposite phase' : ''} · time in µs`,
          })}
        </span>
      </figcaption>
      <svg ref={measureSvg} style={svgScale} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={tr({
          'pt-BR': `Pulso ${biphasic ? 'bifásico' : 'monofásico'} de ${s.pulseWidthUs} µs`,
          en: `${biphasic ? 'Biphasic' : 'Monophasic'} pulse of ${s.pulseWidthUs} µs`,
        })}>
        <line className="scope-zero" x1={PAD.l} x2={W - PAD.r} y1={sy(0)} y2={sy(0)} />
        <text className="scope-ylabel" x={PAD.l - 6} y={sy(ampRange(s)) + 4} textAnchor="end">
          +{fmt(ampRange(s), 0)}
        </text>
        <text className="scope-ylabel" x={PAD.l - 6} y={sy(-ampRange(s)) + 4} textAnchor="end">
          −{fmt(ampRange(s), 0)}
        </text>
        <path className="scope-trace" d={path(scaled, sx, sy)} />
        <Axis ticks={ticksOf(spanUs + x0)} sx={sx} y={H - PAD.b} />
        <text className="scope-ylabel" x={W - PAD.r} y={PAD.t + 10} textAnchor="end">
          A = {fmt(s.amplitude, 0)}
        </text>
      </svg>
    </figure>
  );
}

function EnvelopeScope({ s, excit }: { s: StimulatorSettings; excit: Excitability | null }) {
  const [measureSvg, svgScale] = useSvgScale(W);
  const windowMs = envelopeWindowMs(s);
  const outline = envelopeOutline(s, windowMs);
  // every pulse (a stride would skip short trains in a long run), then only where the fraction changes
  const recruit = pulseRecruitment(s, windowMs, Infinity, excit);
  const sx = scale([0, windowMs], [PAD.l, W - PAD.r]);
  const sy = scale([0, ampRange(s) * 1.15], [H - PAD.b, PAD.t]);
  const sr = scale([0, 1.15], [H - PAD.b, PAD.t]);
  const recruitPts: Point[] = stepped(changePoints(recruit.map((p) => [p.tMs, p.fraction])));
  const showPulses = windowMs / periodMs(s) <= 160;
  return (
    <figure className="scope" aria-label={tr({ 'pt-BR': 'Envelope do estímulo', en: 'Stimulus envelope' })}>
      <figcaption>
        Envelope{' '}
        <span className="muted">
          {tr({ 'pt-BR': '— amplitude de cada pulso e unidades recrutadas · tempo em ms', en: '— amplitude of each pulse and recruited units · time in ms' })}
        </span>
      </figcaption>
      <svg ref={measureSvg} style={svgScale} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={tr({ 'pt-BR': 'Envelope de amplitude e fração recrutada ao longo do tempo', en: 'Amplitude envelope and recruited fraction over time' })}>
        {showPulses
          ? recruit.map((p) => (
              <line key={p.tMs} className="scope-pulse" x1={sx(p.tMs)} x2={sx(p.tMs)} y1={sy(0)} y2={sy(p.amplitude)} />
            ))
          : null}
        <path className="scope-trace" d={path(outline, sx, sy)} />
        <path className="scope-recruit" d={path(recruitPts, sx, sr)} />
        <text className="scope-ylabel" x={PAD.l - 6} y={sy(ampRange(s)) + 4} textAnchor="end">
          {fmt(ampRange(s), 0)}
        </text>
        <text className="scope-ylabel scope-recruit-label" x={W - PAD.r} y={sr(1) - 4} textAnchor="end">
          {tr({ 'pt-BR': '100 % recrutado', en: '100 % recruited' })}
        </text>
        <Axis ticks={ticksOf(windowMs)} sx={sx} y={H - PAD.b} />
      </svg>
    </figure>
  );
}

// ---------- controls ----------

function Dial({
  control,
  values,
  update,
  errors,
  disabled,
}: {
  control: StimulatorControl;
  values: FormValues;
  update(path: FieldPath, value: string): void;
  errors: readonly string[] | undefined;
  disabled: boolean;
}) {
  const id = `stim-${control.path.replace(/\./g, '-')}`;
  const raw = values[control.path];
  const n = parse(raw);
  return (
    <div className={`dial${errors ? ' dial--invalid' : ''}${disabled ? ' dial--disabled' : ''}`}>
      <label htmlFor={id} className="dial-label">
        {control.label}
      </label>
      <div className="dial-readout">
        <input
          id={id}
          className="dial-input"
          type="text"
          inputMode="decimal"
          value={raw}
          disabled={disabled}
          aria-invalid={errors ? true : undefined}
          aria-describedby={`${id}-hint`}
          onChange={(e) => update(control.path, e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
              e.preventDefault();
              update(control.path, stepNumber(raw, e.key === 'ArrowUp' ? control.step : -control.step));
            }
          }}
        />
        <span className="dial-unit">{control.unit}</span>
      </div>
      <input
        type="range"
        className="dial-slider"
        aria-label={`${control.label} (${tr({ 'pt-BR': 'controle deslizante', en: 'slider' })})`}
        min={control.min}
        max={control.max}
        step={control.step}
        value={Number.isFinite(n) ? Math.min(control.max, Math.max(control.min, n)) : control.min}
        disabled={disabled}
        onChange={(e) => update(control.path, e.target.value)}
      />
      <small id={`${id}-hint`} className="dial-hint">
        {control.hint}
      </small>
      {errors ? (
        <small className="field-error" role="alert">
          {errors.join('; ')}
        </small>
      ) : null}
    </div>
  );
}

interface PercentSpec {
  control: StimulatorControl;
  /** The whole the value is a percentage of, in the control's unit (null when it cannot be computed). */
  whole: number | null;
  wholeLabel: string;
  pctMin: number;
  pctMax: number;
  pctStep: number;
  /** Decimals of the absolute value written to the form. */
  decimals: number;
  /** Writes the absolute value (default: the control's own field); lets a dial keep a sum fixed. */
  write?(absolute: number): void;
  /** Appended to the hint. */
  extraHint?: string;
  /** Unit of the absolute value in the hint (default: the control's unit). */
  absoluteUnit?: string;
}

const pctText = (x: number) => fmtNumber(x, { maximumFractionDigits: 1 });

/** A dial set as a percentage of a whole (the pulse period, the run, the on time); the form keeps the absolute value. */
function PercentDial({
  spec,
  values,
  update,
  errors,
  disabled,
}: {
  spec: PercentSpec;
  values: FormValues;
  update(path: FieldPath, value: string): void;
  errors: readonly string[] | undefined;
  disabled: boolean;
}) {
  const { control, whole } = spec;
  const id = `stim-${control.path.replace(/\./g, '-')}`;
  const absolute = parse(values[control.path]);
  const pct = whole && Number.isFinite(absolute) ? (absolute / whole) * 100 : NaN;
  const [draft, setDraft] = useState<string | null>(null);
  const setPct = (p: number) => {
    if (!whole || !Number.isFinite(p)) return;
    const clamped = Math.min(spec.pctMax, Math.max(spec.pctMin, p));
    const value = Number(((clamped / 100) * whole).toFixed(spec.decimals));
    if (spec.write) spec.write(value);
    else update(control.path, String(value));
  };
  return (
    <div className={`dial${errors ? ' dial--invalid' : ''}${disabled ? ' dial--disabled' : ''}`}>
      <label htmlFor={id} className="dial-label">
        {control.label}
      </label>
      <div className="dial-readout">
        <input
          id={id}
          className="dial-input"
          type="text"
          inputMode="decimal"
          value={draft ?? (Number.isFinite(pct) ? pctText(pct) : '—')}
          disabled={disabled || !whole}
          aria-invalid={errors ? true : undefined}
          aria-describedby={`${id}-hint`}
          onChange={(e) => {
            setDraft(e.target.value);
            setPct(parse(e.target.value));
          }}
          onBlur={() => setDraft(null)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
              e.preventDefault();
              setPct((Number.isFinite(pct) ? pct : spec.pctMin) + (e.key === 'ArrowUp' ? spec.pctStep : -spec.pctStep));
            }
          }}
        />
        <span className="dial-unit">%</span>
      </div>
      <input
        type="range"
        className="dial-slider"
        aria-label={`${control.label} (${tr({ 'pt-BR': 'controle deslizante', en: 'slider' })}, % ${spec.wholeLabel})`}
        min={spec.pctMin}
        max={spec.pctMax}
        step={spec.pctStep}
        value={Number.isFinite(pct) ? Math.min(spec.pctMax, Math.max(spec.pctMin, pct)) : spec.pctMin}
        disabled={disabled || !whole}
        onChange={(e) => setPct(Number(e.target.value))}
      />
      <small id={`${id}-hint`} className="dial-hint">
        {Number.isFinite(absolute) ? `= ${fmt(absolute, spec.decimals)} ${spec.absoluteUnit ?? control.unit}` : '—'} · % {spec.wholeLabel}
        {whole ? ` (${fmt(whole, 0)} ${spec.absoluteUnit ?? control.unit})` : ''}
        {spec.extraHint ? ` · ${spec.extraHint}` : ''}
      </small>
      {errors ? (
        <small className="field-error" role="alert">
          {errors.join('; ')}
        </small>
      ) : null}
    </div>
  );
}

/**
 * The train period, in ms. The form keeps on and off times; the period is their sum, and changing it keeps the
 * on share (so on + off is always the whole cycle).
 */
function TrainPeriodDial({
  control,
  values,
  setValues,
  errors,
  disabled,
}: {
  control: StimulatorControl;
  values: FormValues;
  setValues: Dispatch<SetStateAction<FormValues>>;
  errors: readonly string[] | undefined;
  disabled: boolean;
}) {
  const id = 'stim-train-period';
  // a period longer than the run never switches off: the slider stops at the duration
  const duration = parse(values['stimulus.durationMs']);
  const max = Number.isFinite(duration) && duration >= control.min ? Math.min(control.max, duration) : control.max;
  const on = parse(values['stimulus.trainOnMs']);
  const off = parse(values['stimulus.trainOffMs']);
  const period = on + off;
  const [draft, setDraft] = useState<string | null>(null);
  const setPeriod = (p: number) => {
    if (!Number.isFinite(p) || p <= 0) return;
    setValues((v) => {
      const on0 = parse(v['stimulus.trainOnMs']);
      const off0 = parse(v['stimulus.trainOffMs']);
      const share = on0 > 0 && off0 >= 0 ? on0 / (on0 + off0) : 0.5;
      const newOn = Math.max(1, Math.round(p * share));
      return { ...v, 'stimulus.trainOnMs': String(newOn), 'stimulus.trainOffMs': String(Math.max(0, Math.round(p) - newOn)) };
    });
  };
  return (
    <div className={`dial${errors ? ' dial--invalid' : ''}${disabled ? ' dial--disabled' : ''}`}>
      <label htmlFor={id} className="dial-label">
        {control.label}
      </label>
      <div className="dial-readout">
        <input
          id={id}
          className="dial-input"
          type="text"
          inputMode="decimal"
          value={draft ?? (Number.isFinite(period) ? String(period) : '—')}
          disabled={disabled}
          aria-invalid={errors ? true : undefined}
          aria-describedby={`${id}-hint`}
          onChange={(e) => {
            setDraft(e.target.value);
            setPeriod(parse(e.target.value));
          }}
          onBlur={() => setDraft(null)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
              e.preventDefault();
              setPeriod((Number.isFinite(period) ? period : control.min) + (e.key === 'ArrowUp' ? control.step : -control.step));
            }
          }}
        />
        <span className="dial-unit">{control.unit}</span>
      </div>
      <input
        type="range"
        className="dial-slider"
        aria-label={`${control.label} (${tr({ 'pt-BR': 'controle deslizante', en: 'slider' })})`}
        min={control.min}
        max={max}
        step={control.step}
        value={Number.isFinite(period) ? Math.min(max, Math.max(control.min, period)) : control.min}
        disabled={disabled}
        onChange={(e) => setPeriod(Number(e.target.value))}
      />
      <small id={`${id}-hint`} className="dial-hint">
        {control.hint}
      </small>
      {errors ? (
        <small className="field-error" role="alert">
          {errors.join('; ')}
        </small>
      ) : null}
    </div>
  );
}

function useStimulator(values: FormValues, errors: readonly FieldError[]) {
  const { byField } = useMemo(() => partitionFieldErrors(errors), [errors]);
  const settings = useMemo(() => settingsFromForm(values), [values]);
  const problems = settings ? stimulatorProblems(settings) : [];
  // the electrode's G (and the calibrated rheobases) on skin-surface LITERATURE runs; null elsewhere (G = 1)
  const formExcit = useMemo(() => formExcitability(values), [values]);
  const excit = formExcit === 'invalid' ? null : formExcit;
  const electrodeInvalid = formExcit === 'invalid';
  const plateau = settings && !electrodeInvalid ? axonRecruitment(settings.amplitude, settings.pulseWidthUs / 1000, CONSTANTS.tauSdMs, excit) : null;
  const plateauPct = plateau ? Math.round((plateau.status === 'none' ? 0 : plateau.fraction) * 100) : null;
  const amplitudeUnit = excit?.unit === 'MA' ? 'mA' : null;
  return { byField, settings, problems, plateau, plateauPct, excit, amplitudeUnit };
}

/** The device's controls (left sidebar, step 1): mode, dials, waveform, trains and ramps. */
export function StimulatorControls({ values, onValuesChange: setValues, errors, running }: StimulatorViewProps) {
  const { byField, settings, plateau, plateauPct, excit, amplitudeUnit } = useStimulator(values, errors);
  const duration = parse(values['stimulus.durationMs']);
  const onTime = parse(values['stimulus.trainOnMs']);
  const trainPeriod = onTime + parse(values['stimulus.trainOffMs']);
  const positive = (x: number) => (Number.isFinite(x) && x > 0 ? x : null);
  const rampWhole = values.trainsEnabled ? positive(onTime) : positive(duration);
  const ofDuration = tr({ 'pt-BR': 'da duração', en: 'of the duration' });
  const ofOnTime = tr({ 'pt-BR': 'do tempo ligado', en: 'of the on time' });
  const ofPeriod = tr({ 'pt-BR': 'do período', en: 'of the period' });
  const offMs = trainPeriod - onTime;
  const offHint = Number.isFinite(offMs) && trainPeriod > 0
    ? tr({
        'pt-BR': `desligado ${fmt(offMs, 0)} ms (${pctText((offMs / trainPeriod) * 100)} %)`,
        en: `off ${fmt(offMs, 0)} ms (${pctText((offMs / trainPeriod) * 100)} %)`,
      })
    : undefined;
  // the on time moves inside a fixed period: the off time is what is left of it
  const writeOnTime = (on: number) =>
    setValues((v) => {
      const p = parse(v['stimulus.trainOnMs']) + parse(v['stimulus.trainOffMs']);
      const clamped = Math.min(p, Math.max(1, on));
      return { ...v, 'stimulus.trainOnMs': String(clamped), 'stimulus.trainOffMs': String(Math.round((p - clamped) * 1000) / 1000) };
    });
  const percent = (c: StimulatorControl, spec: Omit<PercentSpec, 'control'>) => (
    <PercentDial
      key={c.path}
      spec={{ control: c, ...spec }}
      values={values}
      update={update}
      errors={byField[c.path]}
      disabled={running}
    />
  );
  const update = (p: FieldPath, value: string) => setValues((v) => ({ ...v, [p]: value }));
  const dial = (c: StimulatorControl, disabled = running) => (
    <Dial key={c.path} control={c} values={values} update={update} errors={byField[c.path]} disabled={disabled} />
  );
  const C = STIMULATOR_CONTROLS;
  return (
    <section className="stimulator-panel" aria-label={tr({ 'pt-BR': 'Painel do estimulador', en: 'Stimulator panel' })}>
      <div className="dial dial--wide">
        <span className="dial-label">
          {tr({ 'pt-BR': 'Modo', en: 'Mode' })}{' '}
          <HelpButton label={tr({ 'pt-BR': 'Modo de aplicação', en: 'Application mode' })}>
            <strong>{tr({ 'pt-BR': 'Não invasivo (pele):', en: 'Non-invasive (skin):' })}</strong> {STIMULATION_SITE_HELP.SKIN_SURFACE}
            <br />
            <strong>{tr({ 'pt-BR': 'Invasivo (pool de motoneurônios):', en: 'Invasive (motoneuron pool):' })}</strong> {STIMULATION_SITE_HELP.MOTONEURON_POOL}
          </HelpButton>
        </span>
        <SegmentedControl<StimulationSite>
          id="stim-site"
          label={tr({ 'pt-BR': 'Modo de aplicação', en: 'Application mode' })}
          options={STIMULATION_SITE_OPTIONS}
          value={values.stimulationSite === 'MOTONEURON_POOL' ? 'MOTONEURON_POOL' : 'SKIN_SURFACE'}
          disabled={running}
          size="small"
          onChange={(site) => update('stimulationSite', site)}
        />
      </div>

      {electrodeActive(values) ? (
        <ElectrodeSection
          values={values}
          setValues={setValues}
          byField={byField}
          running={running}
          excitability={excit}
          plateau={plateau}
          pulseWidthUs={settings?.pulseWidthUs ?? null}
        />
      ) : null}

      <div className="dial-grid">
        {dial(C.frequency)}
        {dial(C.pulseWidth)}
        {dial(amplitudeUnit ? { ...C.amplitude, unit: amplitudeUnit, hint: tr({ 'pt-BR': 'calibrado com a sua medida', en: 'calibrated with your measurement' }) } : C.amplitude)}
        <div className="dial dial--wide">
          <span className="dial-label" id="stim-waveform-label">
            {tr({ 'pt-BR': 'Forma de onda', en: 'Waveform' })}
          </span>
          <SegmentedControl<StimulatorWaveform>
            id="stim-waveform"
            label={tr({ 'pt-BR': 'Forma de onda', en: 'Waveform' })}
            options={STIMULATOR_WAVEFORMS}
            value={values['stimulus.waveform'] === 'MONOPHASIC' ? 'MONOPHASIC' : 'BIPHASIC_SYMMETRIC'}
            disabled={running}
            size="small"
            onChange={(w) => update('stimulus.waveform', w)}
          />
          {byField['stimulus.waveform'] ? (
            <small className="field-error" role="alert">
              {byField['stimulus.waveform'].join('; ')}
            </small>
          ) : null}
        </div>
      </div>

      {values.stimulationSite === 'MOTONEURON_POOL' ? (
        <p className="dial-hint" aria-live="polite">
          {tr({
            'pt-BR':
              'No pool de motoneurônios o recrutamento não segue a lei de Weiss: depende da dinâmica de cada motoneurônio (etapa Fisiologia). Veja as unidades que disparam após simular.',
            en: "In the motoneuron pool, recruitment does not follow Weiss's law: it depends on each motoneuron's dynamics (Physiology step). See the units that fire after simulating.",
          })}
        </p>
      ) : (
        <div className="recruit-meter" aria-live="polite">
          <div className="recruit-meter-label">
            <span>{tr({ 'pt-BR': 'Unidades recrutadas no platô', en: 'Units recruited at the plateau' })}</span>
            <strong>{plateauPct === null ? '—' : `${plateauPct} %`}</strong>
          </div>
          <div className="recruit-meter-track" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={plateauPct ?? 0} aria-label={tr({ 'pt-BR': 'Unidades recrutadas', en: 'Recruited units' })}>
            <div className="recruit-meter-fill" style={{ width: `${plateauPct ?? 0}%` }} />
          </div>
          {plateau ? (
            <small className="dial-hint">
              {tr({
                'pt-BR': `Limiar com ${fmt(settings!.pulseWidthUs, 0)} µs: primeira unidade em ${fmt(plateau.thresholdMin)}, todas em ${fmt(plateau.thresholdMax)}${amplitudeUnit ? ' mA' : ''}${excit && excit.g !== 1 ? ` (eletrodo: G = ${fmt(excit.g, 2)})` : ''}.`,
                en: `Threshold at ${fmt(settings!.pulseWidthUs, 0)} µs: first unit at ${fmt(plateau.thresholdMin)}, all at ${fmt(plateau.thresholdMax)}${amplitudeUnit ? ' mA' : ''}${excit && excit.g !== 1 ? ` (electrode: G = ${fmt(excit.g, 2)})` : ''}.`,
              })}
            </small>
          ) : null}
        </div>
      )}

      <div className="stimulator-section">
        <Switch
          checked={values.trainsEnabled}
          disabled={running}
          label={tr({ 'pt-BR': 'Trens (ligado / desligado)', en: 'Trains (on / off)' })}
          description={values.trainsEnabled ? undefined : tr({ 'pt-BR': 'estímulo contínuo durante toda a simulação', en: 'continuous stimulus over the whole simulation' })}
          onChange={(on) => setValues((v) => ({ ...v, trainsEnabled: on }))}
        />
        {values.trainsEnabled ? (
          <div className="dial-grid">
            <TrainPeriodDial
              control={C.trainPeriod}
              values={values}
              setValues={setValues}
              errors={byField[C.trainPeriod.path]}
              disabled={running}
            />
            {percent(C.trainOn, {
              whole: positive(trainPeriod),
              wholeLabel: ofPeriod,
              pctMin: C.trainOn.min,
              pctMax: C.trainOn.max,
              pctStep: C.trainOn.step,
              decimals: 0,
              write: writeOnTime,
              extraHint: offHint,
              absoluteUnit: 'ms',
            })}
          </div>
        ) : null}
        <div className="dial-grid">
          {percent(C.rampUp, { whole: rampWhole, wholeLabel: values.trainsEnabled ? ofOnTime : ofDuration, pctMin: 0, pctMax: 50, pctStep: 0.5, decimals: 0 })}
          {percent(C.rampDown, { whole: rampWhole, wholeLabel: values.trainsEnabled ? ofOnTime : ofDuration, pctMin: 0, pctMax: 50, pctStep: 0.5, decimals: 0 })}
        </div>
      </div>
    </section>
  );
}

export interface StimulatorScopesProps {
  values: FormValues;
  errors: readonly FieldError[];
  /** Opens the explanation of a clicked component in the right sidebar. */
  onInspect?(topic: InspectorTopic): void;
}

/** A card of the centre column that opens its explanation when clicked (like a source-list item). */
function InspectableCard({
  label,
  onInspect,
  className = '',
  children,
}: {
  label: string;
  onInspect?: () => void;
  className?: string;
  children: ReactNode;
}) {
  if (!onInspect) return <div className={`card ${className}`}>{children}</div>;
  return (
    <div
      className={`card card--inspectable ${className}`}
      role="button"
      tabIndex={0}
      aria-label={`${label} — ${tr({ 'pt-BR': 'ver explicação', en: 'see explanation' })}`}
      onClick={onInspect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onInspect();
        }
      }}
    >
      {children}
    </div>
  );
}

/** What the stimulator produces (centre column, step 1): the mode, the recruitment and the scopes. */
export function StimulatorScopes({ values, errors, onInspect }: StimulatorScopesProps) {
  const { settings, problems, excit } = useStimulator(values, errors);
  const inspect = (topic: InspectorTopic) => (onInspect ? () => onInspect(topic) : undefined);
  const invasive = values.stimulationSite === 'MOTONEURON_POOL';
  return (
    <section className="stimulator-scopes" aria-label={tr({ 'pt-BR': 'Osciloscópio', en: 'Oscilloscope' })}>
      <InspectableCard label={tr({ 'pt-BR': 'Modo de aplicação', en: 'Application mode' })} onInspect={inspect({ kind: 'mode' })} className="mode-card">
        <span className="mode-card-eyebrow">{tr({ 'pt-BR': 'Modo', en: 'Mode' })}</span>
        <strong className="mode-card-title">{invasive ? tr({ 'pt-BR': 'Invasivo · pool de motoneurônios', en: 'Invasive · motoneuron pool' }) : tr({ 'pt-BR': 'Não invasivo · pele', en: 'Non-invasive · skin' })}</strong>
        <span className="mode-card-text">{invasive ? STIMULATION_SITE_HELP.MOTONEURON_POOL : STIMULATION_SITE_HELP.SKIN_SURFACE}</span>
      </InspectableCard>
      {problems.length > 0 ? (
        <div className="banner banner--warn" role="status">
          {problems.join(' ')}
        </div>
      ) : null}
      {settings && problems.length === 0 ? (
        <>
          <InspectableCard label={tr({ 'pt-BR': 'Forma do pulso', en: 'Pulse shape' })} onInspect={inspect({ kind: 'scope', scope: 'pulse' })} className="scope-card">
            <PulseScope s={settings} />
          </InspectableCard>
          <InspectableCard label={tr({ 'pt-BR': 'Envelope e trens', en: 'Envelope and trains' })} onInspect={inspect({ kind: 'scope', scope: 'envelope' })} className="scope-card">
            <EnvelopeScope s={settings} excit={excit} />
          </InspectableCard>
        </>
      ) : !settings ? (
        <div className="card scope-card muted">{tr({ 'pt-BR': 'Informe valores numéricos válidos para ver a onda.', en: 'Enter valid numbers to see the waveform.' })}</div>
      ) : null}
    </section>
  );
}

/** Controls and scopes side by side (kept for standalone use and tests). */
export function StimulatorView(props: StimulatorViewProps & { onInspect?(topic: InspectorTopic): void }) {
  return (
    <div className="stimulator">
      <div className="card">
        <StimulatorControls {...props} />
      </div>
      <StimulatorScopes values={props.values} errors={props.errors} {...(props.onInspect ? { onInspect: props.onInspect } : {})} />
    </div>
  );
}
