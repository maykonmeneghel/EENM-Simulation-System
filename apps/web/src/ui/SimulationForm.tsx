import { useMemo, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import type { FieldPath, FormFlags, FormNotice, FormValues } from '../application/formModel';
import {
  applyClinicalStimulus,
  changeVariant,
  defaultFormValues,
  inactiveFields,
  outputStepAdvice,
  parseForm,
  partitionFieldErrors,
} from '../application/formModel';
import { LITERATURE_AUTO_UNITS } from '../domain/defaults';
import type { FieldError, ModelVariant, MusclePreset, SimulationRequest } from '../domain/simulation';
import type { FieldSpec, GroupId } from './formFields';
import { FIELD_GROUPS, MODEL_VARIANT_HELP } from './formFields';

export interface SimulationFormProps {
  muscles: readonly MusclePreset[];
  /** Field errors from the API (problem+json `errors`). */
  serverErrors: readonly FieldError[];
  running: boolean;
  onSubmit(request: SimulationRequest): void;
  onStop(): void;
}

const HIDDEN_WHEN_INACTIVE: ReadonlySet<FieldPath> = new Set(['stimulus.trainOnMs', 'stimulus.trainPeriodMs']);
const fmt = (x: number) => x.toLocaleString('pt-BR', { maximumFractionDigits: 4 });

export function SimulationForm({ muscles, serverErrors, running, onSubmit, onStop }: SimulationFormProps) {
  const [values, setValues] = useState<FormValues>(() => defaultFormValues());
  const [clientErrors, setClientErrors] = useState<FieldError[]>([]);
  const [notices, setNotices] = useState<FormNotice[]>([]);
  const [clinicalNote, setClinicalNote] = useState<string | null>(null);
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
        ? `Ciclo de trabalho limitado a ${result.values['stimulus.dutyCyclePercent']} % (mínimo do contrato): pulso de ${fmt(result.pulseMs)} ms nesta frequência.`
        : `Pulso de ${fmt(result.pulseMs)} ms (ciclo ${result.values['stimulus.dutyCyclePercent'].replace('.', ',')} %) e amplitude ${result.values['stimulus.amplitude']}.`,
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
    }
  };

  const reset = () => {
    setValues(defaultFormValues(values.modelVariant as ModelVariant));
    setClientErrors([]);
    setNotices([]);
    setClinicalNote(null);
  };

  const renderField = (spec: FieldSpec) => {
    if (HIDDEN_WHEN_INACTIVE.has(spec.path) && inactive.has(spec.path)) return null;
    const id = `f-${spec.path.replace(/\./g, '-')}`;
    const errs = byField[spec.path];
    const disabled = running || inactive.has(spec.path);
    const describedBy = errs ? `${id}-err` : undefined;
    return (
      <div key={spec.path} className={`field${errs ? ' field--invalid' : ''}${spec.path === 'modelVariant' ? ' field--wide' : ''}`}>
        <label htmlFor={id}>
          {spec.label}
          {spec.kind === 'number' && spec.unit ? <span className="unit"> ({spec.unit})</span> : null}
        </label>
        {spec.kind === 'number' ? (
          <input
            id={id}
            name={spec.path}
            type="text"
            inputMode="decimal"
            value={values[spec.path]}
            disabled={disabled}
            aria-invalid={errs ? true : undefined}
            aria-describedby={describedBy}
            onChange={(e) => update(spec.path, e.target.value)}
          />
        ) : (
          <select
            id={id}
            name={spec.path}
            value={values[spec.path]}
            disabled={disabled}
            aria-invalid={errs ? true : undefined}
            aria-describedby={describedBy}
            onChange={(e) => update(spec.path, e.target.value)}
          >
            {(spec.options ?? muscleOptions).map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        )}
        {spec.kind === 'number' && spec.hint ? <small className="hint">{spec.hint}</small> : null}
        {errs ? (
          <small id={`${id}-err`} className="field-error" role="alert">
            {errs.join('; ')}
          </small>
        ) : null}
      </div>
    );
  };

  const checkbox = (flag: keyof FormFlags, label: string) => (
    <label className="toggle">
      <input type="checkbox" checked={values[flag]} disabled={running} onChange={(e) => setFlag(flag, e.target.checked)} />
      {label}
    </label>
  );

  const groupExtras: Record<GroupId, { before?: ReactNode; after?: ReactNode }> = {
    model: {
      after: <p className="help">{MODEL_VARIANT_HELP[values.modelVariant]}</p>,
    },
    stimulus: {
      after: (
        <>
          {checkbox('trainsEnabled', 'Trens intermitentes (ex.: 330 ms ligado a cada 1000 ms)')}
          {advice ? (
            <div className="notice" role="status">
              Duração longa: ≈ {advice.points.toLocaleString('pt-BR')} pontos por série com o passo de saída atual.{' '}
              <button
                type="button"
                className="btn btn--small"
                disabled={running}
                onClick={() => update('outputStepMs', String(advice.suggestedMs))}
              >
                Usar {fmt(advice.suggestedMs)} ms
              </button>
              <div className="muted">Se não for alterado, será ajustado automaticamente ao simular.</div>
            </div>
          ) : null}
          {isLiterature ? (
            <div className="clinical">
              <button type="button" className="btn btn--small" disabled={running} onClick={applyClinical}>
                Aplicar estímulo clínico
              </button>
              <small className="hint">pulso de 0,3 ms na frequência escolhida e amplitude 153</small>
              {clinicalNote ? <div className="muted" role="status">{clinicalNote}</div> : null}
            </div>
          ) : null}
        </>
      ),
    },
    modulation: {},
    muscle: {
      before: isLiterature ? (
        <div className="units-mode">
          {checkbox('manualUnits', 'Definir contagens manualmente')}
          {!values.manualUnits ? (
            <small className="hint">automático ({LITERATURE_AUTO_UNITS} unidades na proporção do músculo)</small>
          ) : null}
        </div>
      ) : null,
    },
    motoneuron: {
      before: isLiterature ? (
        <p className="help">
          No modelo corrigido os compartimentos do motoneurônio não são simulados: local de injeção, geometrias e
          temperatura não têm efeito.
        </p>
      ) : null,
    },
  };

  return (
    <form className="sim-form" onSubmit={submit} noValidate aria-label="Parâmetros da simulação">
      {FIELD_GROUPS.map((g) => (
        <fieldset key={g.id} className="group">
          <legend>{g.title}</legend>
          {groupExtras[g.id].before}
          <div className="group-grid">{g.fields.map(renderField)}</div>
          {groupExtras[g.id].after}
        </fieldset>
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

      <div className="actions">
        <button type="submit" className="btn btn--primary" disabled={running}>
          Simular
        </button>
        <button type="button" className="btn btn--danger" onClick={onStop} disabled={!running}>
          Parar
        </button>
        <button type="button" className="btn" onClick={reset} disabled={running}>
          Restaurar padrões
        </button>
      </div>
    </form>
  );
}
