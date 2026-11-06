/**
 * The 3D step (docs/design/3d-view.md): the forearm at human scale with the run's units. Loaded lazily, so the other
 * steps do not download three.js.
 */
import { Suspense, useMemo, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import type { LevelId } from '../../application/anatomy3d';
import { LEVELS, buildLayout, hasForearm } from '../../application/anatomy3d';
import type { MuscleId, StartedEvent } from '../../domain/simulation';
import { fmtNumber, tr } from '../../i18n/locale';
import { CHART_THEMES, useColorScheme } from '../theme';
import type { ViewReadout } from './ForearmScene';
import { ForearmScene } from './ForearmScene';
import { FOV_DEG } from './camera';
import { TAG_LABEL } from './tags';
import { scaleBar } from './scaleBar';

export interface ThreeDViewProps {
  run: StartedEvent | null;
  axonLengthPercent: number;
  muscleLabel: (id: MuscleId) => string;
  onUseMuscle: (id: MuscleId) => void;
}

const LEVEL_LABEL: Record<LevelId, () => string> = {
  L0: () => tr({ 'pt-BR': 'Antebraço', en: 'Forearm' }),
  L1: () => tr({ 'pt-BR': 'Músculo', en: 'Muscle' }),
  L2: () => tr({ 'pt-BR': 'Axônios', en: 'Axons' }),
  L3: () => tr({ 'pt-BR': 'Motoneurônio', en: 'Motoneuron' }),
};

const CREDIT = 'BodyParts3D, © The Database Center for Life Science licensed under CC Attribution 4.0 International';

const fmt = (v: number, digits = 1) => fmtNumber(v, { maximumFractionDigits: digits, minimumFractionDigits: digits });

export default function ThreeDView({ run, axonLengthPercent, muscleLabel, onUseMuscle }: ThreeDViewProps) {
  const scheme = useColorScheme();
  const series = CHART_THEMES[scheme].series;
  const colors = useMemo(() => ({ S: series.orange, FR: series.aqua, FF: series.yellow }), [series]);
  const layout = useMemo(() => (run ? buildLayout(run, axonLengthPercent) : null), [run, axonLengthPercent]);
  const [fly, setFly] = useState<{ level: LevelId; n: number }>({ level: 'L0', n: 0 });
  const [readout, setReadout] = useState<ViewReadout>({ level: 'L0', metresPerPixel: 0 });
  const [selected, setSelected] = useState<number | null>(null);

  if (!run) {
    return (
      <div className="card three-empty">
        <p>{tr({ 'pt-BR': 'Rode uma simulação para ver a anatomia dela em 3D.', en: 'Run a simulation to see its anatomy in 3D.' })}</p>
      </div>
    );
  }
  if (!hasForearm(run.muscle)) {
    return (
      <div className="card three-empty">
        <p>
          {tr({
            'pt-BR': `A vista 3D mostra o antebraço; esta simulação usou ${muscleLabel(run.muscle)}.`,
            en: `The 3D view shows the forearm; this run used ${muscleLabel(run.muscle)}.`,
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

  return (
    <div className="three-view">
      <div className="three-toolbar" role="toolbar" aria-label={tr({ 'pt-BR': 'Nível de zoom', en: 'Zoom level' })}>
        {LEVELS.map((l) => (
          <button
            key={l.id}
            type="button"
            className={`btn${readout.level === l.id ? ' btn--selected' : ''}`}
            aria-pressed={readout.level === l.id}
            onClick={() => setFly((f) => ({ level: l.id, n: f.n + 1 }))}
          >
            {LEVEL_LABEL[l.id]()}
          </button>
        ))}
        <span className="three-legend" aria-label={tr({ 'pt-BR': 'Tipos de unidade', en: 'Unit types' })}>
          {(['S', 'FR', 'FF'] as const).map((t) => (
            <span key={t}><i style={{ background: colors[t] }} aria-hidden="true" /> {t}</span>
          ))}
        </span>
      </div>
      <div className="three-canvas">
        <Canvas
          camera={{ fov: FOV_DEG, near: 0.001, far: 10, position: [0.3, 0.5, 0.4] }}
          onCreated={({ gl }) => { gl.localClippingEnabled = true; }}
          dpr={[1, 2]}
        >
          <Suspense fallback={null}>
            <ForearmScene layout={layout} level={readout.level} fly={fly} colors={colors} selected={selected} onSelect={setSelected} onReadout={setReadout} />
          </Suspense>
        </Canvas>
        {bar ? (
          <div className="three-scale" aria-label={tr({ 'pt-BR': 'Escala', en: 'Scale' })}>
            <span style={{ width: `${bar.pixels}px` }} />
            {bar.label}
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
              <dt>{tr({ 'pt-BR': 'Posição, território, trajeto', en: 'Position, territory, path' })}</dt>
              <dd><em>{TAG_LABEL.illustrative()}</em></dd>
            </dl>
          </div>
        ) : null}
      </div>
      <p className="three-notes muted">
        {tr({
          'pt-BR': `Pele, ossos e músculos: atlas (malhas em escala real). Unidades, tamanhos do soma e do dendrito e tempos de condução: modelo (${layout.motoneuron === 'CISI_KOHN_2008' ? 'Cisi & Kohn 2008' : 'Booth 1997'}). Posição das unidades, territórios, trajeto do nervo e tamanho do eletrodo: ilustrativos. Axônio de ${fmt(layout.axonLength, 2)} m; ponto motor ${fmt(layout.motorPoint.x * 100, 1)} cm abaixo do cotovelo (${TAG_LABEL[layout.motorPoint.tag]()}). O músculo não encurta: o modelo é isométrico.`,
          en: `Skin, bones and muscles: atlas (meshes at real scale). Units, soma and dendrite sizes and conduction times: model (${layout.motoneuron === 'CISI_KOHN_2008' ? 'Cisi & Kohn 2008' : 'Booth 1997'}). Unit positions, territories, nerve path and electrode size: illustrative. Axon ${fmt(layout.axonLength, 2)} m; motor point ${fmt(layout.motorPoint.x * 100, 1)} cm below the elbow (${TAG_LABEL[layout.motorPoint.tag]()}). The muscle does not shorten: the model is isometric.`,
        })}
      </p>
      <p className="three-credit muted">{CREDIT}</p>
    </div>
  );
}
