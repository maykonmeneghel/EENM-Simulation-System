import { useEffect, useMemo, useRef } from 'react';
import type { ModelSnapshot } from '../application/modelView';
import type { StageId } from '../domain/modelEquations';
import { buildStageContents } from './stageTex';
import { Tex } from './Tex';

export interface StageFocus {
  stage: StageId;
  /** Changes on every request so the same stage can be focused twice. */
  nonce: number;
}

const stageElementId = (id: StageId) => `stage-${id}`;

export function EquationsView({ snapshot, focus }: { snapshot: ModelSnapshot; focus: StageFocus | null }) {
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
          className="card stage"
          tabIndex={-1}
          aria-labelledby={`${stageElementId(st.id)}-title`}
          data-stage={st.id}
        >
          <header className="stage-header">
            <span className="stage-badge">{st.id}</span>
            <h3 id={`${stageElementId(st.id)}-title`}>{st.title}</h3>
            <code className="stage-source">{st.source}</code>
          </header>
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
        </article>
      ))}
    </div>
  );
}
