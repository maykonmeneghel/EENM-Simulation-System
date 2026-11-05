import { useMemo } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { FieldPath, FormValues } from '../application/formModel';
import { partitionFieldErrors, stepNumber } from '../application/formModel';
import { settingsFromForm } from '../application/stimulatorForm';
import { axonRecruitment } from '../domain/modelEquations';
import type { FieldError, StimulationSite } from '../domain/simulation';
import type { Point, StimulatorSettings, StimulatorWaveform } from '../domain/stimulator';
import {
  envelopeOutline,
  envelopeWindowMs,
  periodMs,
  PULSE_SCOPE_US,
  pulseOutline,
  pulseRecruitment,
  stimulatorProblems,
} from '../domain/stimulator';
import type { StimulatorControl } from './formFields';
import {
  STIMULATION_SITE_HELP,
  STIMULATION_SITE_OPTIONS,
  STIMULATOR_CONTROLS,
  STIMULATOR_WAVEFORMS,
} from './formFields';
import { HelpPopover } from './HelpPopover';
import { SegmentedControl } from './SegmentedControl';
import { Switch } from './Switch';

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
  Number.isFinite(x) ? x.toLocaleString('pt-BR', { maximumFractionDigits: digits }) : '—';

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
  const { points, spanUs } = pulseOutline(s);
  const x0 = -PULSE_SCOPE_US.lead;
  const sx = scale([x0, spanUs + x0], [PAD.l, W - PAD.r]);
  const biphasic = s.waveform === 'BIPHASIC_SYMMETRIC';
  const top = ampRange(s) * 1.1;
  const sy = scale([-top, top], [H - PAD.b, PAD.t]);
  const scaled: Point[] = points.map(([x, y]) => [x, y * s.amplitude]);
  return (
    <figure className="scope" aria-label="Forma do pulso">
      <figcaption>
        Pulso <span className="muted">— uma fase de {fmt(s.pulseWidthUs, 0)} µs{biphasic ? ' + fase oposta' : ''} · tempo em µs</span>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Pulso ${biphasic ? 'bifásico' : 'monofásico'} de ${s.pulseWidthUs} µs`}>
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

function EnvelopeScope({ s }: { s: StimulatorSettings }) {
  const windowMs = envelopeWindowMs(s);
  const outline = envelopeOutline(s, windowMs);
  const recruit = pulseRecruitment(s, windowMs, 600);
  const sx = scale([0, windowMs], [PAD.l, W - PAD.r]);
  const sy = scale([0, ampRange(s) * 1.15], [H - PAD.b, PAD.t]);
  const sr = scale([0, 1.15], [H - PAD.b, PAD.t]);
  const recruitPts: Point[] = recruit.map((p) => [p.tMs, p.fraction]);
  const showPulses = windowMs / periodMs(s) <= 160;
  return (
    <figure className="scope" aria-label="Envelope do estímulo">
      <figcaption>
        Envelope <span className="muted">— amplitude de cada pulso e unidades recrutadas · tempo em ms</span>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Envelope de amplitude e fração recrutada ao longo do tempo">
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
          100 % recrutado
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
        aria-label={`${control.label} (controle deslizante)`}
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

export function StimulatorView({ values, onValuesChange: setValues, errors, running }: StimulatorViewProps) {
  const { byField } = useMemo(() => partitionFieldErrors(errors), [errors]);
  const settings = useMemo(() => settingsFromForm(values), [values]);
  const problems = settings ? stimulatorProblems(settings) : [];
  const update = (p: FieldPath, value: string) => setValues((v) => ({ ...v, [p]: value }));
  const plateau = settings ? axonRecruitment(settings.amplitude, settings.pulseWidthUs / 1000) : null;
  const plateauPct = plateau ? Math.round((plateau.status === 'none' ? 0 : plateau.fraction) * 100) : null;
  const dial = (c: StimulatorControl, disabled = running) => (
    <Dial key={c.path} control={c} values={values} update={update} errors={byField[c.path]} disabled={disabled} />
  );
  const C = STIMULATOR_CONTROLS;

  return (
    <div className="stimulator">
      <section className="card stimulator-panel" aria-label="Painel do estimulador">
        <header className="stimulator-head">
          <h2>Estimulador</h2>
          <HelpPopover label="Sobre o estimulador">
            Ajuste como num aparelho de FES. O botão Simular usa este estímulo. A amplitude está na unidade do modelo
            (recrutamento herdado do modelo original, sem conversão verificada para mA); o recrutamento segue a lei de
            Weiss (τ = 0,459 ms) para a largura de pulso escolhida. No bifásico, só a primeira fase excita o axônio.
          </HelpPopover>
        </header>

        <div className="dial dial--wide">
          <span className="dial-label">
            Local do estímulo{' '}
            <HelpPopover label="Local do estímulo">
              <strong>Superfície da pele:</strong> {STIMULATION_SITE_HELP.SKIN_SURFACE}
              <br />
              <strong>Pool de motoneurônios:</strong> {STIMULATION_SITE_HELP.MOTONEURON_POOL}
            </HelpPopover>
          </span>
          <SegmentedControl<StimulationSite>
            id="stim-site"
            label="Local do estímulo"
            options={STIMULATION_SITE_OPTIONS}
            value={values.stimulationSite === 'MOTONEURON_POOL' ? 'MOTONEURON_POOL' : 'SKIN_SURFACE'}
            disabled={running}
            size="small"
            onChange={(site) => update('stimulationSite', site)}
          />
        </div>

        <div className="dial-grid">
          {dial(C.frequency)}
          {dial(C.pulseWidth)}
          {dial(C.amplitude)}
          <div className="dial dial--wide">
            <span className="dial-label" id="stim-waveform-label">
              Forma de onda
            </span>
            <SegmentedControl<StimulatorWaveform>
              id="stim-waveform"
              label="Forma de onda"
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
            No pool de motoneurônios o recrutamento não segue a lei de Weiss: depende da dinâmica de cada motoneurônio
            (tamanho, temperatura, local de injeção, na barra lateral). Veja as unidades que disparam após simular.
          </p>
        ) : (
        <div className="recruit-meter" aria-live="polite">
          <div className="recruit-meter-label">
            <span>Unidades recrutadas no platô</span>
            <strong>{plateauPct === null ? '—' : `${plateauPct} %`}</strong>
          </div>
          <div className="recruit-meter-track" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={plateauPct ?? 0} aria-label="Unidades recrutadas">
            <div className="recruit-meter-fill" style={{ width: `${plateauPct ?? 0}%` }} />
          </div>
          {plateau ? (
            <small className="dial-hint">
              Limiar com {fmt(settings!.pulseWidthUs, 0)} µs: primeira unidade em {fmt(plateau.thresholdMin)}, todas em{' '}
              {fmt(plateau.thresholdMax)}.
            </small>
          ) : null}
        </div>
        )}

        <div className="stimulator-section">
          <Switch
            checked={values.trainsEnabled}
            disabled={running}
            label="Trens (ligado / desligado)"
            description={values.trainsEnabled ? undefined : 'estímulo contínuo durante toda a simulação'}
            onChange={(on) => setValues((v) => ({ ...v, trainsEnabled: on }))}
          />
          {values.trainsEnabled ? <div className="dial-grid">{[dial(C.trainOn), dial(C.trainOff)]}</div> : null}
          <div className="dial-grid">{[dial(C.rampUp), dial(C.rampDown)]}</div>
        </div>
      </section>

      <section className="stimulator-scopes" aria-label="Osciloscópio">
        {problems.length > 0 ? (
          <div className="banner banner--warn" role="status">
            {problems.join(' ')}
          </div>
        ) : null}
        {settings && problems.length === 0 ? (
          <>
            <div className="card scope-card">
              <PulseScope s={settings} />
            </div>
            <div className="card scope-card">
              <EnvelopeScope s={settings} />
            </div>
          </>
        ) : !settings ? (
          <div className="card scope-card muted">Informe valores numéricos válidos para ver a onda.</div>
        ) : null}
      </section>
    </div>
  );
}
