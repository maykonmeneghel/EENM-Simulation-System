import type { CalibrationTarget, MusclePreset, PresetFieldSource } from '../domain/simulation';
import { HelpButton } from './HelpButton';

const scholar = (title: string) => `https://scholar.google.com/scholar?q=${encodeURIComponent(`"${title}"`)}`;

const BADGE: Record<PresetFieldSource['provenance'], { text: string; tone: string }> = {
  MEASURED: { text: 'Medido', tone: 'good' },
  FITTED: { text: 'Ajustado', tone: 'good' },
  INHERITED: { text: 'Herdado', tone: 'warn' },
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
        <span>Origem dos valores</span>
        <HelpButton label="Origem dos valores do músculo">
          Medido: lido num estudo humano deste músculo. Ajustado: o modelo foi calibrado para reproduzir um valor
          medido neste músculo. Herdado: não há dado verificado, e o valor é o do sóleo. Os itens de tempo do abalo
          mudam com a calibração escolhida.
        </HelpButton>
      </div>
      <ul className="adjustments" aria-label={`Origem dos valores de ${preset?.label ?? ''}`}>
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
                <span className={`badge badge--${badge.tone}`}>{badge.text}</span>{' '}
                {f.evidence ? (
                  <span className={`badge badge--${f.evidence === 'FULL_TEXT' ? 'good' : 'warn'}`}>
                    {f.evidence === 'FULL_TEXT' ? 'texto completo' : 'só resumo'}
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
