import { useMemo, useState } from 'react';
import type { Dispatch, FormEvent, ReactNode, SetStateAction } from 'react';
import type { FieldPath, FormFlags, FormNotice, FormValues } from '../application/formModel';
import {
  applyClinicalStimulus,
  changeVariant,
  defaultFormValues,
  inactiveFields,
  outputStepAdvice,
  parseForm,
  partitionFieldErrors,
  stepNumber,
} from '../application/formModel';
import { LITERATURE_AUTO_UNITS } from '../domain/defaults';
import type { FieldError, ModelVariant, MusclePreset, SimulationRequest, UnitsPerType } from '../domain/simulation';
import type { FieldSpec, GroupId, NumberField } from './formFields';
import { CALIBRATION_TARGET_HELP, FIELD_GROUPS, MODEL_VARIANT_HELP } from './formFields';
import { HelpPopover } from './HelpPopover';
import { SegmentedControl } from './SegmentedControl';
import { Switch } from './Switch';

/** The toolbar's "Simular" button submits this form via `form={SIM_FORM_ID}`. */
export const SIM_FORM_ID = 'sim-form';

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
}

/** Inputs hidden (not just disabled) while inactive: trains off, or LITERATURE automatic unit counts. */
const HIDDEN_WHEN_INACTIVE: ReadonlySet<FieldPath> = new Set([
  'calibrationTarget',
  'stimulus.trainOnMs',
  'stimulus.trainPeriodMs',
  'unitsPerType.S',
  'unitsPerType.FR',
  'unitsPerType.FF',
]);
const fmt = (x: number) => x.toLocaleString('pt-BR', { maximumFractionDigits: 4 });

export function SimulationForm({
  values,
  onValuesChange: setValues,
  muscles,
  serverErrors,
  running,
  onSubmit,
  autoUnitCounts = null,
}: SimulationFormProps) {
  const [clientErrors, setClientErrors] = useState<FieldError[]>([]);
  const [notices, setNotices] = useState<FormNotice[]>([]);
  const [clinicalNote, setClinicalNote] = useState<string | null>(null);
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
    setValues((v) => (path === 'modelVariant' ? changeVariant(v, value as ModelVariant) : { ...v, [path]: value }));
    touch([path]);
    if (path === 'modelVariant') setClinicalNote(null);
  };

  const setFlag = (flag: keyof FormFlags, on: boolean) => {
    setValues((v) => ({ ...v, [flag]: on }));
    touch(
      flag === 'manualUnits'
        ? ['unitsPerType', 'unitsPerType.S', 'unitsPerType.FR', 'unitsPerType.FF']
        : ['stimulus.trainOnMs', 'stimulus.trainPeriodMs'],
    );
  };

  const applyClinical = () => {
    const result = applyClinicalStimulus(values);
    if (!result) {
      setClinicalNote('Informe uma frequência válida para calcular o pulso clínico.');
      return;
    }
    setValues(result.values);
    touch(['stimulus.dutyCyclePercent', 'stimulus.amplitude']);
    setClinicalNote(
      result.clamped
        ? `Ciclo limitado a ${result.values['stimulus.dutyCyclePercent']} % (mínimo do contrato): pulso de ${fmt(result.pulseMs)} ms.`
        : `Pulso de ${fmt(result.pulseMs)} ms (ciclo ${result.values['stimulus.dutyCyclePercent'].replace('.', ',')} %), amplitude ${result.values['stimulus.amplitude']}.`,
    );
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (running) return;
    const result = parseForm(values, muscles);
    if (result.ok) {
      setClientErrors([]);
      setNotices(result.notices);
      // Reflect automatic adjustments (e.g. raised output step) in the form.
      setValues((v) => ({ ...v, outputStepMs: String(result.request.outputStepMs) }));
      onSubmit(result.request);
    } else {
      setNotices([]);
      setClientErrors(result.errors);
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
    setValues(defaultFormValues(values.modelVariant as ModelVariant));
    setClientErrors([]);
    setNotices([]);
    setClinicalNote(null);
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
      <span className="unit">{spec.unit ?? ''}</span>
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
    const wide = spec.path === 'modelVariant' || spec.path === 'calibrationTarget';
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
            {spec.path === 'modelVariant' ? (
              <HelpPopover label="Modelo">
                <strong>Original:</strong> {MODEL_VARIANT_HELP.ORIGINAL}
                <br />
                <strong>Corrigido:</strong> {MODEL_VARIANT_HELP.LITERATURE}
              </HelpPopover>
            ) : null}
            {spec.path === 'calibrationTarget' ? (
              <HelpPopover label="Calibração do twitch">
                Os dados humanos verificados não podem ser atendidos ao mesmo tempo; escolha qual o modelo reproduz.
                <br />
                <strong>Músculo inteiro:</strong> {CALIBRATION_TARGET_HELP.WHOLE_MUSCLE}
                <br />
                <strong>Unidade isolada:</strong> {CALIBRATION_TARGET_HELP.SINGLE_UNIT}
              </HelpPopover>
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

  const groupExtras: Record<GroupId, { before?: ReactNode; after?: ReactNode }> = {
    model: {},
    stimulus: {
      after: (
        <>
          <div className="row">{toggle('trainsEnabled', 'Trens intermitentes')}</div>
          {advice ? (
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
          ) : null}
          {isLiterature ? (
            <div className="row">
              <div className="row-main">
                <span className="row-label">
                  <span>Estímulo clínico</span>
                  <HelpPopover label="Estímulo clínico">
                    Pulso de 0,3 ms na frequência escolhida (ciclo = 0,03 × f %) e amplitude 153. Abaixo de ~33 Hz o
                    ciclo fica no mínimo de 1 % e o pulso é mais longo.
                  </HelpPopover>
                </span>
                <button type="button" className="btn btn--small" disabled={running} onClick={applyClinical}>
                  Aplicar estímulo clínico
                </button>
              </div>
              {clinicalNote ? (
                <small className="row-note" role="status">
                  {clinicalNote}
                </small>
              ) : null}
            </div>
          ) : null}
        </>
      ),
    },
    modulation: {},
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
    },
    motoneuron: {
      before: isLiterature ? (
        <div className="row">
          <span className="row-note row-note--inline">
            Sem efeito no modelo corrigido
            <HelpPopover label="Motoneurônio no modelo corrigido">
              No modelo corrigido os compartimentos do motoneurônio não são simulados: local de injeção, geometrias e
              temperatura não têm efeito.
            </HelpPopover>
          </span>
        </div>
      ) : null,
    },
  };

  return (
    <form id={SIM_FORM_ID} className="inspector-form" onSubmit={submit} noValidate aria-label="Parâmetros da simulação">
      {FIELD_GROUPS.map((g) => (
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
      ))}

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
      </div>
    </form>
  );
}
