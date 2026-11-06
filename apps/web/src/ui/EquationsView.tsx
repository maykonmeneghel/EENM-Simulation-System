import { useEffect, useMemo, useRef } from 'react';
import type { InspectorTopic } from '../application/inspectorTopics';
import { InfoIcon } from './InfoIcon';
import type { ModelSnapshot } from '../application/modelView';
import type { StageId } from '../domain/modelEquations';
import { REFERENCES, scholarUrl, sourceUrl } from '../domain/references';
import { STAGE_EXPLANATIONS } from './stageExplanations';
import { buildStageContents } from './stageTex';
import { Tex } from './Tex';
import { tr } from '../i18n/locale';
import { useLocale } from '../i18n/useLocale';

const L = (pt: string, en: string): string => tr({ 'pt-BR': pt, en });

export interface StageFocus {
  stage: StageId;
  /** Changes on every request so the same stage can be focused twice. */
  nonce: number;
  /** Move the keyboard focus to the stage (default); false when the change came from a sidebar control. */
  takeFocus?: boolean;
  /** What was just changed in the sidebar (shown on the stage, e.g. "Calibração do twitch: Unidade isolada"). */
  change?: string;
}

const stageElementId = (id: StageId) => `stage-${id}`;

export function EquationsView({
  snapshot,
  focus,
  onInspect,
}: {
  snapshot: ModelSnapshot;
  focus: StageFocus | null;
  /** Clicking a stage card opens its explanation and sources in the right sidebar. */
  onInspect?(topic: InspectorTopic): void;
}) {
  const locale = useLocale();
  // the texts read the locale when built, so a new locale rebuilds them
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const stages = useMemo(() => buildStageContents(snapshot), [snapshot, locale]);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!focus) return;
    const el = rootRef.current?.querySelector<HTMLElement>(`#${stageElementId(focus.stage)}`);
    if (!el) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView?.({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
    // a change in the sidebar highlights without taking the keyboard focus away from the control being edited
    if (focus.takeFocus !== false) el.focus({ preventScroll: true });
    el.classList.remove('stage--flash');
    void el.offsetWidth; // restart the highlight animation
    el.classList.add('stage--flash');
  }, [focus]);

  return (
    <div className="equations" ref={rootRef}>
      <p className="muted equations-intro">
        {snapshot.variant === 'ORIGINAL'
          ? L('Modelo original (MATLAB fiel)', 'Original model (faithful to the MATLAB code)')
          : L('Modelo corrigido pela literatura', 'Model corrected by the literature')}{' '}
        — {L('etapas', 'stages')} {snapshot.stages.join(', ')} {L('de', 'of')} <code>docs/model-equations.md</code>.{' '}
        {L('Os valores abaixo acompanham o formulário.', 'The values below follow the form.')}
      </p>
      {stages.map((st) => (
        <article
          key={st.id}
          id={stageElementId(st.id)}
          className={`card stage${onInspect ? ' card--inspectable' : ''}`}
          tabIndex={-1}
          onClick={onInspect ? (e) => {
            if ((e.target as HTMLElement).closest('a, button')) return;
            onInspect({ kind: 'stage', stage: st.id });
          } : undefined}
          aria-labelledby={`${stageElementId(st.id)}-title`}
          data-stage={st.id}
        >
          <header className="stage-header">
            <span className="stage-badge">{st.id}</span>
            <h3 id={`${stageElementId(st.id)}-title`}>{st.title}</h3>
            <code className="stage-source">{st.source}</code>
            {focus?.change && focus.stage === st.id ? (
              <span key={focus.nonce} className="stage-change" role="status">
                {focus.change}
              </span>
            ) : null}
            {onInspect ? (
              <button
                type="button"
                className="icon-button"
                aria-label={L(`Etapa ${st.id} — ver explicação`, `Stage ${st.id} — show explanation`)}
                onClick={() => onInspect({ kind: 'stage', stage: st.id })}
              >
                <InfoIcon />
              </button>
            ) : null}
          </header>
          <p className="stage-plain">
            <span className="stage-label">{L('Em palavras', 'In words')}</span>
            {STAGE_EXPLANATIONS[st.id].plain}
          </p>
          <div className="stage-math stage-math--symbolic">
            {st.symbolic.map((t, i) => (
              <Tex key={i} tex={t} display />
            ))}
          </div>
          <div className="stage-math stage-math--values" aria-label={L('Com os valores atuais', 'With the current values')}>
            <span className="stage-label">{L('Com os valores atuais', 'With the current values')}</span>
            {st.substituted.map((t, i) => (
              <Tex key={i} tex={t} display />
            ))}
          </div>
          {st.condition ? (
            <div className="stage-condition" role="note">
              <span className="stage-label">{L('Efeito da condição', 'Effect of the condition')}</span>
              {st.condition.map((t) => (
                <p key={t}>{t}</p>
              ))}
            </div>
          ) : null}
          {st.status ? (
            <p className={`stage-status stage-status--${st.status.tone}`} role="status">
              {st.status.text}
            </p>
          ) : null}
          {st.notes.length > 0 ? (
            <ul className="stage-notes">
              {st.notes.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          ) : null}
          <StageSources id={st.id} />
        </article>
      ))}
    </div>
  );
}

/** Published sources of a stage (Google Scholar and DOI/PubMed links) and what comes from the original model only. */
function StageSources({ id }: { id: StageId }) {
  const ex = STAGE_EXPLANATIONS[id];
  if (ex.refs.length === 0 && !ex.inherited) return null;
  return (
    <footer className="stage-sources" aria-label={L('Fontes', 'Sources')}>
      <span className="stage-label">{L('Fontes', 'Sources')}</span>
      {ex.refs.length > 0 ? (
        <ol className="stage-refs">
          {ex.refs.map(({ id: refId, supports }) => {
            const r = REFERENCES[refId];
            return (
              <li key={refId}>
                <span className="stage-ref-cite">
                  {r.authors} ({r.year}). {r.title}. <em>{r.venue}</em>.
                </span>{' '}
                <span className="muted">— {supports}.</span>{' '}
                <a href={scholarUrl(r)} target="_blank" rel="noreferrer">
                  Google Scholar
                </a>
                {' · '}
                <a href={sourceUrl(r)} target="_blank" rel="noreferrer">
                  {r.doi ? `doi:${r.doi}` : `PubMed ${r.pmid}`}
                </a>
              </li>
            );
          })}
        </ol>
      ) : null}
      {ex.inherited ? <p className="stage-inherited">{L('Do modelo original, sem fonte publicada:', 'From the original model, with no published source:')} {ex.inherited}</p> : null}
    </footer>
  );
}
