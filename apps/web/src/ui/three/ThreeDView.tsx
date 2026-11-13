/**
 * The 3D step (docs/design/3d-view.md): the forearm at human scale with the run's units, and a replay of the run's
 * per-unit events on them. Loaded lazily, so the other steps do not download three.js.
 */
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { Canvas } from '@react-three/fiber';
import type { Layout, LevelId, MotorPointSource, RegionId } from '../../application/anatomy3d';
import { LEG, LEVELS, buildLayout, has3d } from '../../application/anatomy3d';
import { buildReplay } from '../../application/replay';
import type { SeriesBuffer } from '../../application/seriesBuffer';
import type { JointBuffer } from '../../application/jointBuffer';
import type { UnitEventLog } from '../../application/unitEventLog';
import type { MuscleId, StartedEvent } from '../../domain/simulation';
import { MAX_UNIT_EVENTS_DURATION_MS } from '../../domain/simulation';
import { fmtNumber, tr } from '../../i18n/locale';
import { CHART_THEMES, useColorScheme } from '../theme';
import type { LabelId, LabelPositions, ReplayClock, SceneCommands, ViewReadout } from './ForearmScene';
import { ForearmScene } from './ForearmScene';
import { FOV_DEG, REGION_UP } from './camera';
import { LEVEL_SPEED, SPEEDS, SPIKE_COLORS } from './replayStyle';
import { scaleBar } from './scaleBar';
import { TAG_LABEL } from './tags';

export interface ThreeDViewProps {
  run: StartedEvent | null;
  /** The run is still streaming: the replay is built once it ends. */
  running?: boolean;
  axonLengthPercent: number;
  muscleLabel: (id: MuscleId) => string;
  onUseMuscle: (id: MuscleId) => void;
  series?: SeriesBuffer;
  unitEvents?: UnitEventLog;
  joint?: JointBuffer;
}

const LEVEL_LABEL: Record<LevelId, (region: RegionId) => string> = {
  L0: (region) => (region === 'leg' ? tr({ 'pt-BR': 'Perna', en: 'Leg' }) : tr({ 'pt-BR': 'Antebraço', en: 'Forearm' })),
  L1: () => tr({ 'pt-BR': 'Músculo', en: 'Muscle' }),
  L2: () => tr({ 'pt-BR': 'Axônios', en: 'Axons' }),
  L3: () => tr({ 'pt-BR': 'Motoneurônio', en: 'Motoneuron' }),
};

const SOURCE_LABEL: Record<NonNullable<MotorPointSource>, string> = {
  HOSAPATNA_2020: 'Hosapatna 2020',
  YI_2017: 'Yi 2017',
  YI_2023: 'Yi 2023',
  YI_2025: 'Yi 2025',
};

/** Motor point readout: distance below the elbow / knee, its tag and its source. */
/** The pad as drawn: the run's electrode (model) with its factor G, or the fallback (illustrative). */
function padText(layout: Layout): string {
  const p = layout.pad;
  if (!p.fromRun) {
    return tr({
      'pt-BR': 'Eletrodo: disco de 25 mm (Baier 2024), ilustrativo (simulação sem eletrodo registrado).',
      en: 'Electrode: 25 mm disk (Baier 2024), illustrative (run with no recorded electrode).',
    });
  }
  const size = p.shape === 'ROUND' ? `Ø ${fmt(p.radiusM * 200, 1)} cm` : `${fmt(p.widthM * 100, 1)} × ${fmt(p.lengthM * 100, 1)} cm`;
  return tr({
    'pt-BR': `Eletrodo: ${size} (${fmt(p.areaCm2, 1)} cm²), o da simulação (modelo), G = ${fmt(p.thresholdFactor ?? 1, 2)}; desenhado sobre o ponto motor.`,
    en: `Electrode: ${size} (${fmt(p.areaCm2, 1)} cm²), the run's (model), G = ${fmt(p.thresholdFactor ?? 1, 2)}; drawn over the motor point.`,
  });
}

function motorPointText(layout: Layout): string {
  const cm = fmt(layout.motorPoint.x * 100, 1);
  const tag = TAG_LABEL[layout.motorPoint.tag]();
  const source = layout.motorPoint.source ? `${SOURCE_LABEL[layout.motorPoint.source]}; ` : '';
  return layout.region.id === 'leg'
    ? tr({ 'pt-BR': `ponto motor ${cm} cm abaixo do platô tibial (${source}${tag})`, en: `motor point ${cm} cm below the tibial plateau (${source}${tag})` })
    : tr({ 'pt-BR': `ponto motor ${cm} cm abaixo do cotovelo (${tag})`, en: `motor point ${cm} cm below the elbow (${tag})` });
}

/** The leg's nerve, and the literature point on its drawn path. */
function legNerveText(layout: Layout): string {
  const n = layout.nerve;
  if (!n) return '';
  if (n.nerve === 'tibial') {
    const mm = fmt((LEG.landmarks.fibularHead - n.x) * 1000, 0);
    return tr({
      'pt-BR': `Nervo tibial: o ramo deixa o tronco atrás do joelho ${mm} mm acima da cabeça da fíbula (Le Roux 2026); o resto do trajeto é ilustrativo.`,
      en: `Tibial nerve: the branch leaves the trunk behind the knee ${mm} mm above the fibular head (Le Roux 2026); the rest of the path is illustrative.`,
    });
  }
  return tr({
    'pt-BR': `Nervo fibular profundo: contorna o colo da fíbula e entra no músculo ${fmt(n.x * 100, 1)} cm abaixo do platô tibial (86,5–90,6 % do maléolo lateral à cabeça da fíbula, Yi 2017); o resto do trajeto é ilustrativo.`,
    en: `Deep fibular nerve: it winds round the fibular neck and enters the muscle ${fmt(n.x * 100, 1)} cm below the tibial plateau (86.5–90.6 % from the lateral malleolus to the fibular head, Yi 2017); the rest of the path is illustrative.`,
  });
}

const OFF = { x: 0, y: 0, on: false };
const LABEL_IDS: readonly LabelId[] = ['electrode', 'gap', 'spinal'];

const CREDIT = 'BodyParts3D, © The Database Center for Life Science licensed under CC Attribution 4.0 International';

const fmt = (v: number, digits = 1) => fmtNumber(v, { maximumFractionDigits: digits, minimumFractionDigits: digits });

export default function ThreeDView({ run, running = false, axonLengthPercent, muscleLabel, onUseMuscle, series, unitEvents, joint }: ThreeDViewProps) {
  const scheme = useColorScheme();
  const palette = CHART_THEMES[scheme].series;
  const colors = useMemo(() => ({ S: palette.orange, FR: palette.aqua, FF: palette.yellow }), [palette]);
  const layout = useMemo(() => (run ? buildLayout(run, axonLengthPercent) : null), [run, axonLengthPercent]);
  const [fly, setFly] = useState<{ level: LevelId; n: number }>({ level: 'L0', n: 0 });
  const [readout, setReadout] = useState<ViewReadout>({ level: 'L0', metresPerPixel: 0 });
  const [selected, setSelected] = useState<number | null>(null);
  const [help, setHelp] = useState(false);
  const commands = useRef<SceneCommands | null>(null);
  // labels: the scene projects their anchors every frame; plain DOM draws them over the canvas
  const labels = useRef<LabelPositions>({ electrode: OFF, gap: OFF, spinal: OFF });
  const labelNodes = useRef<Partial<Record<LabelId, HTMLDivElement | null>>>({});
  useEffect(() => {
    let frame = 0;
    const move = () => {
      for (const id of LABEL_IDS) {
        const node = labelNodes.current[id];
        const p = labels.current[id];
        if (!node) continue;
        node.style.visibility = p.on ? 'visible' : 'hidden';
        node.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -50%)`;
      }
      frame = requestAnimationFrame(move);
    };
    frame = requestAnimationFrame(move);
    return () => cancelAnimationFrame(frame);
  }, []);

  const eventCount = unitEvents?.length ?? 0;
  const replay = useMemo(() => {
    if (running || !run?.units || !run.stepMs || !unitEvents || eventCount === 0) return null;
    return buildReplay(unitEvents.columns(), run.units, run.stepMs, run.electrodeFraction ?? null, run.durationMs);
    // eventCount stands for the log's content: the log only grows during a run and is reset by the next one
  }, [running, run, unitEvents, eventCount]);

  const clock = useRef<ReplayClock>({ t: 0, playing: true, speed: LEVEL_SPEED.L0, durationMs: 1 });
  const [shown, setShown] = useState({ t: 0, playing: true, speed: LEVEL_SPEED.L0 });
  useEffect(() => {
    clock.current.durationMs = run?.durationMs ?? 1;
    clock.current.t = 0;
  }, [run]);
  useEffect(() => {
    // the slider and the time label follow the clock the scene advances (10 updates per second)
    const id = window.setInterval(() => {
      const c = clock.current;
      setShown((s) => (s.t === c.t && s.playing === c.playing && s.speed === c.speed ? s : { t: c.t, playing: c.playing, speed: c.speed }));
    }, 100);
    return () => window.clearInterval(id);
  }, []);

  const forceAt = useCallback(
    (t: number): number | null => {
      if (!series || !run?.maxForce) return null;
      const v = series.view();
      const n = v.timeMs.length;
      if (n === 0) return null;
      const i = Math.min(n - 1, Math.max(0, Math.round(t / run.outputStepMs)));
      return v.total[i]! / run.maxForce;
    },
    [series, run],
  );

  const angleAt = useCallback(
    (t: number): number | null => (run?.joint && joint ? joint.at(t / run.outputStepMs) : null),
    [joint, run],
  );

  const setPlaying = (playing: boolean) => {
    clock.current.playing = playing;
    setShown((s) => ({ ...s, playing }));
  };
  const setSpeed = (speed: number) => {
    clock.current.speed = speed;
    setShown((s) => ({ ...s, speed }));
  };
  const seek = (t: number) => {
    clock.current.t = Math.min(Math.max(0, t), clock.current.durationMs);
    setShown((s) => ({ ...s, t: clock.current.t }));
  };
  /** Jumps to just before the previous / next FES pulse, paused, to watch it leave the electrode. */
  const stepPulse = (direction: 1 | -1) => {
    const pulses = replay?.pulses ?? [];
    const now = clock.current.t;
    const lead = 0.2; // ms before the pulse
    const next = direction > 0 ? pulses.find((p) => p - lead > now + 1e-6) : [...pulses].reverse().find((p) => p - lead < now - 1e-6);
    if (next === undefined) return;
    setPlaying(false);
    seek(next - lead);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const key = e.key.toLowerCase();
    if (key === ' ') setPlaying(!clock.current.playing);
    else if (key === 'arrowright') stepPulse(1);
    else if (key === 'arrowleft') stepPulse(-1);
    else if (key === 'r') commands.current?.restore();
    else if (key === 'f' && selected !== null) commands.current?.focusUnit(selected);
    else if (key === '?') setHelp((h) => !h);
    else return;
    e.preventDefault();
  };

  if (!run) {
    return (
      <div className="card three-empty">
        <p>{tr({ 'pt-BR': 'Rode uma simulação para ver a anatomia dela em 3D.', en: 'Run a simulation to see its anatomy in 3D.' })}</p>
      </div>
    );
  }
  if (!has3d(run.muscle)) {
    return (
      <div className="card three-empty">
        <p>
          {tr({
            'pt-BR': `A vista 3D ainda não tem a anatomia de ${muscleLabel(run.muscle)}.`,
            en: `The 3D view has no anatomy for ${muscleLabel(run.muscle)} yet.`,
          })}
        </p>
        <button type="button" className="btn" onClick={() => onUseMuscle('FLEXOR_CARPI_RADIALIS')}>
          {tr({ 'pt-BR': 'Usar o FCR', en: 'Use the FCR' })}
        </button>
      </div>
    );
  }
  if (!layout) {
    return (
      <div className="card three-empty">
        <p>{tr({ 'pt-BR': 'O servidor não enviou a tabela das unidades. Atualize o motor e rode de novo.', en: 'The server did not send the unit table. Update the engine and run again.' })}</p>
      </div>
    );
  }
  const bar = readout.metresPerPixel > 0 ? scaleBar(readout.metresPerPixel) : null;
  const unit = selected !== null ? layout.units[selected] : undefined;
  const replayNote = running
    ? tr({ 'pt-BR': 'O replay fica pronto quando a simulação terminar.', en: 'The replay is ready when the run ends.' })
    : run.durationMs > MAX_UNIT_EVENTS_DURATION_MS
      ? tr({ 'pt-BR': 'Sem replay: os disparos por unidade só são enviados em simulações de até 30 s.', en: 'No replay: per-unit spikes are only sent for runs up to 30 s.' })
      : tr({ 'pt-BR': 'Sem replay nesta simulação: rode de novo para receber os disparos por unidade.', en: 'No replay for this run: run it again to receive the per-unit spikes.' });

  return (
    <div className="three-view">
      <div className="three-toolbar" role="toolbar" aria-label={tr({ 'pt-BR': 'Nível de zoom', en: 'Zoom level' })}>
        {LEVELS.map((l) => (
          <button
            key={l.id}
            type="button"
            className={`btn${readout.level === l.id ? ' btn--selected' : ''}`}
            aria-pressed={readout.level === l.id}
            onClick={() => {
              setFly((f) => ({ level: l.id, n: f.n + 1 }));
              setSpeed(LEVEL_SPEED[l.id]);
            }}
          >
            {LEVEL_LABEL[l.id](layout.region.id)}
          </button>
        ))}
        <button type="button" className="btn" onClick={() => commands.current?.restore()} title={tr({ 'pt-BR': 'Restaurar a vista do nível (R)', en: 'Restore the level’s view (R)' })}>
          {tr({ 'pt-BR': 'Restaurar vista', en: 'Restore view' })}
        </button>
        <button type="button" className="btn" aria-pressed={help} onClick={() => setHelp((h) => !h)} title={tr({ 'pt-BR': 'Controles (?)', en: 'Controls (?)' })}>
          ?
        </button>
        <span className="three-legend" aria-label={tr({ 'pt-BR': 'Legenda', en: 'Legend' })}>
          {(['S', 'FR', 'FF'] as const).map((t) => (
            <span key={t}><i style={{ background: colors[t] }} aria-hidden="true" /> {t}</span>
          ))}
          <span><i style={{ background: SPIKE_COLORS.central }} aria-hidden="true" /> {tr({ 'pt-BR': 'central', en: 'central' })}</span>
          <span><i style={{ background: SPIKE_COLORS.fes }} aria-hidden="true" /> FES</span>
          <span><i style={{ background: SPIKE_COLORS.antidromic }} aria-hidden="true" /> {tr({ 'pt-BR': 'antidrômico', en: 'antidromic' })}</span>
        </span>
      </div>
      <div className="three-canvas" tabIndex={0} onKeyDown={onKeyDown} aria-label={tr({ 'pt-BR': 'Vista 3D', en: '3D view' })}>
        <Canvas
          // a new canvas per region: the camera's up direction (and its controls' orbit axis) is set when it is made
          key={layout.region.id}
          camera={{ fov: FOV_DEG, near: 0.001, far: 10, position: [0.3, 0.5, 0.4], up: REGION_UP[layout.region.id] }}
          onCreated={({ gl }) => { gl.localClippingEnabled = true; }}
          dpr={[1, 2]}
        >
          <Suspense fallback={null}>
            <ForearmScene
              layout={layout}
              level={readout.level}
              fly={fly}
              colors={colors}
              selected={selected}
              onSelect={setSelected}
              onReadout={setReadout}
              replay={replay}
              clock={clock}
              forceAt={forceAt}
              angleAt={angleAt}
              commands={commands}
              labels={labels}
            />
          </Suspense>
        </Canvas>
        <div className="three-label" ref={(n) => { labelNodes.current.electrode = n; }} aria-hidden="true">
          {tr({ 'pt-BR': 'Eletrodo', en: 'Electrode' })}
        </div>
        <div className="three-label three-label--gap" ref={(n) => { labelNodes.current.gap = n; }} aria-hidden="true">
          {tr({ 'pt-BR': `≈ ${fmt(layout.omittedLength, 2)} m de axônio omitidos`, en: `≈ ${fmt(layout.omittedLength, 2)} m of axon left out` })}
        </div>
        <div className="three-label" ref={(n) => { labelNodes.current.spinal = n; }} aria-hidden="true">
          {tr({ 'pt-BR': 'Motoneurônios (medula)', en: 'Motoneurons (spinal cord)' })}
        </div>
        {run.joint ? <WristReadout angle={angleAt(shown.t)} model={run.joint} /> : null}
        {bar ? (
          <div className="three-scale" aria-label={tr({ 'pt-BR': 'Escala', en: 'Scale' })}>
            <span style={{ width: `${bar.pixels}px` }} />
            {bar.label}
          </div>
        ) : null}
        {help ? (
          <div className="three-help card" role="note">
            <h4>{tr({ 'pt-BR': 'Controles', en: 'Controls' })}</h4>
            <dl>
              <dt>{tr({ 'pt-BR': 'Arrastar', en: 'Drag' })}</dt>
              <dd>{tr({ 'pt-BR': 'girar', en: 'rotate' })}</dd>
              <dt>{tr({ 'pt-BR': 'Shift + arrastar ou botão direito', en: 'Shift + drag or right button' })}</dt>
              <dd>{tr({ 'pt-BR': 'mover', en: 'pan' })}</dd>
              <dt>{tr({ 'pt-BR': 'Rolar / pinça', en: 'Scroll / pinch' })}</dt>
              <dd>{tr({ 'pt-BR': 'zoom na direção do cursor', en: 'zoom toward the cursor' })}</dd>
              <dt>{tr({ 'pt-BR': 'Duplo clique', en: 'Double-click' })}</dt>
              <dd>{tr({ 'pt-BR': 'girar em torno do ponto e aproximar', en: 'orbit around the point and move closer' })}</dd>
              <dt>{tr({ 'pt-BR': 'Clique numa unidade', en: 'Click a unit' })}</dt>
              <dd>{tr({ 'pt-BR': 'valores dela; F foca', en: 'its values; F focuses it' })}</dd>
              <dt>R</dt>
              <dd>{tr({ 'pt-BR': 'restaurar a vista do nível', en: 'restore the level’s view' })}</dd>
              <dt>{tr({ 'pt-BR': 'Espaço', en: 'Space' })}</dt>
              <dd>{tr({ 'pt-BR': 'tocar / pausar o replay', en: 'play / pause the replay' })}</dd>
              <dt>← →</dt>
              <dd>{tr({ 'pt-BR': 'pulso FES anterior / seguinte', en: 'previous / next FES pulse' })}</dd>
            </dl>
          </div>
        ) : null}
        {unit ? (
          <div className="three-info card" role="status">
            <h4>
              {tr({ 'pt-BR': 'Unidade', en: 'Unit' })} {unit.type} #{unit.poolIndex + 1}
            </h4>
            <dl>
              <dt>{tr({ 'pt-BR': 'Soma (diâmetro = comprimento)', en: 'Soma (diameter = length)' })}</dt>
              <dd>{fmt(unit.soma.diameter * 1e6)} µm <em>{TAG_LABEL.model()}</em></dd>
              <dt>{tr({ 'pt-BR': 'Dendrito (cilindro equivalente)', en: 'Dendrite (equivalent cylinder)' })}</dt>
              <dd>{fmt(unit.dendrite.diameter * 1e6)} µm × {fmt(unit.dendrite.length * 1e3, 2)} mm <em>{TAG_LABEL.model()}</em></dd>
              <dt>{tr({ 'pt-BR': 'Condução soma → músculo', en: 'Conduction soma → muscle' })}</dt>
              <dd>{fmt(unit.conductionMs, 2)} ms <em>{TAG_LABEL.model()}</em></dd>
              {unit.toElectrodeMs !== null && unit.toMuscleMs !== null ? (
                <>
                  <dt>{tr({ 'pt-BR': 'Soma → eletrodo · eletrodo → músculo', en: 'Soma → electrode · electrode → muscle' })}</dt>
                  <dd>{fmt(unit.toElectrodeMs, 2)} · {fmt(unit.toMuscleMs, 2)} ms <em>{TAG_LABEL.model()}</em></dd>
                </>
              ) : null}
              <dt>{tr({ 'pt-BR': 'Unidades do pool que representa', en: 'Pool units it stands for' })}</dt>
              <dd>{fmt(unit.weight, 1)} <em>{TAG_LABEL.model()}</em></dd>
              <dt>{tr({ 'pt-BR': 'Reobase do axônio', en: 'Axon rheobase' })}</dt>
              <dd>{fmt(unit.axonRheobase, 1)} <em>{TAG_LABEL.model()}</em></dd>
              {layout.nerve ? (
                <>
                  <dt>{tr({ 'pt-BR': 'Nervo', en: 'Nerve' })}</dt>
                  <dd>
                    {layout.nerve.nerve === 'tibial' ? tr({ 'pt-BR': 'tibial', en: 'tibial' }) : tr({ 'pt-BR': 'fibular profundo', en: 'deep fibular' })}{' '}
                    <em>{layout.nerve.nerve === 'tibial' ? 'Le Roux 2026' : 'Yi 2017'}</em>
                  </dd>
                </>
              ) : null}
              <dt>{tr({ 'pt-BR': 'Posição, território, trajeto', en: 'Position, territory, path' })}</dt>
              <dd><em>{TAG_LABEL.illustrative()}</em></dd>
            </dl>
            <button type="button" className="btn" onClick={() => commands.current?.focusUnit(unit.index)}>
              {tr({ 'pt-BR': 'Focar (F)', en: 'Focus (F)' })}
            </button>
          </div>
        ) : null}
      </div>
      {replay ? (
        <div className="three-replay" role="group" aria-label={tr({ 'pt-BR': 'Replay', en: 'Replay' })}>
          <button type="button" className="btn" onClick={() => stepPulse(-1)} title={tr({ 'pt-BR': 'Pulso anterior (←)', en: 'Previous pulse (←)' })} aria-label={tr({ 'pt-BR': 'Pulso anterior', en: 'Previous pulse' })}>
            ⏮
          </button>
          <button type="button" className="btn btn--primary" onClick={() => setPlaying(!shown.playing)} aria-label={shown.playing ? tr({ 'pt-BR': 'Pausar', en: 'Pause' }) : tr({ 'pt-BR': 'Tocar', en: 'Play' })}>
            {shown.playing ? '⏸' : '▶'}
          </button>
          <button type="button" className="btn" onClick={() => stepPulse(1)} title={tr({ 'pt-BR': 'Próximo pulso (→)', en: 'Next pulse (→)' })} aria-label={tr({ 'pt-BR': 'Próximo pulso', en: 'Next pulse' })}>
            ⏭
          </button>
          <input
            type="range"
            min={0}
            max={run.durationMs}
            step={run.stepMs ?? 0.01}
            value={shown.t}
            onChange={(e) => seek(Number(e.target.value))}
            aria-label={tr({ 'pt-BR': 'Tempo do replay', en: 'Replay time' })}
          />
          <span className="three-time">{fmt(shown.t, 2)} ms</span>
          <span className="three-speeds" role="radiogroup" aria-label={tr({ 'pt-BR': 'Velocidade', en: 'Speed' })}>
            {SPEEDS.map((s) => (
              <button
                key={s.value}
                type="button"
                role="radio"
                aria-checked={shown.speed === s.value}
                className={`btn${shown.speed === s.value ? ' btn--selected' : ''}`}
                onClick={() => setSpeed(s.value)}
              >
                {s.label}
              </button>
            ))}
          </span>
        </div>
      ) : (
        <p className="three-notes muted">{replayNote}</p>
      )}
      <p className="three-notes muted">
        {layout.region.id === 'leg' ? legNotes(layout) : tr({
          'pt-BR': `Pele, ossos e músculos: atlas (malhas em escala real). Unidades, tamanhos do soma e do dendrito, tempos de condução e disparos: modelo (${layout.motoneuron === 'CISI_KOHN_2008' ? 'Cisi & Kohn 2008' : 'Booth 1997'}). Posição das unidades, territórios e trajeto do nervo: ilustrativos. ${padText(layout)} Axônio de ${fmt(layout.axonLength, 2)} m; ${motorPointText(layout)}. Um disparo some no trecho omitido e reaparece do outro lado no tempo real de condução. O músculo brilha com a força (% da máxima). A mão gira no punho com o torque dele (1 grau de liberdade: inércia e amortecimento de Davidson & Charles 2017, braço de momento de Corie & Charles 2019, força máxima e resistência passiva escolhidas na Fisiologia); o músculo perde força ao encurtar rápido (força–velocidade de Thelen 2003, sem força–comprimento), só o músculo estimulado age, e o ângulo para em 90° de flexão e de extensão (onde Delp 1996 mediu; o máximo anatômico não foi verificado). Cada simulação começa com o punho em repouso.`,
          en: `Skin, bones and muscles: atlas (meshes at real scale). Units, soma and dendrite sizes, conduction times and spikes: model (${layout.motoneuron === 'CISI_KOHN_2008' ? 'Cisi & Kohn 2008' : 'Booth 1997'}). Unit positions, territories and nerve path: illustrative. ${padText(layout)} Axon ${fmt(layout.axonLength, 2)} m; ${motorPointText(layout)}. A spike disappears into the omitted stretch and comes back on the other side at its real conduction time. The muscle glows with the force (% of maximum). The hand turns at the wrist with its torque (1 degree of freedom: inertia and damping from Davidson & Charles 2017, moment arm from Corie & Charles 2019, peak force and passive resistance chosen in Physiology); the muscle loses force when it shortens fast (Thelen 2003 force–velocity, no force–length), only the stimulated muscle acts, and the angle stops at 90° flexion and extension (where Delp 1996 measured; the anatomical maximum was not verified). Every run starts with the wrist at rest.`,
        })}
      </p>
      <p className="three-credit muted">{CREDIT}</p>
    </div>
  );
}

/** Sources of the leg view (docs/design/3d-view.md §10): what is atlas, model, literature and illustrative. */
function legNotes(layout: Layout): string {
  const model = layout.motoneuron === 'CISI_KOHN_2008' ? 'Cisi & Kohn 2008' : 'Booth 1997';
  const axon = fmt(layout.axonLength, 2);
  return `${tr({
    'pt-BR': `Pele, ossos e músculos da perna direita: atlas (malhas em escala real). Unidades, tamanhos do soma e do dendrito, tempos de condução e disparos: modelo (${model}). Posição das unidades e territórios: ilustrativos. ${padText(layout)} Axônio de ${axon} m: o comprimento do modelo, o mesmo para todos os músculos (não é a distância medida da medula lombossacral à perna). Eletrodo sobre a zona de maior ramificação intramuscular do nervo: ${motorPointText(layout)}.`,
    en: `Skin, bones and muscles of the right leg: atlas (meshes at real scale). Units, soma and dendrite sizes, conduction times and spikes: model (${model}). Unit positions and territories: illustrative. ${padText(layout)} Axon ${axon} m: the model's length, the same for every muscle (not a measured distance from the lumbosacral cord to the leg). Electrode over the zone where the nerve branches most inside the muscle: ${motorPointText(layout)}.`,
  })} ${legNerveText(layout)} ${tr({
    'pt-BR': 'Um disparo some no trecho omitido e reaparece do outro lado no tempo real de condução. O músculo brilha com a força (% da máxima). A perna é estática: o modelo não tem o tornozelo, então o pé não se move.',
    en: 'A spike disappears into the omitted stretch and comes back on the other side at its real conduction time. The muscle glows with the force (% of maximum). The leg is static: the model has no ankle, so the foot does not move.',
  })}`;
}

/** Wrist angle now, its limits (the stop the joint model uses) and the run's wrist choices. */
function WristReadout({ angle, model }: { angle: number | null; model: NonNullable<StartedEvent['joint']> }) {
  if (angle === null) return null;
  const side =
    Math.abs(angle) < 0.05
      ? tr({ 'pt-BR': 'neutro', en: 'neutral' })
      : angle > 0
        ? tr({ 'pt-BR': 'flexão', en: 'flexion' })
        : tr({ 'pt-BR': 'extensão', en: 'extension' });
  return (
    <div className="three-angle" role="status" aria-live="off">
      <strong>
        {tr({ 'pt-BR': 'Punho', en: 'Wrist' })}: {fmt(Math.abs(angle), 1)}° {side}
      </strong>
      <span>
        {tr({
          'pt-BR': `limites ${fmt(model.flexionLimitDeg, 0)}° flexão / ${fmt(model.extensionLimitDeg, 0)}° extensão (Delp 1996)`,
          en: `limits ${fmt(model.flexionLimitDeg, 0)}° flexion / ${fmt(model.extensionLimitDeg, 0)}° extension (Delp 1996)`,
        })}
      </span>
      <span>
        {tr({
          'pt-BR': `força máxima ${fmt(model.peakForceN, 0)} N (${model.peakForceSource === 'SAUL_2015' ? 'Saul 2015' : 'medida direta, Binder-Markey 2023'}) · ${model.passive === 'LINEAR' ? 'mola linear (Davidson & Charles 2017)' : 'fim da amplitude (Delp 1996)'}`,
          en: `peak force ${fmt(model.peakForceN, 0)} N (${model.peakForceSource === 'SAUL_2015' ? 'Saul 2015' : 'direct measurement, Binder-Markey 2023'}) · ${model.passive === 'LINEAR' ? 'linear spring (Davidson & Charles 2017)' : 'end of range (Delp 1996)'}`,
        })}
      </span>
    </div>
  );
}
