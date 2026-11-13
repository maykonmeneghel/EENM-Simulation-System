import type { Dispatch, ReactNode, SetStateAction } from 'react';
import type { FieldPath, FormValues } from '../application/formModel';
import { driveActive, electrodeInput } from '../application/formModel';
import type { EffectModel, ElectrodeShape, Excitability, SourcedValue } from '../domain/electrode';
import {
  AXON_DEPTH_SOURCE,
  EFFECT_OPTIONS,
  ELECTRODE_RANGES,
  MATERIAL_SOURCES,
  NOT_MODELLED,
  SIZE_SOURCES,
  electrodeArea,
  fatOptions,
} from '../domain/electrode';
import type { AxonRecruitment } from '../domain/modelEquations';
import type { MuscleId } from '../domain/simulation';
import { HelpButton } from './HelpButton';
import { SegmentedControl } from './SegmentedControl';
import { Switch } from './Switch';
import { evidenceText } from './evidence';
import { fmtNumber, tr } from '../i18n/locale';

export interface ElectrodeSectionProps {
  values: FormValues;
  setValues: Dispatch<SetStateAction<FormValues>>;
  byField: Partial<Record<FieldPath, string[]>>;
  running: boolean;
  excitability: Excitability | null;
  /** Thresholds at the current pulse width (null when not computable). */
  plateau: AxonRecruitment | null;
  pulseWidthUs: number | null;
}

const parse = (raw: string) => {
  const t = raw.trim().replace(',', '.');
  return t === '' ? NaN : Number(t);
};
const fmt = (x: number, digits = 2) => (Number.isFinite(x) ? fmtNumber(x, { maximumFractionDigits: digits }) : '—');
const short = (x: number) => String(Number(x.toFixed(2)));

const PROVENANCE: Record<SourcedValue['provenance'], { pt: string; en: string; tone: 'good' | 'warn' }> = {
  MEASURED: { pt: 'Medido', en: 'Measured', tone: 'good' },
  INHERITED: { pt: 'Herdado', en: 'Inherited', tone: 'warn' },
  ILLUSTRATIVE: { pt: 'Ilustrativo', en: 'Illustrative', tone: 'warn' },
  DERIVED: { pt: 'Modelo', en: 'Model', tone: 'warn' },
};

/** Provenance + evidence badges and the citation of one value (the conditions' pattern, ui/evidence.ts). */
export function SourceBadges({ source, withNote = true }: { source: SourcedValue; withNote?: boolean }) {
  const p = PROVENANCE[source.provenance];
  return (
    <span className="electrode-source">
      <span className={`badge badge--${p.tone}`}>{tr({ 'pt-BR': p.pt, en: p.en })}</span>
      {source.evidence ? (
        <span className={`badge badge--${source.evidence === 'FULL_TEXT' ? 'good' : 'warn'}`}>{evidenceText(source.evidence)}</span>
      ) : null}
      {source.doi ? (
        <a href={`https://doi.org/${source.doi}`} target="_blank" rel="noreferrer">
          {source.citation}
        </a>
      ) : (
        source.citation
      )}
      {withNote ? <span className="electrode-note"> — {tr(source.note)}</span> : null}
    </span>
  );
}

function NumberField({
  path,
  label,
  unit,
  values,
  update,
  byField,
  disabled,
  hint,
}: {
  path: FieldPath;
  label: string;
  unit: string;
  values: FormValues;
  update(path: FieldPath, value: string): void;
  byField: Partial<Record<FieldPath, string[]>>;
  disabled: boolean;
  hint?: ReactNode;
}) {
  const id = `el-${path.replace(/\./g, '-')}`;
  const errors = byField[path];
  return (
    <div className={`electrode-field${errors ? ' electrode-field--invalid' : ''}`}>
      <label htmlFor={id}>{label}</label>
      <span className="electrode-input">
        <input
          id={id}
          type="text"
          inputMode="decimal"
          value={values[path]}
          disabled={disabled}
          aria-invalid={errors ? true : undefined}
          onChange={(e) => update(path, e.target.value)}
        />
        <span className="dial-unit">{unit}</span>
      </span>
      {hint ? <small className="dial-hint">{hint}</small> : null}
      {errors ? (
        <small className="field-error" role="alert">
          {errors.join('; ')}
        </small>
      ) : null}
    </div>
  );
}

/** The Electrode section of the Stimulator panel (docs/design/electrode.md §5): skin-surface LITERATURE runs only. */
export function ElectrodeSection({ values, setValues, byField, running, excitability, plateau, pulseWidthUs }: ElectrodeSectionProps) {
  const update = (path: FieldPath, value: string) => setValues((v) => ({ ...v, [path]: value }));
  const muscle = values.muscle as MuscleId;
  const shape: ElectrodeShape = values['electrode.shape'] === 'ROUND' ? 'ROUND' : 'RECTANGLE';
  const input = electrodeInput(values);
  const area = input ? electrodeArea(input.electrode) : NaN;
  const effect: EffectModel = values['electrode.effectModel'] === 'NONE' ? 'NONE' : 'HALF_SPACE_AF';
  const calibrated = values.calibrationEnabled;
  const unit = calibrated ? 'mA' : tr({ 'pt-BR': 'u.m.', en: 'm.u.' });
  const sizeSource = SIZE_SOURCES[muscle] ?? SIZE_SOURCES.SOLEUS;
  const fats = fatOptions(muscle);
  const fat = parse(values['electrode.fatThicknessCm']);
  const drive = driveActive(values);

  // a new shape keeps the area: a square of the same area, or the disk of the same area
  const setShape = (next: ElectrodeShape) =>
    setValues((v) => {
      const e = electrodeInput(v);
      const s = e ? electrodeArea(e.electrode) : NaN;
      if (!(s > 0)) return { ...v, 'electrode.shape': next };
      return next === 'ROUND'
        ? { ...v, 'electrode.shape': next, 'electrode.diameterCm': short(2 * Math.sqrt(s / Math.PI)) }
        : { ...v, 'electrode.shape': next, 'electrode.widthCm': short(Math.sqrt(s)), 'electrode.lengthCm': short(Math.sqrt(s)) };
    });

  const summary = `${shape === 'ROUND' ? `Ø ${values['electrode.diameterCm']} cm` : `${values['electrode.widthCm']} × ${values['electrode.lengthCm']} cm`} · G = ${
    excitability ? fmt(excitability.g) : '—'
  }${calibrated ? ' · mA' : ''}`;

  return (
    <details className="stimulator-section electrode-section" aria-label={tr({ 'pt-BR': 'Eletrodo', en: 'Electrode' })}>
      <summary className="electrode-summary">
        <span className="dial-label">{tr({ 'pt-BR': 'Eletrodo', en: 'Electrode' })}</span>
        <span className="electrode-summary-value">{summary}</span>
      </summary>
      <div className="electrode-body">
        <p className="dial-hint">
          {tr({
            'pt-BR':
              'Tudo o que o eletrodo muda entra como um fator G no limiar de todos os axônios: A ≥ G · I_rh,k (1 + τ_SD/PW). No eletrodo, gordura e profundidade padrão do músculo, G = 1 (o resultado é o de antes).',
            en:
              "Everything the electrode changes enters as one factor G on every axon's threshold: A ≥ G · I_rh,k (1 + τ_SD/PW). At the muscle's default electrode, fat and depth, G = 1 (the result is the same as before).",
          })}
        </p>

        <div className="electrode-row">
          <span className="dial-label" id="el-shape-label">
            {tr({ 'pt-BR': 'Formato', en: 'Shape' })}
          </span>
          <SegmentedControl<ElectrodeShape>
            id="el-shape"
            label={tr({ 'pt-BR': 'Formato do eletrodo', en: 'Electrode shape' })}
            options={[
              { value: 'RECTANGLE', label: tr({ 'pt-BR': 'Retangular', en: 'Rectangular' }) },
              { value: 'ROUND', label: tr({ 'pt-BR': 'Redondo', en: 'Round' }) },
            ]}
            value={shape}
            disabled={running}
            size="small"
            onChange={setShape}
          />
        </div>
        <div className="electrode-grid">
          {shape === 'ROUND' ? (
            <NumberField path="electrode.diameterCm" label={tr({ 'pt-BR': 'Diâmetro', en: 'Diameter' })} unit="cm" values={values} update={update} byField={byField} disabled={running} />
          ) : (
            <>
              <NumberField path="electrode.widthCm" label={tr({ 'pt-BR': 'Largura', en: 'Width' })} unit="cm" values={values} update={update} byField={byField} disabled={running} />
              <NumberField path="electrode.lengthCm" label={tr({ 'pt-BR': 'Comprimento', en: 'Length' })} unit="cm" values={values} update={update} byField={byField} disabled={running} />
            </>
          )}
        </div>
        <small className="dial-hint">
          {tr({ 'pt-BR': `área ${fmt(area)} cm²`, en: `area ${fmt(area)} cm²` })} ·{' '}
          {tr({ 'pt-BR': `faixa ${ELECTRODE_RANGES.areaCm2.min}–${ELECTRODE_RANGES.areaCm2.max} cm² · padrão do músculo:`, en: `range ${ELECTRODE_RANGES.areaCm2.min}–${ELECTRODE_RANGES.areaCm2.max} cm² · muscle default:` })}{' '}
          <SourceBadges source={sizeSource} />
        </small>

        <NumberField
          path="electrode.fatThicknessCm"
          label={tr({ 'pt-BR': 'Gordura subcutânea', en: 'Subcutaneous fat' })}
          unit="cm"
          values={values}
          update={update}
          byField={byField}
          disabled={running}
          hint={tr({ 'pt-BR': '0 – 3 cm · valores medidos (escolha um artigo):', en: '0 – 3 cm · measured values (pick a paper):' })}
        />
        <ul className="electrode-options" aria-label={tr({ 'pt-BR': 'Espessuras de gordura medidas', en: 'Measured fat thicknesses' })}>
          {fats.map((f) => (
            <li key={f.citation}>
              <button
                type="button"
                className={`electrode-chip${Math.abs(fat - f.valueCm) < 1e-9 ? ' electrode-chip--on' : ''}`}
                disabled={running}
                aria-pressed={Math.abs(fat - f.valueCm) < 1e-9}
                onClick={() => update('electrode.fatThicknessCm', String(f.valueCm))}
              >
                {fmt(f.valueCm)} cm
              </button>{' '}
              <SourceBadges source={f} />
            </li>
          ))}
        </ul>

        <NumberField
          path="electrode.axonDepthCm"
          label={tr({ 'pt-BR': 'Profundidade do axônio abaixo da gordura', en: 'Axon depth below the fat' })}
          unit="cm"
          values={values}
          update={update}
          byField={byField}
          disabled={running}
          hint={
            <>
              0,1 – 1,1 cm · <SourceBadges source={AXON_DEPTH_SOURCE} />
            </>
          }
        />

        <fieldset className="electrode-effect" disabled={running}>
          <legend className="dial-label">
            {tr({ 'pt-BR': 'Efeito no recrutamento', en: 'Effect on recruitment' })}{' '}
            <HelpButton label={tr({ 'pt-BR': 'Efeito do eletrodo no recrutamento', en: 'Effect of the electrode on recruitment' })}>
              {tr({
                'pt-BR':
                  'As fontes discordam: escolha uma. A fórmula derivada calcula a função de ativação (segunda derivada do potencial ao longo do axônio) de um disco de corrente uniforme num meio homogêneo; acerta a direção medida (eletrodo maior ou gordura mais grossa pedem mais corrente) mas a magnitude é ilustrativa, não validada. Lieber & Kelly 1991 não acharam efeito do tamanho no torque.',
                en:
                  'The sources disagree: pick one. The derived formula computes the activating function (second derivative of the potential along the axon) of a uniform-current disk on a homogeneous medium; it gets the measured direction right (a larger electrode or thicker fat needs more current) but its magnitude is illustrative, not validated. Lieber & Kelly 1991 found no effect of size on torque.',
              })}
            </HelpButton>
          </legend>
          {EFFECT_OPTIONS.map((o) => (
            <label key={o.value} className="electrode-radio">
              <input
                type="radio"
                name="electrode-effect"
                value={o.value}
                checked={effect === o.value}
                onChange={() => update('electrode.effectModel', o.value)}
              />
              <span>
                <strong>{tr(o.label)}</strong>
                {o.value === 'HALF_SPACE_AF' ? (
                  <span className="badge badge--warn electrode-flag">
                    {tr({ 'pt-BR': 'modelo derivado, magnitude ilustrativa, não validada', en: 'derived model, illustrative magnitude, not validated' })}
                  </span>
                ) : null}
                <small className="dial-hint electrode-option-note">
                  {tr(o.note)}{' '}
                  {o.sources.map((s) => (
                    <SourceBadges key={s.citation} source={s} withNote={false} />
                  ))}
                </small>
              </span>
            </label>
          ))}
        </fieldset>

        <div className="electrode-row electrode-row--text">
          <span className="dial-label">{tr({ 'pt-BR': 'Material / impedância', en: 'Material / impedance' })}</span>
          <small className="dial-hint">
            {tr({
              'pt-BR': 'Sem efeito: o estimulador é de corrente constante (efeito zero verificado).',
              en: 'No effect: the stimulator is current-controlled (verified zero effect).',
            })}{' '}
            {MATERIAL_SOURCES.map((s) => (
              <SourceBadges key={s.citation} source={s} withNote={false} />
            ))}
          </small>
        </div>

        <NumberField
          path="centralDrive.electrodeFraction"
          label={tr({ 'pt-BR': 'Posição no axônio (com comando central)', en: 'Position on the axon (with a central drive)' })}
          unit={tr({ 'pt-BR': 'do soma', en: 'from the soma' })}
          values={values}
          update={update}
          byField={byField}
          disabled={running || !drive}
          hint={
            drive
              ? tr({ 'pt-BR': '0,01 – 1: onde os disparos da FES e os centrais se encontram', en: '0.01 – 1: where the FES and central spikes meet' })
              : tr({ 'pt-BR': 'só conta com o drive central ligado (grupo Drive central)', en: 'only counts with the central drive on (Central drive group)' })
          }
        />

        <Switch
          checked={calibrated}
          disabled={running}
          label={tr({ 'pt-BR': 'Calibrar em mA (opcional)', en: 'Calibrate in mA (optional)' })}
          description={
            calibrated
              ? undefined
              : tr({ 'pt-BR': 'com o limiar motor que você mediu: a amplitude passa a ser em mA', en: 'with the motor threshold you measured: the amplitude is then in mA' })
          }
          onChange={(on) =>
            setValues((v) => ({
              ...v,
              calibrationEnabled: on,
              // the measurement electrode starts as the current one
              ...(on && input ? { 'electrode.calibration.electrodeAreaCm2': short(electrodeArea(input.electrode)) } : {}),
            }))
          }
        />
        {calibrated ? (
          <div className="electrode-grid">
            <NumberField path="electrode.calibration.motorThresholdMa" label={tr({ 'pt-BR': 'Limiar motor medido', en: 'Measured motor threshold' })} unit="mA" values={values} update={update} byField={byField} disabled={running} />
            <NumberField path="electrode.calibration.fullRecruitmentMa" label={tr({ 'pt-BR': 'Recrutamento total (opcional)', en: 'Full recruitment (optional)' })} unit="mA" values={values} update={update} byField={byField} disabled={running} />
            <NumberField path="electrode.calibration.pulseWidthUs" label={tr({ 'pt-BR': 'Largura de pulso da medida', en: 'Pulse width of the measurement' })} unit="µs" values={values} update={update} byField={byField} disabled={running} />
            <NumberField path="electrode.calibration.electrodeAreaCm2" label={tr({ 'pt-BR': 'Área do eletrodo da medida', en: 'Area of the measurement electrode' })} unit="cm²" values={values} update={update} byField={byField} disabled={running} />
          </div>
        ) : null}

        <p className="electrode-readout" aria-live="polite">
          {excitability && plateau
            ? tr({
                'pt-BR': `Leitura: G = ${fmt(excitability.g)} · 1ª unidade ${fmt(plateau.thresholdMin, 1)} ${unit} · todas ${fmt(plateau.thresholdMax, 1)} ${unit} (com ${fmt(pulseWidthUs ?? NaN, 0)} µs)`,
                en: `Reading: G = ${fmt(excitability.g)} · first unit ${fmt(plateau.thresholdMin, 1)} ${unit} · all ${fmt(plateau.thresholdMax, 1)} ${unit} (at ${fmt(pulseWidthUs ?? NaN, 0)} µs)`,
              })
            : tr({ 'pt-BR': 'Leitura: informe valores numéricos válidos.', en: 'Reading: enter valid numbers.' })}
        </p>

        <div className="electrode-row electrode-row--text">
          <span className="dial-label">{tr({ 'pt-BR': 'Não modelado', en: 'Not modelled' })}</span>
          <ul className="electrode-notmodelled">
            {NOT_MODELLED.map((n) => (
              <li key={n.label.en}>
                {tr(n.label)}
                {n.sources.length ? ` (${n.sources.join(', ')})` : ''}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </details>
  );
}
