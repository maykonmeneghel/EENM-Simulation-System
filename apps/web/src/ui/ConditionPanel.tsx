import type { FormValues } from '../application/formModel';
import { changeCondition, toggleAdjustment } from '../application/formModel';
import type { ConditionAdjustment, ConditionId, ConditionInfo } from '../domain/simulation';
import { HelpButton } from './HelpButton';
import { Switch } from './Switch';

const scholar = (title: string) => `https://scholar.google.com/scholar?q=${encodeURIComponent(`"${title}"`)}`;
const sourceLink = (s: ConditionAdjustment['source']) =>
  s.doi ? { href: `https://doi.org/${s.doi}`, text: `doi:${s.doi}` } : { href: `https://pubmed.ncbi.nlm.nih.gov/${s.pmid}/`, text: `PubMed ${s.pmid}` };

/** Measurements outside the default muscle are flagged: most condition data are not from the soleus. */
const otherMuscle = (a: ConditionAdjustment) => /outro músculo|mão|coxa|quadríceps/i.test(a.measuredIn);

export interface ConditionPanelProps {
  values: FormValues;
  onChange(next: FormValues): void;
  conditions: readonly ConditionInfo[];
  error: string | null;
  disabled: boolean;
}

/** Condition picker and its per-article adjustments, each switchable, with its evidence and source. */
export function ConditionPanel({ values, onChange, conditions, error, disabled }: ConditionPanelProps) {
  const options = conditions.length > 0 ? conditions : [{ id: 'NORMAL' as const, label: 'Normal', adjustments: [] }];
  const current = options.find((c) => c.id === values.condition) ?? options[0]!;
  const chosen = new Set(
    values.conditionAdjustments ?? current.adjustments.filter((a) => a.default && a.available).map((a) => a.id),
  );
  return (
    <div className="condition">
      <div className="row">
        <div className="row-main">
          <span className="row-label">
            <label htmlFor="f-condition">Condição</label>
            <HelpButton label="Condição">
              Cada condição traz ajustes tirados de artigos, um por achado, que você liga ou desliga. Os selos dizem se o
              valor foi lido no texto completo ou só no resumo e se foi medido em outro músculo que não o simulado. Os
              ajustes que se sobrepõem ficam separados para você escolher.
            </HelpButton>
          </span>
          <span className="row-control">
            <span className="popup">
              <select
                id="f-condition"
                className="popup-select"
                value={current.id}
                disabled={disabled || conditions.length === 0}
                onChange={(e) => onChange(changeCondition(values, e.target.value as ConditionId, conditions))}
              >
                {options.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </span>
          </span>
        </div>
        {error ? <small className="field-error">{error}</small> : null}
      </div>

      {current.adjustments.length > 0 ? (
        <ul className="adjustments" aria-label={`Ajustes de ${current.label}`}>
          {current.adjustments.map((a) => {
            const link = sourceLink(a.source);
            return (
              <li key={a.id} className={`adjustment${a.available ? '' : ' adjustment--unavailable'}`}>
                <Switch
                  checked={a.available && chosen.has(a.id)}
                  disabled={disabled || !a.available}
                  label={a.label}
                  onChange={(on) => onChange(toggleAdjustment(values, a.id, on, conditions))}
                />
                <p className="adjustment-effect">{a.effect}</p>
                <p className="adjustment-finding">
                  <span className={`badge badge--${a.evidence === 'FULL_TEXT' ? 'good' : 'warn'}`}>
                    {a.evidence === 'FULL_TEXT' ? 'Texto completo' : 'Só resumo'}
                  </span>
                  {otherMuscle(a) ? <span className="badge badge--warn">Outro músculo</span> : null}{' '}
                  {a.finding} <span className="muted">({a.measuredIn})</span>
                </p>
                <p className="adjustment-source">
                  {a.source.citation} ·{' '}
                  <a href={scholar(a.source.title)} target="_blank" rel="noreferrer">
                    Google Scholar
                  </a>{' '}
                  ·{' '}
                  <a href={link.href} target="_blank" rel="noreferrer">
                    {link.text}
                  </a>
                </p>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
