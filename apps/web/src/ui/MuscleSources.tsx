import type { CalibrationTarget, MusclePreset, PresetFieldSource } from '../domain/simulation';
import { HelpButton } from './HelpButton';
import { evidenceText } from './evidence';
import type { Localized } from '../i18n/locale';
import { tr } from '../i18n/locale';

const scholar = (title: string) => `https://scholar.google.com/scholar?q=${encodeURIComponent(`"${title}"`)}`;

const BADGE: Record<PresetFieldSource['provenance'], { text: Localized; tone: string }> = {
  MEASURED: { text: { 'pt-BR': 'Medido', en: 'Measured' }, tone: 'good' },
  FITTED: { text: { 'pt-BR': 'Ajustado', en: 'Fitted' }, tone: 'good' },
  INHERITED: { text: { 'pt-BR': 'Herdado', en: 'Inherited' }, tone: 'warn' },
};

export interface MuscleSourcesProps {
  preset: MusclePreset | undefined;
  calibrationTarget: CalibrationTarget;
}

/** Where each value of the chosen preset comes from: measured, fitted to this muscle's data, or inherited. */
export function MuscleSources({ preset, calibrationTarget }: MuscleSourcesProps) {
  const fields = (preset?.provenance ?? []).filter(
    (f) => f.calibrationTarget === null || f.calibrationTarget === calibrationTarget,
  );
  if (fields.length === 0) return null;
  return (
    <div className="row muscle-sources">
      <div className="row-label">
        <span>{tr({ 'pt-BR': 'Origem dos valores', en: 'Source of the values' })}</span>
        <HelpButton label={tr({ 'pt-BR': 'Origem dos valores do músculo', en: "Source of the muscle's values" })}>
          {tr({
            'pt-BR':
              'Medido: lido num estudo humano deste músculo. Ajustado: o modelo foi calibrado para reproduzir um valor ' +
              'medido neste músculo. Herdado: não há dado verificado, e o valor é o do sóleo. Os itens de tempo do abalo ' +
              'mudam com a calibração escolhida.',
            en:
              'Measured: read in a human study of this muscle. Fitted: the model was calibrated to reproduce a value ' +
              'measured in this muscle. Inherited: there is no verified data, and the value is the soleus one. The twitch ' +
              'timing items change with the chosen calibration.',
          })}
        </HelpButton>
      </div>
      <ul className="adjustments" aria-label={tr({ 'pt-BR': `Origem dos valores de ${preset?.label ?? ''}`, en: `Source of the values of ${preset?.label ?? ''}` })}>
        {fields.map((f) => {
          const badge = BADGE[f.provenance];
          const s = f.source;
          const link = s?.doi
            ? { href: `https://doi.org/${s.doi}`, text: `doi:${s.doi}` }
            : s?.pmid
            ? { href: `https://pubmed.ncbi.nlm.nih.gov/${s.pmid}/`, text: `PubMed ${s.pmid}` }
            : null;
          return (
            <li key={`${f.field}-${f.calibrationTarget ?? 'all'}`} className="adjustment">
              <p className="adjustment-finding">
                <span className={`badge badge--${badge.tone}`}>{tr(badge.text)}</span>{' '}
                {f.evidence ? (
                  <span className={`badge badge--${f.evidence === 'FULL_TEXT' ? 'good' : 'warn'}`}>
                    {evidenceText(f.evidence)}
                  </span>
                ) : null}{' '}
                <strong>{f.field}</strong>
              </p>
              <p className="adjustment-effect">{f.value}</p>
              {s ? (
                <p className="adjustment-source">
                  {s.citation} ·{' '}
                  <a href={scholar(s.title)} target="_blank" rel="noreferrer">
                    Google Scholar
                  </a>
                  {link ? (
                    <>
                      {' '}
                      ·{' '}
                      <a href={link.href} target="_blank" rel="noreferrer">
                        {link.text}
                      </a>
                    </>
                  ) : null}
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
