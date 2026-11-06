import { useEffect, useMemo, useRef } from 'react';
import type { InspectorTopic } from '../application/inspectorTopics';
import { InfoIcon } from './InfoIcon';
import type { ModelSnapshot } from '../application/modelView';
import type { StageId } from '../domain/modelEquations';
import { REFERENCES, scholarUrl, sourceUrl } from '../domain/references';
import { STAGE_EXPLANATIONS } from './stageExplanations';
import { buildStageContents } from './stageTex';
import { Tex } from './Tex';

export interface StageFocus {
  stage: StageId;
  /** Changes on every request so the same stage can be focused twice. */
  nonce: number;
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
  const stages = useMemo(() => buildStageContents(snapshot), [snapshot]);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!focus) return;
    const el = rootRef.current?.querySelector<HTMLElement>(`#${stageElementId(focus.stage)}`);
    if (!el) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView?.({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    el.focus({ preventScroll: true });
    el.classList.remove('stage--flash');
    void el.offsetWidth; // restart the highlight animation
    el.classList.add('stage--flash');
  }, [focus]);

  return (
    <div className="equations" ref={rootRef}>
      <p className="muted equations-intro">
        Modelo {snapshot.variant === 'ORIGINAL' ? 'original (MATLAB fiel)' : 'corrigido pela literatura'} — etapas{' '}
        {snapshot.stages.join(', ')} de <code>docs/model-equations.md</code>. Os valores abaixo acompanham o formulário.
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
            {onInspect ? (
              <button
                type="button"
                className="icon-button"
                aria-label={`Etapa ${st.id} — ver explicação`}
                onClick={() => onInspect({ kind: 'stage', stage: st.id })}
              >
                <InfoIcon />
              </button>
            ) : null}
          </header>
          <p className="stage-plain">
            <span className="stage-label">Em palavras</span>
            {STAGE_EXPLANATIONS[st.id].plain}
          </p>
          <div className="stage-math stage-math--symbolic">
            {st.symbolic.map((t, i) => (
              <Tex key={i} tex={t} display />
            ))}
          </div>
          <div className="stage-math stage-math--values" aria-label="Com os valores atuais">
            <span className="stage-label">Com os valores atuais</span>
            {st.substituted.map((t, i) => (
              <Tex key={i} tex={t} display />
            ))}
          </div>
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
    <footer className="stage-sources" aria-label="Fontes">
      <span className="stage-label">Fontes</span>
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
      {ex.inherited ? <p className="stage-inherited">Do modelo original, sem fonte publicada: {ex.inherited}</p> : null}
    </footer>
  );
}
