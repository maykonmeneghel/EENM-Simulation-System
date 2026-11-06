import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { StartedEvent } from '../../domain/simulation';
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
});
