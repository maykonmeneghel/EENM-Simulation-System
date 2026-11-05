import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { defaultRequest } from '../domain/defaults';
import type { MusclePreset } from '../domain/simulation';
import { SimulationForm } from './SimulationForm';

const muscles: MusclePreset[] = [
  { id: 'SOLEUS', label: 'Soleus', poolSize: { S: 800, FR: 50, FF: 50 } },
  { id: 'TIBIALIS_ANTERIOR', label: 'Tibial anterior', poolSize: { S: 100, FR: 50, FF: 50 } },
];
const setup = (props: Partial<Parameters<typeof SimulationForm>[0]> = {}) => {
  const onSubmit = vi.fn();
  const onStop = vi.fn();
  render(
    <SimulationForm muscles={muscles} serverErrors={[]} running={false} onSubmit={onSubmit} onStop={onStop} {...props} />,
  );
  return { onSubmit, onStop, user: userEvent.setup() };
};

describe('SimulationForm', () => {
  it('renders the four groups prefilled with contract defaults and loaded muscles', () => {
    setup();
    for (const g of ['Estímulo', 'Modulação', 'Músculo / unidades motoras', 'Motoneurônio']) {
      expect(screen.getByRole('group', { name: g })).toBeInTheDocument();
    }
    expect(screen.getByLabelText(/Frequência/)).toHaveValue('40');
    expect(screen.getByLabelText(/Temperatura/)).toHaveValue('6.3');
    expect(screen.getByRole('option', { name: 'Tibial anterior' })).toBeInTheDocument();
    expect(screen.getByLabelText(/Instante do pico/)).toBeDisabled();
  });

  it('submits the default request', async () => {
    const { onSubmit, user } = setup();
    await user.click(screen.getByRole('button', { name: 'Simular' }));
    expect(onSubmit).toHaveBeenCalledWith(defaultRequest());
  });

  it('blocks submit and shows a client-side error next to the field', async () => {
    const { onSubmit, user } = setup();
    const freq = screen.getByLabelText(/Frequência/);
    await user.clear(freq);
    await user.type(freq, '500');
    await user.click(screen.getByRole('button', { name: 'Simular' }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(freq).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('deve estar entre 1 e 200')).toBeInTheDocument();
  });

  it('shows problem+json field errors next to fields and unknown ones in a list', () => {
    setup({
      serverErrors: [
        { field: 'stimulus.amplitude', message: 'must be between 0 and 500' },
        { field: 'unitsPerType', message: 'sum must be >= 1' },
      ],
    });
    expect(screen.getByLabelText(/Amplitude/)).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('must be between 0 and 500')).toBeInTheDocument();
    expect(screen.getByText('sum must be >= 1')).toBeInTheDocument();
  });

  it('enables peak time for TRIANGLE modulation', async () => {
    const { user } = setup();
    await user.selectOptions(screen.getByLabelText('Forma da modulação'), 'TRIANGLE');
    expect(screen.getByLabelText(/Instante do pico/)).toBeEnabled();
  });

  it('while running: inputs disabled, Parar enabled', async () => {
    const { onStop, user } = setup({ running: true });
    expect(screen.getByRole('button', { name: 'Simular' })).toBeDisabled();
    expect(screen.getByLabelText(/Frequência/)).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Parar' }));
    expect(onStop).toHaveBeenCalled();
  });
});
