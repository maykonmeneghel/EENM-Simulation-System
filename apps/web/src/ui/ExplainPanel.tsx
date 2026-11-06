import type { FormValues } from '../application/formModel';
import { driveActive, tremorActive } from '../application/formModel';
import { stagesFor } from '../domain/modelEquations';
import type { ReferenceId } from '../domain/references';
import { REFERENCES, scholarUrl, shortCite, sourceUrl } from '../domain/references';
import type { AxonEvents, ModelVariant, StimulationSite } from '../domain/simulation';
import { formatDecimal as fmt, signalPath } from '../application/signalPath';
import { STAGE_EXPLANATIONS } from './stageExplanations';

function Cite({ id, supports }: { id: ReferenceId; supports?: string }) {
  const r = REFERENCES[id];
  return (
    <li className="explain-ref">
      {shortCite(r)}
      {supports ? <span className="muted"> — {supports}</span> : null} ·{' '}
      <a href={scholarUrl(r)} target="_blank" rel="noreferrer">
        Google Scholar
      </a>{' '}
      ·{' '}
      <a href={sourceUrl(r)} target="_blank" rel="noreferrer">
        {r.doi ? `doi:${r.doi}` : `PubMed ${r.pmid}`}
      </a>
    </li>
  );
}

export interface ExplainPanelProps {
  values: FormValues;
  axonEvents: AxonEvents | null;
}

/** Right sidebar: what is being simulated and why, with the sources and the known limits. */
export function ExplainPanel({ values, axonEvents }: ExplainPanelProps) {
  const invasive = values.stimulationSite === 'MOTONEURON_POOL';
  const drive = driveActive(values);
  const tremor = tremorActive(values);
  const stages = stagesFor(values.modelVariant as ModelVariant, values.stimulationSite as StimulationSite);
  const sent = axonEvents ? axonEvents.centralTransmitted : 0;
  return (
    <div className="explain">
      <section className="explain-section" aria-labelledby="explain-mode">
        <h2 id="explain-mode">{invasive ? 'Modo invasivo' : 'Modo não invasivo'}</h2>
        <ol className="explain-steps">
          {signalPath(values).map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
      </section>

      {drive ? (
        <section className="explain-section" aria-labelledby="explain-drive">
          <h3 id="explain-drive">Drive central{tremor ? ' e tremor' : ''}</h3>
          <p>
            Fundo {fmt(values['centralDrive.backgroundNa'])} nA, voluntário {fmt(values['centralDrive.voluntaryNa'])}{' '}
            nA, ruído {fmt(values['centralDrive.noiseCv'])} × a média
            {tremor
              ? `, tremor de ${fmt(values['centralDrive.tremor.amplitudeNa'])} nA a ${fmt(values['centralDrive.tremor.frequencyHz'])} Hz`
              : ''}
            {values['centralDrive.currentScale'] === 'RHEOBASE' ? ' (multiplicados por 0,45, pela reobase)' : ''}. A
            mesma oscilação vai a todos os motoneurônios; a alternância entre flexor e extensor virá do reflexo Ia
            (fase 4), ainda não modelado.
          </p>
          <ul className="explain-refs">
            <Cite id="gallego2015" supports="valores do drive (modelo de tremor essencial, mesmo motoneurônio)" />
            {tremor ? <Cite id="dideriksen2017" supports="tremor do punho em Parkinson, 4,4 ± 1,0 Hz" /> : null}
            {tremor ? <Cite id="agapaki2018" supports="tremor de repouso 5,9 ± 0,8 Hz; unidades a 10,9 ± 2,9 Hz" /> : null}
          </ul>
        </section>
      ) : null}

      {drive && !invasive ? (
        <section className="explain-section" aria-labelledby="explain-axon">
          <h3 id="explain-axon">Encontro no axônio</h3>
          {axonEvents ? (
            <dl className="explain-counts">
              <dt>Disparos centrais</dt>
              <dd>{axonEvents.central.toLocaleString('pt-BR')}</dd>
              <dt>… que chegaram ao músculo</dt>
              <dd>{sent.toLocaleString('pt-BR')}</dd>
              <dt>Colisões</dt>
              <dd>{axonEvents.collisions.toLocaleString('pt-BR')}</dd>
              <dt>Disparos do FES enviados</dt>
              <dd>{axonEvents.fesTransmitted.toLocaleString('pt-BR')}</dd>
              <dt>Pulsos bloqueados (refratário)</dt>
              <dd>{axonEvents.fesBlocked.toLocaleString('pt-BR')}</dd>
              <dt>Reinícios do soma</dt>
              <dd>{axonEvents.resets.toLocaleString('pt-BR')}</dd>
            </dl>
          ) : (
            <p className="muted">As contagens aparecem durante a simulação.</p>
          )}
          <ul className="explain-refs">
            <Cite id="formento2018" supports="regras de colisão e período refratário (fibras sensitivas; aplicar a fibras motoras é passo nosso)" />
          </ul>
        </section>
      ) : null}

      {drive ? (
        <section className="explain-section explain-section--warn" aria-labelledby="explain-limits">
          <h3 id="explain-limits">Limites conhecidos</h3>
          <ul>
            <li>
              O motoneurônio herdado (Booth et al. 1997, feito para gerar platôs) dispara a 50–95 Hz e continua
              disparando depois que a corrente acaba. Em Parkinson as unidades disparam a 10,9 ± 2,9 Hz e os dupletos
              têm 41,6 ms; aqui os intervalos curtos têm ≈ 17 ms.
            </li>
            <li>A frequência do tremor na força confere com a do drive (4,33 Hz para 4,4 Hz no teste de validação, FCR com 120 unidades).</li>
            <li>A amplitude de 3 nA vem de um modelo de tremor essencial; não há valor medido em Parkinson.</li>
          </ul>
        </section>
      ) : null}

      <section className="explain-section" aria-labelledby="explain-stages">
        <h3 id="explain-stages">Etapas do modelo</h3>
        {stages.map((id) => {
          const ex = STAGE_EXPLANATIONS[id];
          return (
            <details key={id} className="explain-stage">
              <summary>Etapa {id}</summary>
              <p>{ex.plain}</p>
              {ex.inherited ? <p className="muted">Herdado do modelo original: {ex.inherited}</p> : null}
              <ul className="explain-refs">
                {ex.refs.map((r) => (
                  <Cite key={r.id} id={r.id} supports={r.supports} />
                ))}
              </ul>
            </details>
          );
        })}
      </section>
    </div>
  );
}
