import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import type { FieldPath, FormValues } from '../application/formModel';
import { parseForm, partitionFieldErrors, toFormValues } from '../application/formModel';
import type { FieldError, MusclePreset, SimulationRequest } from '../domain/simulation';
import type { FieldSpec } from './formFields';
import { FIELD_GROUPS } from './formFields';

export interface SimulationFormProps {
  muscles: readonly MusclePreset[];
  /** Field errors from the API (problem+json `errors`). */
  serverErrors: readonly FieldError[];
  running: boolean;
  onSubmit(request: SimulationRequest): void;
  onStop(): void;
}

export function SimulationForm({ muscles, serverErrors, running, onSubmit, onStop }: SimulationFormProps) {
  const [values, setValues] = useState<FormValues>(() => toFormValues());
  const [clientErrors, setClientErrors] = useState<FieldError[]>([]);
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

  const muscleOptions = muscles.map((m) => ({ value: m.id, label: m.label }));
  const isTriangle = values['stimulus.modulation.shape'] === 'TRIANGLE';

  const update = (path: FieldPath, value: string) => {
    setValues((v) => ({ ...v, [path]: value }));
    setClientErrors((errs) => errs.filter((e) => e.field !== path));
    setEdited((s) => new Set(s).add(path));
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (running) return;
    const result = parseForm(values, muscles);
    if (result.ok) {
      setClientErrors([]);
      onSubmit(result.request);
    } else {
      setClientErrors(result.errors);
    }
  };

  const reset = () => {
    setValues(toFormValues());
    setClientErrors([]);
  };

  const renderField = (spec: FieldSpec) => {
    const id = `f-${spec.path.replace(/\./g, '-')}`;
    const errs = byField[spec.path];
    const disabled = running || (spec.path === 'stimulus.modulation.peakTimeMs' && !isTriangle);
    const describedBy = errs ? `${id}-err` : undefined;
    return (
      <div key={spec.path} className={`field${errs ? ' field--invalid' : ''}`}>
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

  return (
    <form className="sim-form" onSubmit={submit} noValidate aria-label="Parâmetros da simulação">
      {FIELD_GROUPS.map((g) => (
        <fieldset key={g.id} className="group">
          <legend>{g.title}</legend>
          <div className="group-grid">{g.fields.map(renderField)}</div>
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
