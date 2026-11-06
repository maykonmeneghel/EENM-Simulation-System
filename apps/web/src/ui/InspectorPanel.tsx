import type { InspectorTopic } from '../application/inspectorTopics';
import { topicView } from '../application/inspectorTopics';
import type { FormValues } from '../application/formModel';
import { driveActive, tremorActive } from '../application/formModel';
import type { StageId } from '../domain/modelEquations';
import { stagesFor } from '../domain/modelEquations';
import type { ReferenceId } from '../domain/references';
import { REFERENCES, scholarUrl, shortCite, sourceUrl } from '../domain/references';
import type { AxonEvents, ModelVariant, StimulationSite } from '../domain/simulation';
import { formatDecimal as fmt, signalPath } from '../application/signalPath';
import { STAGE_EXPLANATIONS, STAGE_TITLES } from './stageExplanations';

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

export interface InspectorPanelProps {
  topic: InspectorTopic | null;
  values: FormValues;
  axonEvents: AxonEvents | null;
  /** Opens the equations of a stage (step 2). */
  onShowEquation?(stage: StageId): void;
}

/**
 * Right sidebar: explains the component of the centre column the user clicked — what it shows in plain words, the
 * sources (Google Scholar + DOI), and, where it matters, the signal path of the current mode, the central drive, the
 * live axon-merge counts and the known limits.
 */
export function InspectorPanel({ topic, values, axonEvents, onShowEquation }: InspectorPanelProps) {
  if (topic === null) {
    return (
      <div className="inspector-empty">
        <InfoGlyph />
        <p>Clique num componente da área central — um gráfico, o osciloscópio, uma equação ou um bloco do diagrama — para ver a explicação e as referências.</p>
      </div>
    );
  }
  const invasive = values.stimulationSite === 'MOTONEURON_POOL';
  const drive = driveActive(values);
  const tremor = tremorActive(values);
  const stagesNow = stagesFor(values.modelVariant as ModelVariant, values.stimulationSite as StimulationSite, drive);
  const forceStages = stagesNow.filter((s) => ['5a', '5b', '6', '8a', '8b'].includes(s));
  const view = topicView(topic, forceStages, (s) => STAGE_TITLES[s]);
  const sent = axonEvents ? axonEvents.centralTransmitted : 0;
  return (
    <div className="explain">
      <header className="inspector-head">
        <h2 id="inspector-title">{view.title}</h2>
        <p className="muted">{invasive ? 'Modo invasivo' : 'Modo não invasivo'}{drive ? ' · drive central' : ''}{tremor ? ' · tremor' : ''}</p>
      </header>

      {view.stages.map((id) => {
        const ex = STAGE_EXPLANATIONS[id];
        return (
          <section key={id} className="explain-section" aria-label={`Etapa ${id}`}>
            {view.stages.length > 1 ? <h3>Etapa {id} · {STAGE_TITLES[id]}</h3> : null}
            <p>{ex.plain}</p>
            {ex.inherited ? <p className="muted">Herdado do modelo original: {ex.inherited}</p> : null}
            <ul className="explain-refs">
              {ex.refs.map((r) => (
                <Cite key={r.id} id={r.id} supports={r.supports} />
              ))}
            </ul>
            {onShowEquation && stagesNow.includes(id) ? (
              <button type="button" className="btn btn--small btn--link" onClick={() => onShowEquation(id)}>
                Ver a equação
              </button>
            ) : null}
          </section>
        );
      })}

      {view.path ? (
        <section className="explain-section" aria-labelledby="explain-mode">
          <h3 id="explain-mode">Caminho do sinal</h3>
          <ol className="explain-steps">
            {signalPath(values).map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
        </section>
      ) : null}

      {view.drive && drive ? (
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

      {view.axon && drive && !invasive ? (
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

      {view.drive && drive ? (
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
    </div>
  );
}

function InfoGlyph() {
  return (
    <svg className="inspector-empty-glyph" viewBox="0 0 24 24" width="28" height="28" aria-hidden="true">
      <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M12 10.5v6M12 7.25v.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
