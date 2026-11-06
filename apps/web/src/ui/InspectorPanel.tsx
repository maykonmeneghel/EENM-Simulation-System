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
import type { Localized } from '../i18n/locale';
import { getLocale, tr } from '../i18n/locale';
import { useLocale } from '../i18n/useLocale';

function Cite({ id, supports }: { id: ReferenceId; supports?: string }) {
  const r = REFERENCES[id];
  return (
    <li className="explain-ref">
      <span className="explain-ref-cite">{shortCite(r)}</span>
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
  useLocale();
  if (topic === null) {
    return (
      <div className="inspector-empty">
        <InfoGlyph />
        <p>
          {tr({
            'pt-BR': 'Clique num componente da área central — um gráfico, o osciloscópio, uma equação ou um bloco do diagrama — para ver a explicação e as referências.',
            en: 'Click a component of the central area — a chart, the oscilloscope, an equation or a block of the diagram — to see its explanation and references.',
          })}
        </p>
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
  const stageWord = tr({ 'pt-BR': 'Etapa', en: 'Stage' });
  return (
    <div className="explain">
      <header className="inspector-head">
        <h2 id="inspector-title">{view.title}</h2>
        {topic.kind === 'help' ? null : (
          <p className="muted">
            {invasive ? tr({ 'pt-BR': 'Modo invasivo', en: 'Invasive mode' }) : tr({ 'pt-BR': 'Modo não invasivo', en: 'Non-invasive mode' })}
            {drive ? tr({ 'pt-BR': ' · drive central', en: ' · central drive' }) : ''}
            {tremor ? ' · tremor' : ''}
          </p>
        )}
      </header>

      {topic.kind === 'help' ? (
        <section className="explain-section explain-section--help" aria-label={`${tr({ 'pt-BR': 'Ajuda', en: 'Help' })}: ${topic.label}`}>
          <p>{topic.content}</p>
        </section>
      ) : null}

      {view.reading ? (
        <section className="explain-section explain-section--reading" aria-labelledby="explain-reading">
          <h3 id="explain-reading">{tr({ 'pt-BR': 'O que o gráfico mostra', en: 'What the chart shows' })}</h3>
          {view.reading.map((t) => (
            <p key={t}>{t}</p>
          ))}
        </section>
      ) : null}

      {view.stages.map((id) => {
        const ex = STAGE_EXPLANATIONS[id];
        return (
          <section key={id} className="explain-section" aria-label={`${stageWord} ${id}`}>
            {view.stages.length > 1 ? <h3>{stageWord} {id} · {STAGE_TITLES[id]}</h3> : null}
            <p>{ex.plain}</p>
            {ex.inherited ? <p className="muted">{tr({ 'pt-BR': 'Herdado do modelo original', en: 'Inherited from the original model' })}: {ex.inherited}</p> : null}
            <ul className="explain-refs">
              {ex.refs.map((r) => (
                <Cite key={r.id} id={r.id} supports={r.supports} />
              ))}
            </ul>
            {onShowEquation && stagesNow.includes(id) ? (
              <button type="button" className="btn btn--small btn--link" onClick={() => onShowEquation(id)}>
                {tr({ 'pt-BR': 'Ver a equação', en: 'See the equation' })}
              </button>
            ) : null}
          </section>
        );
      })}

      {view.path ? (
        <section className="explain-section" aria-labelledby="explain-mode">
          <h3 id="explain-mode">{tr({ 'pt-BR': 'Caminho do sinal', en: 'Signal path' })}</h3>
          <ol className="explain-steps">
            {signalPath(values).map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
        </section>
      ) : null}

      {view.drive && drive ? (
        <section className="explain-section" aria-labelledby="explain-drive">
          <h3 id="explain-drive">{tremor ? tr({ 'pt-BR': 'Drive central e tremor', en: 'Central drive and tremor' }) : tr({ 'pt-BR': 'Drive central', en: 'Central drive' })}</h3>
          <p>{driveText(values, tremor)}</p>
          <ul className="explain-refs">
            <Cite id="gallego2015" supports={tr({ 'pt-BR': 'valores do drive (modelo de tremor essencial, mesmo motoneurônio)', en: 'drive values (essential tremor model, same motoneuron)' })} />
            {tremor ? <Cite id="dideriksen2017" supports={tr({ 'pt-BR': 'tremor do punho em Parkinson, 4,4 ± 1,0 Hz', en: 'wrist tremor in Parkinson, 4.4 ± 1.0 Hz' })} /> : null}
            {tremor ? <Cite id="agapaki2018" supports={tr({ 'pt-BR': 'tremor de repouso 5,9 ± 0,8 Hz; unidades a 10,9 ± 2,9 Hz', en: 'rest tremor 5.9 ± 0.8 Hz; units at 10.9 ± 2.9 Hz' })} /> : null}
          </ul>
        </section>
      ) : null}

      {view.axon && drive && !invasive ? (
        <section className="explain-section" aria-labelledby="explain-axon">
          <h3 id="explain-axon">{tr({ 'pt-BR': 'Encontro no axônio', en: 'Meeting on the axon' })}</h3>
          {axonEvents ? (
            <dl className="explain-counts">
              <dt>{tr({ 'pt-BR': 'Disparos centrais', en: 'Central spikes' })}</dt>
              <dd>{axonEvents.central.toLocaleString(getLocale())}</dd>
              <dt>{tr({ 'pt-BR': '… que chegaram ao músculo', en: '… that reached the muscle' })}</dt>
              <dd>{sent.toLocaleString(getLocale())}</dd>
              <dt>{tr({ 'pt-BR': 'Colisões', en: 'Collisions' })}</dt>
              <dd>{axonEvents.collisions.toLocaleString(getLocale())}</dd>
              <dt>{tr({ 'pt-BR': 'Disparos do FES enviados', en: 'FES spikes sent' })}</dt>
              <dd>{axonEvents.fesTransmitted.toLocaleString(getLocale())}</dd>
              <dt>{tr({ 'pt-BR': 'Pulsos bloqueados (refratário)', en: 'Pulses blocked (refractory)' })}</dt>
              <dd>{axonEvents.fesBlocked.toLocaleString(getLocale())}</dd>
              <dt>{tr({ 'pt-BR': 'Reinícios do soma', en: 'Soma resets' })}</dt>
              <dd>{axonEvents.resets.toLocaleString(getLocale())}</dd>
            </dl>
          ) : (
            <p className="muted">{tr({ 'pt-BR': 'As contagens aparecem durante a simulação.', en: 'The counts appear during the simulation.' })}</p>
          )}
          <ul className="explain-refs">
            <Cite
              id="formento2018"
              supports={tr({
                'pt-BR': 'regras de colisão e período refratário (fibras sensitivas; aplicar a fibras motoras é passo nosso)',
                en: 'collision rules and refractory period (sensory fibers; applying them to motor fibers is our step)',
              })}
            />
          </ul>
        </section>
      ) : null}

      {view.drive && drive ? (
        <section className="explain-section explain-section--warn" aria-labelledby="explain-limits">
          <h3 id="explain-limits">{tr({ 'pt-BR': 'Validação e limites', en: 'Validation and limits' })}</h3>
          <ul>
            {tr(LIMITS).map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

/** The central drive in words, with the current values. */
function driveText(values: FormValues, tremor: boolean): string {
  const bg = fmt(values['centralDrive.backgroundNa']);
  const vol = fmt(values['centralDrive.voluntaryNa']);
  const noise = fmt(values['centralDrive.noiseCv']);
  const amp = fmt(values['centralDrive.tremor.amplitudeNa']);
  const hz = fmt(values['centralDrive.tremor.frequencyHz']);
  const rheobase = values['centralDrive.currentScale'] === 'RHEOBASE';
  return tr({
    'pt-BR':
      `Fundo ${bg} nA, voluntário ${vol} nA, ruído ${noise} × a média${tremor ? `, tremor de ${amp} nA a ${hz} Hz` : ''}` +
      `${rheobase ? ' (multiplicados por 0,45, pela reobase)' : ''}. A mesma oscilação vai a todos os motoneurônios; a ` +
      'alternância entre flexor e extensor virá do reflexo Ia (fase 4), ainda não modelado.',
    en:
      `Background ${bg} nA, voluntary ${vol} nA, noise ${noise} × the mean${tremor ? `, tremor of ${amp} nA at ${hz} Hz` : ''}` +
      `${rheobase ? ' (multiplied by 0.45, by the rheobase)' : ''}. The same oscillation goes to every motoneuron; the ` +
      'alternation between flexor and extensor will come from the Ia reflex (phase 4), not modelled yet.',
  });
}

const LIMITS: Localized<readonly string[]> = {
  'pt-BR': [
    'O drive vai a motoneurônios de Cisi & Kohn (2008). No teste da fase 2 (FCR, 120 unidades), em repouso com tremor as unidades disparam a 7,0 Hz (2,9–10,8) em salvas, com intervalos curtos de 49,7 ms — em Parkinson, 10,9 ± 2,9 Hz (faixa 6–18,5) e dupletos de 41,6 ± 5,1 ms (30–50) (Agapaki 2018). O CV no disparo tônico é 0,15 (alvo 10–30 %) e a força oscila a 4,33 Hz para um drive de 4,4 Hz.',
    'A amplitude de 3 nA vem de um modelo de tremor essencial; não há valor medido em Parkinson.',
    'As unidades FF têm pós-hiperpolarização menor que a publicada (≈ 1–2 contra 3,0 mV): condutância Ks do código, não da tabela de 2013.',
  ],
  en: [
    'The drive goes into Cisi & Kohn (2008) motoneurons. In the phase 2 test (FCR, 120 units), at rest with tremor the units fire at 7.0 Hz (2.9–10.8) in bursts, with short intervals of 49.7 ms — in Parkinson, 10.9 ± 2.9 Hz (range 6–18.5) and doublets of 41.6 ± 5.1 ms (30–50) (Agapaki 2018). The CV in tonic firing is 0.15 (target 10–30 %) and the force oscillates at 4.33 Hz for a 4.4 Hz drive.',
    'The 3 nA amplitude comes from an essential tremor model; there is no value measured in Parkinson.',
    'FF units have a smaller afterhyperpolarization than published (≈ 1–2 vs 3.0 mV): Ks conductance from the code, not from the 2013 table.',
  ],
};

function InfoGlyph() {
  return (
    <svg className="inspector-empty-glyph" viewBox="0 0 24 24" width="28" height="28" aria-hidden="true">
      <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M12 10.5v6M12 7.25v.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
