import { useMemo, useState } from 'react';
import type { Dispatch, FormEvent, ReactNode, SetStateAction } from 'react';
import type { FieldPath, FormFlags, FormNotice, FormValues } from '../application/formModel';
import {
  defaultFormValues,
  driveActive,
  inactiveFields,
  outputStepAdvice,
  parseForm,
  partitionFieldErrors,
  randomSeed,
  stepNumber,
  tremorActive,
} from '../application/formModel';
import { STIMULATOR_PATHS } from '../application/stimulatorForm';
import { LITERATURE_AUTO_UNITS } from '../domain/defaults';
import { axonRecruitment } from '../domain/modelEquations';
import type {
  CalibrationTarget,
  ConditionInfo,
  FieldError,
  MusclePreset,
  SimulationRequest,
  UnitsPerType,
} from '../domain/simulation';
import { ConditionPanel } from './ConditionPanel';
import type { FieldSpec, GroupId, NumberField } from './formFields';
import { CALIBRATION_TARGET_HELP, FIELD_GROUPS, STIMULATOR_WAVEFORMS } from './formFields';
import { HelpButton } from './HelpButton';
import { MuscleSources } from './MuscleSources';
import { SegmentedControl } from './SegmentedControl';
import { StimulatorControls } from './StimulatorView';
import type { StepId } from './steps';
import { GROUPS_BY_STEP, nextStep, STEPS } from './steps';
import { Switch } from './Switch';

/** The toolbar's "Simular" button submits this form via `form={SIM_FORM_ID}`. */
export const SIM_FORM_ID = 'sim-form';

const DEFAULT_SEED = defaultFormValues().seed;

export interface SimulationFormProps {
  /** Controlled form values (lifted so the Equações/Diagrama views follow them live). */
  values: FormValues;
  onValuesChange: Dispatch<SetStateAction<FormValues>>;
  muscles: readonly MusclePreset[];
  /** Field errors from the API (problem+json `errors`). */
  serverErrors: readonly FieldError[];
  running: boolean;
  onSubmit(request: SimulationRequest): void;
  /** Counts the server chose in the last matching LITERATURE run (shown while automatic). */
  autoUnitCounts?: UnitsPerType | null;
  /** Opens the Estimulador view, where the stimulus is set. */
  onOpenStimulator?(): void;
  /** Client-side validation errors of the last submit (the Estimulador view shows those of its fields). */
  onClientErrors?(errors: readonly FieldError[]): void;
  /** Show only this step's settings (all groups when omitted). */
  step?: StepId;
  /** Go to another step (the sidebar's "Continuar" button and the summary's "Editar" links). */
  onGoToStep?(step: StepId): void;
  /** Conditions and their adjustments (engine catalog). */
  conditions?: readonly ConditionInfo[];
  conditionsError?: string | null;
}


/** Inputs hidden (not just disabled) while inactive: trains off, or LITERATURE automatic unit counts. */
const HIDDEN_WHEN_INACTIVE: ReadonlySet<FieldPath> = new Set([
  'unitsPerType.S',
  'unitsPerType.FR',
  'unitsPerType.FF',
]);
const fmt = (x: number) => x.toLocaleString('pt-BR', { maximumFractionDigits: 4 });

export function SimulationForm({
  step,
  onGoToStep,
  values,
  onValuesChange: setValues,
  muscles,
  serverErrors,
  running,
  onSubmit,
  autoUnitCounts = null,
  onOpenStimulator,
  onClientErrors,
  conditions = [],
  conditionsError = null,
}: SimulationFormProps) {
  const [clientErrors, setClientErrors] = useState<FieldError[]>([]);
  const [notices, setNotices] = useState<FormNotice[]>([]);
  const [openGroups, setOpenGroups] = useState<Record<GroupId, boolean>>(
    () => Object.fromEntries(FIELD_GROUPS.map((g) => [g.id, !g.collapsed])) as Record<GroupId, boolean>,
  );
  // Server errors are hidden for a field once the user edits it.
  const [editedSinceServer, setEdited] = useState<ReadonlySet<string>>(new Set());
  const [lastServerErrors, setLastServerErrors] = useState(serverErrors);
  if (lastServerErrors !== serverErrors) {
    setLastServerErrors(serverErrors);
    setEdited(new Set());
  }

  const { byField, general } = useMemo(
    () =>
      partitionFieldErrors([
        ...clientErrors,
        ...serverErrors.filter((e) => !editedSinceServer.has(e.field)),
      ]),
    [clientErrors, serverErrors, editedSinceServer],
  );
  const inactive = useMemo(() => inactiveFields(values), [values]);
  const advice = useMemo(() => outputStepAdvice(values), [values]);
  const isLiterature = values.modelVariant === 'LITERATURE';
  const stimulatorErrors = STIMULATOR_PATHS.flatMap((p) => (byField[p] ?? []).map((m) => ({ path: p, message: m })));
  const muscleOptions = muscles.map((m) => ({ value: m.id, label: m.label }));

  const touch = (paths: readonly string[]) => {
    setClientErrors((errs) => errs.filter((e) => !paths.includes(e.field)));
    setEdited((s) => {
      const next = new Set(s);
      for (const p of paths) next.add(p);
      return next;
    });
  };

  const update = (path: FieldPath, value: string) => {
    setValues((v) => ({ ...v, [path]: value }));
    touch([path]);
  };

  const setFlag = (flag: keyof FormFlags, on: boolean) => {
    setValues((v) => ({ ...v, [flag]: on }));
    touch(
      flag === 'manualUnits'
        ? ['unitsPerType', 'unitsPerType.S', 'unitsPerType.FR', 'unitsPerType.FF']
        : flag === 'driveEnabled'
        ? ['centralDrive']
        : ['stimulus.trainOnMs', 'stimulus.trainPeriodMs'],
    );
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (running) return;
    const result = parseForm(values, muscles);
    if (result.ok) {
      setClientErrors([]);
      onClientErrors?.([]);
      setNotices(result.notices);
      // Reflect automatic adjustments (e.g. raised output step) in the form.
      setValues((v) => ({ ...v, outputStepMs: String(result.request.outputStepMs) }));
      onSubmit(result.request);
    } else {
      setNotices([]);
      setClientErrors(result.errors);
      onClientErrors?.(result.errors);
      // Reveal collapsed sections that hold an error.
      const failing = new Set(result.errors.map((er) => er.field));
      setOpenGroups((o) => {
        const next = { ...o };
        for (const g of FIELD_GROUPS) if (g.fields.some((f) => failing.has(f.path))) next[g.id] = true;
        return next;
      });
    }
  };

  const reset = () => {
    setValues(defaultFormValues());
    setClientErrors([]);
    onClientErrors?.([]);
    setNotices([]);
  };

  const numberControl = (spec: NumberField, id: string, disabled: boolean, describedBy: string | undefined, invalid: boolean) => (
    <span className="row-control">
      <span className="stepper-field">
        <input
          id={id}
          name={spec.path}
          type="text"
          inputMode="decimal"
          className="num-input"
          value={values[spec.path]}
          disabled={disabled}
          title={spec.hint ? `Intervalo: ${spec.hint}` : undefined}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          onChange={(e) => update(spec.path, e.target.value)}
          // the seed always has a number: emptied, it goes back to its default
          onBlur={spec.path === 'seed' && values.seed.trim() === '' ? () => update('seed', DEFAULT_SEED) : undefined}
          onKeyDown={(e) => {
            if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
              e.preventDefault();
              update(spec.path, stepNumber(values[spec.path], e.key === 'ArrowUp' ? spec.stepBy : -spec.stepBy));
            }
          }}
        />
        <span className="stepper" aria-hidden="true">
          <button
            type="button"
            tabIndex={-1}
            disabled={disabled}
            title={`+${fmt(spec.stepBy)}`}
            onClick={() => update(spec.path, stepNumber(values[spec.path], spec.stepBy))}
          >
            <svg viewBox="0 0 8 5" width="8" height="5"><path d="M1 4 L4 1 L7 4" /></svg>
          </button>
          <button
            type="button"
            tabIndex={-1}
            disabled={disabled}
            title={`−${fmt(spec.stepBy)}`}
            onClick={() => update(spec.path, stepNumber(values[spec.path], -spec.stepBy))}
          >
            <svg viewBox="0 0 8 5" width="8" height="5"><path d="M1 1 L4 4 L7 1" /></svg>
          </button>
        </span>
      </span>
      {spec.path === 'seed' ? (
        <button
          type="button"
          className="seed-button"
          disabled={disabled}
          aria-label="Sortear outra semente"
          title="Sortear outra semente"
          onClick={() => update('seed', randomSeed())}
        >
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
            <rect x="2" y="2" width="12" height="12" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.3" />
            <circle cx="5.5" cy="5.5" r="1.1" fill="currentColor" />
            <circle cx="10.5" cy="5.5" r="1.1" fill="currentColor" />
            <circle cx="8" cy="8" r="1.1" fill="currentColor" />
            <circle cx="5.5" cy="10.5" r="1.1" fill="currentColor" />
            <circle cx="10.5" cy="10.5" r="1.1" fill="currentColor" />
          </svg>
        </button>
      ) : (
        <span className="unit">{spec.unit ?? ''}</span>
      )}
    </span>
  );

  const renderField = (spec: FieldSpec) => {
    if (HIDDEN_WHEN_INACTIVE.has(spec.path) && inactive.has(spec.path)) return null;
    const id = `f-${spec.path.replace(/\./g, '-')}`;
    const errs = byField[spec.path];
    const disabled = running || inactive.has(spec.path);
    const hasHint = spec.kind === 'number' && !!spec.hint;
    const describedBy = [hasHint ? `${id}-hint` : '', errs ? `${id}-err` : ''].filter(Boolean).join(' ') || undefined;
    const options = spec.kind === 'select' ? (spec.options ?? muscleOptions) : [];
    const segmented = spec.kind === 'select' && spec.segmented;
    const wide = spec.path === 'calibrationTarget';
    return (
      <div
        key={spec.path}
        className={`row${wide ? ' row--wide' : ''}${errs ? ' row--invalid' : ''}${disabled ? ' row--disabled' : ''}`}
      >
        <div className="row-main">
          <div className="row-label">
            <label htmlFor={segmented ? undefined : id} id={`${id}-label`} title={hasHint ? `Intervalo: ${spec.hint}` : undefined}>
              {spec.label}
            </label>
            {spec.path === 'calibrationTarget' ? (
              <HelpButton label="Calibração do twitch">
                Os dados humanos verificados não podem ser atendidos ao mesmo tempo; escolha qual o modelo reproduz.
                <br />
                <strong>Músculo inteiro:</strong> {CALIBRATION_TARGET_HELP.WHOLE_MUSCLE}
                <br />
                <strong>Unidade isolada:</strong> {CALIBRATION_TARGET_HELP.SINGLE_UNIT}
              </HelpButton>
            ) : null}
            {hasHint ? (
              <span id={`${id}-hint`} className="visually-hidden">
                Intervalo {spec.kind === 'number' ? spec.hint : ''}
              </span>
            ) : null}
          </div>
          {spec.kind === 'number' ? (
            numberControl(spec, id, disabled, describedBy, !!errs)
          ) : segmented ? (
            <SegmentedControl
              id={id}
              label={spec.label}
              options={options}
              value={values[spec.path]}
              disabled={disabled}
              size="small"
              onChange={(v) => update(spec.path, v)}
            />
          ) : (
            <span className="row-control">
              <span className="popup">
                <select
                  id={id}
                  name={spec.path}
                  className="popup-select"
                  value={values[spec.path]}
                  disabled={disabled}
                  aria-invalid={errs ? true : undefined}
                  aria-describedby={describedBy}
                  onChange={(e) => update(spec.path, e.target.value)}
                >
                  {options.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </span>
            </span>
          )}
        </div>
        {errs ? (
          <small id={`${id}-err`} className="field-error" role="alert">
            {errs.join('; ')}
          </small>
        ) : null}
      </div>
    );
  };

  const toggle = (flag: keyof FormFlags, label: string, description?: string) => (
    <Switch
      checked={values[flag]}
      disabled={running}
      label={label}
      {...(description ? { description } : {})}
      onChange={(on) => setFlag(flag, on)}
    />
  );

  const pw = Number(values['stimulus.pulseWidthUs'].replace(',', '.'));
  const recruitment = axonRecruitment(Number(values['stimulus.amplitude'].replace(',', '.')), pw / 1000);
  const waveformLabel = STIMULATOR_WAVEFORMS.find((w) => w.value === values['stimulus.waveform'])?.label ?? '—';
  const pool = values.stimulationSite === 'MOTONEURON_POOL';
  const stimulusSummary = [
    pool ? 'no pool de motoneurônios' : 'na pele',
    `${values['stimulus.frequencyHz']} Hz`,
    `${values['stimulus.pulseWidthUs']} µs`,
    waveformLabel.toLowerCase(),
    `amplitude ${values['stimulus.amplitude']}`,
    values.trainsEnabled ? `trens ${values['stimulus.trainOnMs']} / ${values['stimulus.trainOffMs']} ms` : 'contínuo',
  ].join(' · ');

  const tremorOn = tremorActive(values);
  const driveOn = driveActive(values);
  const TREMOR_PRESETS = [
    { hz: '4.4', label: '4,4 Hz · Dideriksen 2017', title: 'Punho, Parkinson, 4,4 ± 1,0 Hz (n = 5, texto completo)' },
    { hz: '5.9', label: '5,9 Hz · Agapaki 2018', title: 'Repouso, acelerômetro na mão, 5,9 ± 0,8 Hz (n = 23, texto completo)' },
  ];

  const groupExtras: Record<GroupId, { before?: ReactNode; after?: ReactNode }> = {
    model: {},
    drive: {
      before: isLiterature ? (
        <div className="row">
          <Switch
            checked={values.driveEnabled || tremorOn}
            disabled={running || tremorOn}
            label="Ativar drive central"
            description={
              tremorOn
                ? 'ligado pelo tremor de repouso (Parkinson)'
                : 'corrente descendente nos motoneurônios (Gallego 2015)'
            }
            onChange={(on) => setFlag('driveEnabled', on)}
          />
          <HelpButton label="Drive central">
            Corrente que chega aos motoneurônios vinda do sistema nervoso central: fundo + comando voluntário +
            oscilação do tremor + ruído independente por unidade (Gallego et al. 2015, mesmo motoneurônio de dois
            compartimentos). A oscilação só entra com a condição Parkinson e o ajuste &quot;Tremor de repouso&quot;
            ligados. A corrente entra em motoneurônios de Cisi &amp; Kohn (2008), em nA, como no artigo. &quot;Pela
            reobase&quot; reescala as correntes pela razão entre a nossa menor reobase e a de Gallego (4 nA). O limiar
            segue Cisi &amp; Kohn 2008 (reobase × resistência de entrada: menor unidade 3,5 nA) ou Watanabe 2013
            (limiar direto em mV: menor unidade 5,6 nA).
          </HelpButton>
          {driveOn ? (
            <p className="inline-notice" role="note">
              O drive vai a motoneurônios de Cisi & Kohn (2008), os do modelo de Gallego: perto do limiar disparam a
              7–11 Hz, como as unidades em Parkinson (10,9 ± 2,9 Hz, Agapaki 2018).
            </p>
          ) : null}
        </div>
      ) : null,
      after:
        isLiterature && tremorOn ? (
          <div className="row preset-row" role="group" aria-label="Frequência do tremor por artigo">
            {TREMOR_PRESETS.map((p) => (
              <button
                key={p.hz}
                type="button"
                className={`btn btn--small${values['centralDrive.tremor.frequencyHz'] === p.hz ? ' btn--selected' : ''}`}
                disabled={running}
                title={p.title}
                onClick={() => update('centralDrive.tremor.frequencyHz', p.hz)}
              >
                {p.label}
              </button>
            ))}
          </div>
        ) : null,
    },
    condition: {
      before: (
        <ConditionPanel
          values={values}
          onChange={(next) => setValues(next)}
          conditions={conditions}
          error={conditionsError}
          disabled={running}
        />
      ),
    },
    stimulus: {
      before: (
        <div className="row stimulus-summary">
          <p className="stimulus-summary-text">{stimulusSummary}</p>
          <p className="stimulus-summary-recruit" aria-live="polite">
            {pool
              ? 'recrutamento definido pelos motoneurônios (veja após simular)'
              : recruitment
              ? `≈ ${Math.round((recruitment.status === 'none' ? 0 : recruitment.fraction) * 100)} % das unidades recrutadas no platô`
              : '—'}
          </p>
          {stimulatorErrors.length > 0 ? (
            <ul className="form-errors" role="alert">
              {stimulatorErrors.map((e) => (
                <li key={`${e.path}-${e.message}`}>
                  <code>{e.path.replace('stimulus.', '')}</code> {e.message}
                </li>
              ))}
            </ul>
          ) : null}
          <button type="button" className="btn btn--small" onClick={onOpenStimulator} disabled={!onOpenStimulator}>
            Abrir estimulador
          </button>
        </div>
      ),
    },
    motoneuron: {},
    muscle: {
      before: isLiterature ? (
        <div className="row">
          {toggle(
            'manualUnits',
            'Definir contagens manualmente',
            values.manualUnits ? undefined : `automático (${LITERATURE_AUTO_UNITS} unidades na proporção do músculo)`,
          )}
          {!values.manualUnits ? (
            <div className="row-main readonly-row" aria-live="polite">
              <span className="row-label">Unidades simuladas</span>
              <span className="readonly-value" title="Informado pelo servidor na última simulação deste músculo">
                {autoUnitCounts ? `S ${autoUnitCounts.S} · FR ${autoUnitCounts.FR} · FF ${autoUnitCounts.FF}` : '—'}
              </span>
            </div>
          ) : null}
        </div>
      ) : null,
      after: isLiterature ? (
        <MuscleSources
          preset={muscles.find((m) => m.id === values.muscle)}
          calibrationTarget={values.calibrationTarget as CalibrationTarget}
        />
      ) : null,
    },
    simulation: {
      after: advice ? (
        <div className="row">
          <div className="inline-notice" role="status">
            ≈ {advice.points.toLocaleString('pt-BR')} pontos por série.{' '}
            <button
              type="button"
              className="btn btn--small"
              disabled={running}
              title="Será ajustado automaticamente ao simular se não for alterado"
              onClick={() => update('outputStepMs', String(advice.suggestedMs))}
            >
              Usar {fmt(advice.suggestedMs)} ms
            </button>
          </div>
        </div>
      ) : null,
    },
  };

  const next = step ? nextStep(step) : null;
  const allErrors = [...clientErrors, ...serverErrors];
  return (
    <form id={SIM_FORM_ID} className="inspector-form" onSubmit={submit} noValidate aria-label="Parâmetros da simulação">
      {step === 'stimulator' ? (
        <StimulatorControls values={values} onValuesChange={setValues} errors={allErrors} running={running} />
      ) : null}
      {step === 'results' ? <RunRecap values={values} muscles={muscles} onGoToStep={onGoToStep} /> : null}
      {(step ? GROUPS_BY_STEP[step].map((id) => FIELD_GROUPS.find((g) => g.id === id)!) : FIELD_GROUPS).filter(
        (g) =>
          (g.id !== 'motoneuron' || (values.stimulationSite === 'MOTONEURON_POOL' && !driveActive(values))) &&
          (g.id !== 'drive' || isLiterature),
      ).map((g) =>
        // a group named like its step (Simulação) needs no sub-heading of its own
        step && g.title === STEPS.find((st) => st.id === step)?.label ? (
          <fieldset key={g.id} className="section section-body" aria-label={g.title}>
            {groupExtras[g.id].before}
            {g.fields.map(renderField)}
            {groupExtras[g.id].after}
          </fieldset>
        ) : (
        <details
          key={g.id}
          className="section"
          open={openGroups[g.id]}
          onToggle={(e) => {
            const open = (e.currentTarget as HTMLDetailsElement).open;
            setOpenGroups((o) => (o[g.id] === open ? o : { ...o, [g.id]: open }));
          }}
        >
          <summary className="section-title">{g.title}</summary>
          <fieldset className="section-body" aria-label={g.title}>
            {groupExtras[g.id].before}
            {g.fields.map(renderField)}
            {groupExtras[g.id].after}
          </fieldset>
        </details>
        ),
      )}

      {general.length > 0 ? (
        <ul className="form-errors" role="alert">
          {general.map((e, i) => (
            <li key={i}>
              {e.field ? <code>{e.field}</code> : null} {e.message}
            </li>
          ))}
        </ul>
      ) : null}

      {notices.length > 0 ? (
        <ul className="form-notices" role="status">
          {notices.map((n, i) => (
            <li key={i}>{n.message}</li>
          ))}
        </ul>
      ) : null}

      <div className="inspector-footer">
        <button type="button" className="btn" onClick={reset} disabled={running}>
          Restaurar padrões
        </button>
        {step && next && next.id !== 'results' && onGoToStep ? (
          <button type="button" className="btn btn--primary" onClick={() => onGoToStep(next.id)}>
            Continuar
          </button>
        ) : null}
        {step === 'simulation' ? (
          <button type="submit" className="btn btn--primary" disabled={running}>
            Simular
          </button>
        ) : null}
      </div>
    </form>
  );
}

/** Results step: what the run uses, step by step, each with a link back to where it is set. */
function RunRecap({
  values,
  muscles,
  onGoToStep,
}: {
  values: FormValues;
  muscles: readonly MusclePreset[];
  onGoToStep?: ((step: StepId) => void) | undefined;
}) {
  const muscle = muscles.find((m) => m.id === values.muscle)?.label ?? values.muscle;
  const invasive = values.stimulationSite === 'MOTONEURON_POOL';
  const conditionLabel: Record<string, string> = {
    NORMAL: 'Normal',
    PARKINSON: 'Doença de Parkinson',
    SCI_CHRONIC: 'Lesão medular crônica',
  };
  const rows: Record<Exclude<StepId, 'results'>, string[]> = {
    stimulator: [
      invasive ? 'Invasivo (pool de motoneurônios)' : 'Não invasivo (pele)',
      `${values['stimulus.frequencyHz']} Hz · ${values['stimulus.pulseWidthUs']} µs · amplitude ${values['stimulus.amplitude']}`,
      values.trainsEnabled ? `trens ${values['stimulus.trainOnMs']} / ${values['stimulus.trainOffMs']} ms` : 'contínuo',
    ],
    physiology: [
      conditionLabel[values.condition] ?? values.condition,
      muscle,
      driveActive(values) ? (tremorActive(values) ? `drive central com tremor a ${values['centralDrive.tremor.frequencyHz']} Hz` : 'drive central') : 'sem drive central',
    ],
    simulation: [`${values['stimulus.durationMs']} ms · passo ${values['stimulus.stepMs']} ms · saída ${values.outputStepMs} ms`],
  };
  return (
    <div className="recap" aria-label="Resumo da configuração">
      {STEPS.filter((s): s is (typeof STEPS)[number] & { id: Exclude<StepId, 'results'> } => s.id !== 'results').map((s) => (
        <section key={s.id} className="recap-group">
          <header className="recap-head">
            <span className="recap-number">{s.number}</span>
            <h3>{s.label}</h3>
            {onGoToStep ? (
              <button type="button" className="btn btn--small btn--link" onClick={() => onGoToStep(s.id)}>
                Editar
              </button>
            ) : null}
          </header>
          <ul>
            {rows[s.id].map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
