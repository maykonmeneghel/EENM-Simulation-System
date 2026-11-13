import { Fragment } from 'react';
import type { CSSProperties, KeyboardEvent, ReactNode } from 'react';
import type { ModelSnapshot } from '../application/modelView';
import { twitchCurve } from '../application/modelView';
import type { StageId } from '../domain/modelEquations';
import { MOTOR_UNIT_TYPES } from '../domain/simulation';
import { useSvgScale } from './useSvgScale';
import { COMPACT_QUERY, useMediaQuery } from './useMediaQuery';
import { txtNum } from './stageTex';
import { tr } from '../i18n/locale';

export interface DiagramViewProps {
  snapshot: ModelSnapshot;
  running: boolean;
  onSelectStage(stage: StageId): void;
}

const LINE_Y = 170;

/** Width of the vertical (phone) layout's viewBox: the widest stage (210) plus margins. */
export const VERTICAL_WIDTH = 260;
/** Room between two stages of the vertical layout, for the arrow that joins them. */
const VERTICAL_GAP = 34;

/**
 * One stage of the chain, drawn once in the desktop (horizontal) coordinates. `x/y/w/h` is the area it occupies
 * there: the horizontal layout draws it in place, the vertical one moves that area into a single column.
 */
interface Region {
  key: string;
  x: number;
  y: number;
  w: number;
  h: number;
  node: ReactNode;
}

/** Clickable block: opens the matching stage in "Equações". */
function Block({
  stage,
  label,
  onSelect,
  children,
}: {
  stage: StageId;
  label: string;
  onSelect(stage: StageId): void;
  children: ReactNode;
}) {
  const onKeyDown = (e: KeyboardEvent<SVGGElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect(stage);
    }
  };
  return (
    <g
      className="dg-block"
      role="button"
      tabIndex={0}
      aria-label={`${label} — ${tr({ 'pt-BR': 'ver equação', en: 'see equation' })} ${stage}`}
      onClick={() => onSelect(stage)}
      onKeyDown={onKeyDown}
      data-stage={stage}
    >
      <title>{`${label} (${tr({ 'pt-BR': 'etapa', en: 'stage' })} ${stage})`}</title>
      {children}
    </g>
  );
}

export function DiagramView({ snapshot: s, running, onSelectStage }: DiagramViewProps) {
  const lit = s.variant === 'LITERATURE';
  const skin = lit && s.stimulationSite !== 'MOTONEURON_POOL';
  const st = s.stimulus;
  // Phones and narrow windows (the drawer layout): the chain runs top → bottom instead of left → right.
  const vertical = useMediaQuery(COMPACT_QUERY);
  const [measureSvg, svgScale] = useSvgScale(1100);
  const [measureVertical, verticalScale] = useSvgScale(VERTICAL_WIDTH);

  // Pulse-train icon: 4 periods of 28 px, pulse width ∝ duty cycle (min 1.5 px to stay visible).
  const period = 28;
  const duty = Number.isFinite(st.dutyCyclePercent) ? Math.min(99, Math.max(0, st.dutyCyclePercent)) : 0;
  const pw = Math.max(1.5, (period * duty) / 100);
  const pulseBase = 118;
  const pulseTop = 82;
  let pulsePath = `M 30 ${pulseBase}`;
  for (let i = 0; i < 4; i++) {
    const x0 = 34 + i * period;
    pulsePath += ` H ${x0} V ${pulseTop} H ${x0 + pw} V ${pulseBase}`;
    if (st.waveform === 'BIPHASIC') pulsePath += ` V ${pulseBase + (pulseBase - pulseTop) / 3} H ${x0 + pw * 1.6} V ${pulseBase}`;
  }
  pulsePath += ' H 150';

  // Recruited axons (LITERATURE): shade round(fraction × 10) of 10 drawn axons.
  const axonCount = 10;
  const recruited = s.recruitment ? Math.round(s.recruitment.fraction * axonCount) : 0;

  const delays = s.conduction.delays.map((d) => d.ms);
  const delayText =
    delays.length === 2 && delays.every(Number.isFinite)
      ? `Δ ≈ ${txtNum(Math.min(...delays), 1)}–${txtNum(Math.max(...delays), 1)} ms`
      : 'Δ = —';

  const curve = twitchCurve(s.variant, 40, 5, s.calibrationTarget, s.muscle);
  const tw = { x: 790, y: 120, w: 110, h: 70 };
  const twitchPath = curve
    .map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${tw.x + (x / 5) * tw.w} ${tw.y + tw.h - y * tw.h}`)
    .join(' ');

  const counts = s.units.counts;
  const unitLabel = (t: (typeof MOTOR_UNIT_TYPES)[number]) =>
    counts ? `${t} · ${txtNum(counts[t], 0)}` : `${t} · auto`;

  const somaInjection = s.motoneuron.injectionSite === 'SOMA';
  const forceStage: StageId = lit ? '8b' : '8a';
  // The small chips (fatigue, EMG, rate saturation) get a taller transparent hit area on phones (≥ 44 px to tap).
  const chipHit = (x: number, w: number) =>
    vertical ? <rect x={x} y="205" width={w} height="48" className="dg-hit" /> : null;

  const regions: Region[] = [
    {
      key: 'stimulus',
      x: 0,
      y: 34,
      w: 178,
      h: 182,
      node: (
        <>
          {/* 1 stimulus */}
          <Block stage="1" label={tr({ 'pt-BR': 'Estímulo', en: 'Stimulus' })} onSelect={onSelectStage}>
            <rect x="14" y="60" width="150" height="150" rx="18" className="dg-box" />
            <text x="89" y="52" className="dg-title">{tr({ 'pt-BR': 'Eletrodo / estímulo', en: 'Electrode / stimulus' })}</text>
            <path d={pulsePath} className="dg-pulse-train" />
            <text x="89" y="148" className="dg-value">{`${txtNum(st.frequencyHz)} Hz`}</text>
            <text x="89" y="168" className="dg-value">{`PW ${txtNum(st.pwMs, 2)} ms`}</text>
            <text x="89" y="188" className="dg-value">{`A ${txtNum(st.amplitude)}`}</text>
            {st.train ? <text x="89" y="204" className="dg-small">{`trens ${txtNum(st.train.onMs)}/${txtNum(st.train.periodMs)} ms`}</text> : null}
          </Block>
        </>
      ),
    },
    {
      key: 'excitation',
      x: 186,
      y: 34,
      w: 210,
      h: 182,
      node: (
        <>
          {/* 2 excitation: the skin and axons (non-invasive) or the motoneurons (invasive, and the original model) */}
          {skin ? (
            <Block stage="2b" label={tr({ 'pt-BR': 'Pele e axônios motores', en: 'Skin and motor axons' })} onSelect={onSelectStage}>
              <rect x="196" y="60" width="190" height="150" rx="18" className="dg-box" />
              <text x="291" y="52" className="dg-title">{tr({ 'pt-BR': 'Pele + axônios motores', en: 'Skin + motor axons' })}</text>
              <rect x="206" y="72" width="170" height="14" rx="7" className="dg-skin" />
              <line x1="291" y1="62" x2="291" y2="72" className="dg-electrode" markerEnd="url(#dg-arrow)" />
              {Array.from({ length: axonCount }, (_, i) => (
                <line
                  key={i}
                  x1="212"
                  x2="372"
                  y1={96 + i * 8}
                  y2={96 + i * 8}
                  className={i < recruited ? 'dg-axon dg-axon--on' : 'dg-axon'}
                />
              ))}
              <text x="291" y="190" className="dg-value">
                {s.recruitment
                  ? `${txtNum(s.recruitment.fraction * 100, 0)} % ${tr({ 'pt-BR': 'recrutados', en: 'recruited' })}`
                  : tr({ 'pt-BR': 'recrutamento —', en: 'recruitment —' })}
              </text>
              <text x="291" y="205" className="dg-small">
                {s.recruitment
                  ? `${tr({ 'pt-BR': 'limiar', en: 'threshold' })} ${txtNum(s.recruitment.thresholdMin, 1)} … ${txtNum(s.recruitment.thresholdMax, 1)}`
                  : tr({ 'pt-BR': 'limiar —', en: 'threshold —' })}
              </text>
            </Block>
          ) : (
            <Block stage={s.drive ? '2c' : '2a'} label={tr({ 'pt-BR': 'Motoneurônio', en: 'Motoneuron' })} onSelect={onSelectStage}>
              <rect x="196" y="60" width="190" height="150" rx="18" className="dg-box" />
              <text x="291" y="52" className="dg-title">{tr({ 'pt-BR': 'Motoneurônio', en: 'Motoneuron' })}</text>
              {/* dendrite */}
              <path d="M 312 170 L 262 170 M 284 170 L 240 128 M 284 170 L 240 212 M 262 170 L 222 160" className="dg-dendrite" />
              <circle cx="330" cy="170" r="22" className="dg-soma" />
              <text x="330" y="174" className="dg-small dg-on-fill">soma</text>
              <text x="238" y="120" className="dg-small">{tr({ 'pt-BR': 'dendrito', en: 'dendrite' })}</text>
              {/* electrode */}
              {somaInjection ? (
                <line x1="330" y1="92" x2="330" y2="144" className="dg-electrode" markerEnd="url(#dg-arrow)" />
              ) : (
                <line x1="240" y1="80" x2="240" y2="122" className="dg-electrode" markerEnd="url(#dg-arrow)" />
              )}
              <text x="291" y="200" className="dg-value">{somaInjection ? tr({ 'pt-BR': 'injeção no soma', en: 'soma injection' }) : tr({ 'pt-BR': 'injeção no dendrito', en: 'dendrite injection' })}</text>
              <text x="291" y="84" className="dg-small">{`φ = ${txtNum(s.motoneuron.phi, 3)} (${txtNum(s.motoneuron.temperatureCelsius)} °C)`}</text>
            </Block>
          )}
        </>
      ),
    },
    {
      key: 'axon',
      x: 398,
      y: 114,
      w: 154,
      h: 134,
      node: (
        <>
          {/* 3 conduction */}
          <Block stage="3" label={tr({ 'pt-BR': 'Condução pelo axônio', en: 'Conduction along the axon' })} onSelect={onSelectStage}>
            <rect x="400" y="140" width="150" height="60" rx="14" className="dg-hit" />
            <line x1="404" y1={LINE_Y} x2="546" y2={LINE_Y} className="dg-axon-main" />
            <text x="475" y="132" className="dg-title">{tr({ 'pt-BR': 'Axônio', en: 'Axon' })}</text>
            <text x="475" y="222" className="dg-value">{delayText}</text>
            <text x="475" y="240" className="dg-small">{`v = 44–53 m/s · x = ${txtNum(s.conduction.x, 2)}`}</text>
          </Block>
        </>
      ),
    },
    {
      key: 'fibres',
      x: 556,
      y: 34,
      w: 204,
      h: 220,
      node: (
        <>
          {/* muscle fibres (force sum stage) */}
          <Block stage={forceStage} label={tr({ 'pt-BR': 'Fibras musculares S, FR e FF', en: 'Muscle fibers S, FR and FF' })} onSelect={onSelectStage}>
            <rect x="564" y="60" width="190" height="150" rx="18" className="dg-box" />
            <text x="659" y="52" className="dg-title">{tr({ 'pt-BR': 'Fibras musculares', en: 'Muscle fibers' })}</text>
            {MOTOR_UNIT_TYPES.map((t, i) => (
              <g key={t}>
                <rect x="578" y={86 + i * 40} width="162" height="28" rx="14" className={`dg-fibre dg-fibre--${t}`} />
                <text x="659" y={105 + i * 40} className="dg-value dg-on-fill">{unitLabel(t)}</text>
              </g>
            ))}
            <text x="659" y="204" className="dg-small">{s.muscleLabel}</text>
          </Block>
          <Block stage="4" label={tr({ 'pt-BR': 'MUAP e EMG', en: 'MUAP and EMG' })} onSelect={onSelectStage}>
            {chipHit(700, 54)}
            <rect x="700" y="214" width="54" height="22" rx="11" className="dg-chip" />
            <text x="727" y="229" className="dg-small">EMG</text>
          </Block>
          {lit ? (
            <Block stage="7" label={tr({ 'pt-BR': 'Fadiga periférica', en: 'Peripheral fatigue' })} onSelect={onSelectStage}>
              {chipHit(564, 130)}
              <rect x="564" y="214" width="130" height="22" rx="11" className="dg-chip dg-chip--warn" />
              <text x="629" y="229" className="dg-small">{tr({ 'pt-BR': 'fadiga periférica', en: 'peripheral fatigue' })}</text>
            </Block>
          ) : null}
        </>
      ),
    },
    {
      key: 'twitch',
      x: 766,
      y: 34,
      w: 158,
      h: 220,
      node: (
        <>
          {/* 5 twitch */}
          <Block stage={lit ? '5b' : '5a'} label="Twitch" onSelect={onSelectStage}>
            <rect x="772" y="60" width="146" height="150" rx="18" className="dg-box" />
            <text x="845" y="52" className="dg-title">Twitch</text>
            <line x1={tw.x} y1={tw.y + tw.h} x2={tw.x + tw.w} y2={tw.y + tw.h} className="dg-axis" />
            <line x1={tw.x} y1={tw.y - 6} x2={tw.x} y2={tw.y + tw.h} className="dg-axis" />
            <path d={twitchPath} className="dg-twitch" />
            <text x="845" y="108" className="dg-small">
              {lit ? `m = ${txtNum(s.twitchShape.m, 2)}, T × ${txtNum(s.twitchShape.timeScale, 4)}` : 'm = 1 (Fuglevand)'}
            </text>
          </Block>
          {lit ? (
            <Block stage="6" label={tr({ 'pt-BR': 'Saturação por frequência', en: 'Rate saturation' })} onSelect={onSelectStage}>
              {chipHit(790, 110)}
              <rect x="790" y="214" width="110" height="22" rx="11" className="dg-chip" />
              <text x="845" y="229" className="dg-small">{`g(NR) · ISI ${txtNum(s.rate.isiMs, 1)} ms`}</text>
            </Block>
          ) : null}
        </>
      ),
    },
    {
      key: 'force',
      x: 928,
      y: 114,
      w: 166,
      h: 110,
      node: (
        <>
          {/* 8 force */}
          <Block stage={forceStage} label={tr({ 'pt-BR': 'Força muscular', en: 'Muscle force' })} onSelect={onSelectStage}>
            <rect x="930" y="120" width="160" height="100" rx="18" className="dg-hit" />
            <line x1="940" y1={LINE_Y} x2="1060" y2={LINE_Y} className="dg-force" markerEnd="url(#dg-arrow-big)" />
            <text x="1005" y="140" className="dg-title">F(t)</text>
            <text x="1005" y="206" className="dg-small">{lit ? tr({ 'pt-BR': 'Σ ponderada pelo pool', en: 'Σ weighted by the pool' }) : tr({ 'pt-BR': 'Σ das médias por tipo', en: 'Σ of the means per type' })}</text>
          </Block>
        </>
      ),
    },
  ];

  const defs = (
    <defs>
      <marker id="dg-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
        <path d="M 0 0 L 10 5 L 0 10 z" className="dg-arrowhead" />
      </marker>
      <marker id="dg-arrow-big" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="4" markerHeight="4" orient="auto">
        <path d="M 0 0 L 10 5 L 0 10 z" className="dg-force-head" />
      </marker>
    </defs>
  );
  const svgClass = `diagram-svg${running ? ' diagram-svg--running' : ''}`;
  const svgLabel = tr({ 'pt-BR': 'Diagrama do modelo', en: 'Model diagram' });

  return (
    <figure className={`card diagram${vertical ? ' diagram--vertical' : ''}`}>
      <figcaption className="diagram-caption">
        {tr({ 'pt-BR': 'Cadeia neuromusculoesquelética', en: 'Neuromusculoskeletal chain' })} —{' '}
        {lit
          ? tr({ 'pt-BR': 'modelo corrigido pela literatura', en: 'model corrected by the literature' })
          : tr({ 'pt-BR': 'modelo original', en: 'original model' })}
        .{' '}
        <span className="muted">
          {vertical
            ? tr({ 'pt-BR': 'Toque num bloco para ver a explicação e as referências.', en: 'Tap a block to see its explanation and references.' })
            : tr({ 'pt-BR': 'Clique num bloco para ver a explicação e as referências.', en: 'Click a block to see its explanation and references.' })}
        </span>
      </figcaption>
      {vertical ? (
        <VerticalChain regions={regions} running={running} measure={measureVertical} scale={verticalScale} className={svgClass} label={svgLabel}>
          {defs}
        </VerticalChain>
      ) : (
        <svg ref={measureSvg} style={svgScale} viewBox="0 28 1100 222" className={svgClass} role="group" aria-label={svgLabel}>
          {defs}

          {/* main signal path */}
          <line x1="150" y1={LINE_Y} x2="930" y2={LINE_Y} className="dg-path" />
          {running ? <circle cx="150" cy={LINE_Y} r="6" className="dg-pulse" /> : null}

          {regions.map((r) => (
            <Fragment key={r.key}>{r.node}</Fragment>
          ))}
        </svg>
      )}
    </figure>
  );
}

/**
 * The same stages in one column, top → bottom: each stage's area is moved (not redrawn) into the column, centred,
 * with an arrow from one stage to the next. Text keeps the app's type scale through `--svg-k`.
 */
function VerticalChain({
  regions,
  running,
  measure,
  scale,
  className,
  label,
  children,
}: {
  regions: readonly Region[];
  running: boolean;
  measure(el: SVGSVGElement | null): void;
  scale: CSSProperties;
  className: string;
  label: string;
  children: ReactNode;
}) {
  const cx = VERTICAL_WIDTH / 2;
  let cursor = 4;
  const placed = regions.map((r) => {
    const p = { r, dx: cx - (r.x + r.w / 2), dy: cursor - r.y, top: cursor, bottom: cursor + r.h };
    cursor += r.h + VERTICAL_GAP;
    return p;
  });
  const height = cursor - VERTICAL_GAP + 4;
  const first = placed[0];
  const last = placed[placed.length - 1];
  const travel = first && last ? last.top - first.bottom : 0;
  return (
    <svg
      ref={measure}
      style={scale}
      viewBox={`0 0 ${VERTICAL_WIDTH} ${height}`}
      className={`${className} diagram-svg--vertical`}
      role="group"
      aria-label={label}
      data-layout="vertical"
    >
      {children}
      <defs>
        <marker id="dg-arrow-link" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="4.5" markerHeight="4.5" orient="auto">
          <path d="M 0 0 L 10 5 L 0 10 z" className="dg-link-head" />
        </marker>
      </defs>
      {/* the signal path: one arrow between consecutive stages */}
      {placed.slice(1).map((p, i) => (
        <line key={p.r.key} x1={cx} y1={placed[i]!.bottom + 2} x2={cx} y2={p.top + 4} className="dg-link" markerEnd="url(#dg-arrow-link)" />
      ))}
      {running && first ? (
        <circle cx={cx} cy={first.bottom} r="6" className="dg-pulse dg-pulse--down" style={{ ['--travel' as string]: `${travel}px` }} />
      ) : null}
      {placed.map((p) => (
        <g key={p.r.key} transform={`translate(${p.dx} ${p.dy})`} data-region={p.r.key}>
          {p.r.node}
        </g>
      ))}
    </svg>
  );
}
