import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { StartedEvent } from '../../domain/simulation';
import { UnitEventLog } from '../../application/unitEventLog';
import type { ChunkEvent } from '../../domain/simulation';
import ThreeDView from './ThreeDView';

// jsdom has no WebGL: these tests cover what the step shows before a scene can be drawn
vi.mock('@react-three/fiber', () => ({ Canvas: () => <div data-testid="canvas" /> }));
vi.mock('./ForearmScene', () => ({ ForearmScene: () => null }));

const started = (over: Partial<StartedEvent> = {}): StartedEvent => ({
  type: 'started',
  simulationId: 's',
  durationMs: 1000,
  outputStepMs: 0.1,
  motorUnits: { S: 1, FR: 0, FF: 0 },
  muscle: 'FLEXOR_CARPI_RADIALIS',
  maxForce: 1,
  electrodeFraction: 0.9,
  units: {
    motoneuron: 'BOOTH_1997',
    type: ['S'],
    poolIndex: [0],
    somaDiameterUm: [77.5],
    dendriteDiameterUm: [41.5],
    dendriteLengthMm: [5.5],
    conductionMs: [18.2],
    toElectrodeMs: [16.4],
    toMuscleMs: [1.8],
    weight: [1],
    axonRheobase: [30],
  },
  ...over,
});

const props = { axonLengthPercent: 80, muscleLabel: (id: string) => (id === 'SOLEUS' ? 'Soleus' : id), onUseMuscle: () => undefined };

describe('ThreeDView', () => {
  it('asks for a run first', () => {
    render(<ThreeDView run={null} {...props} />);
    expect(screen.getByText(/Rode uma simulação/)).toBeInTheDocument();
    expect(screen.queryByTestId('canvas')).toBeNull();
  });

  it('offers the FCR when the run used a leg muscle', async () => {
    const onUseMuscle = vi.fn();
    render(<ThreeDView run={started({ muscle: 'SOLEUS' })} {...props} onUseMuscle={onUseMuscle} />);
    expect(screen.getByText(/esta simulação usou Soleus/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Usar o FCR' }));
    expect(onUseMuscle).toHaveBeenCalledWith('FLEXOR_CARPI_RADIALIS');
  });

  it('says so when an older server sent no unit table', () => {
    render(<ThreeDView run={started({ units: undefined })} {...props} />);
    expect(screen.getByText(/não enviou a tabela das unidades/)).toBeInTheDocument();
  });

  it('draws a forearm run with its zoom levels, the sources and the atlas credit', () => {
    render(<ThreeDView run={started()} {...props} />);
    expect(screen.getByTestId('canvas')).toBeInTheDocument();
    for (const name of ['Antebraço', 'Músculo', 'Axônios', 'Motoneurônio']) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
    }
    expect(screen.getByText(/Booth 1997/)).toBeInTheDocument();
    expect(screen.getByText(/ponto motor 5,2 cm abaixo do cotovelo \(modelo\)/)).toBeInTheDocument();
    expect(screen.getByText(/BodyParts3D, © The Database Center for Life Science/)).toBeInTheDocument();
  });

  it('offers the replay controls once a run with per-unit events has ended, and not while it streams', () => {
    const log = new UnitEventLog();
    log.append({ unitEvents: { sample: [30, 210], unit: [0, 0], kind: [1, 7], origin: [-1, -1] } } as unknown as ChunkEvent);
    const run = started({ stepMs: 0.01 });
    const { rerender } = render(<ThreeDView run={run} running {...props} unitEvents={log} />);
    expect(screen.queryByRole('button', { name: /Tocar|Pausar/ })).toBeNull();
    expect(screen.getByText(/O replay fica pronto quando a simulação terminar/)).toBeInTheDocument();
    rerender(<ThreeDView run={run} running={false} {...props} unitEvents={log} />);
    expect(screen.getByRole('button', { name: 'Pausar' })).toBeInTheDocument(); // it starts playing
    expect(screen.getByRole('button', { name: 'Próximo pulso' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: '1/10×' })).toHaveAttribute('aria-checked', 'true'); // the forearm level shows the wrist move
    expect(screen.getByRole('slider', { name: 'Tempo do replay' })).toBeInTheDocument();
  });

  it('says why there is no replay for a run without per-unit events', () => {
    render(<ThreeDView run={started()} {...props} unitEvents={new UnitEventLog()} />);
    expect(screen.getByText(/rode de novo para receber os disparos por unidade/)).toBeInTheDocument();
  });

  it('shows the wrist angle and its limits when the run has a joint', async () => {
    const { JointBuffer } = await import('../../application/jointBuffer');
    const joint = new JointBuffer();
    joint.append({ joint: { angleDeg: [12.34], torqueNm: [1] } } as unknown as ChunkEvent);
    const model = {
      momentArmMm: 14.9,
      peakForceN: 137.3,
      peakForceSource: 'DIRECT_SPECIFIC_TENSION' as const,
      optimalFiberLengthMm: 63,
      maxContractionVelocity: 10,
      fvShapeAf: 0.25,
      fvMaxLengthening: 1.4,
      inertiaKgM2: 0.003,
      dampingNmsRad: 0.028,
      passive: 'END_RANGE' as const,
      stiffnessNmRad: 0.992,
      endRangeStartDeg: 75,
      flexionMomentAt90Nm: 0.5,
      extensionMomentAt90Nm: 1.2,
      flexionLimitDeg: 90,
      extensionLimitDeg: 90,
    };
    render(<ThreeDView run={started({ joint: model })} {...props} joint={joint} />);
    expect(screen.getByText(/Punho: 12,3° flexão/)).toBeInTheDocument();
    expect(screen.getByText(/limites 90° flexão \/ 90° extensão \(Delp 1996\)/)).toBeInTheDocument();
    expect(screen.getByText(/força máxima 137 N \(medida direta, Binder-Markey 2023\) · fim da amplitude \(Delp 1996\)/)).toBeInTheDocument();
  });
});
