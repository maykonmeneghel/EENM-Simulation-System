import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { defaultRequest } from '../domain/defaults';
import type { MusclePreset, SimulationRequest } from '../domain/simulation';
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
  it('renders the groups prefilled with contract defaults and loaded muscles', () => {
    setup();
    for (const g of ['Modelo', 'Estímulo', 'Modulação', 'Músculo / unidades motoras', 'Motoneurônio']) {
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

  it('LITERATURE: disables motoneuron fields, automatic units by default, omits unitsPerType', async () => {
    const { onSubmit, user } = setup();
    await user.selectOptions(screen.getByLabelText('Modelo'), 'LITERATURE');
    expect(screen.getByText(/não têm efeito/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Temperatura/)).toBeDisabled();
    expect(screen.getByLabelText('Local de injeção')).toBeDisabled();
    expect(screen.getByLabelText('Unidades S')).toBeDisabled();
    expect(screen.getByText(/automático \(120 unidades/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Simular' }));
    const req = onSubmit.mock.calls[0]?.[0] as SimulationRequest;
    expect(req.modelVariant).toBe('LITERATURE');
    expect(req.unitsPerType).toBeUndefined();

    await user.click(screen.getByLabelText('Definir contagens manualmente'));
    expect(screen.getByLabelText('Unidades S')).toBeEnabled();
  });

  it('LITERATURE: "Aplicar estímulo clínico" fills duty cycle and amplitude only on click', async () => {
    const { user } = setup();
    await user.selectOptions(screen.getByLabelText('Modelo'), 'LITERATURE');
    expect(screen.getByLabelText(/Ciclo de trabalho/)).toHaveValue('20');
    await user.click(screen.getByRole('button', { name: 'Aplicar estímulo clínico' }));
    expect(screen.getByLabelText(/Ciclo de trabalho/)).toHaveValue('1.2');
    expect(screen.getByLabelText(/Amplitude/)).toHaveValue('153');
  });

  it('intermittent trains toggle shows the two fields and sends them', async () => {
    const { onSubmit, user } = setup();
    expect(screen.queryByLabelText(/Trem ligado/)).not.toBeInTheDocument();
    await user.click(screen.getByLabelText(/Trens intermitentes/));
    expect(screen.getByLabelText(/Trem ligado/)).toHaveValue('330');
    await user.click(screen.getByRole('button', { name: 'Simular' }));
    const req = onSubmit.mock.calls[0]?.[0] as SimulationRequest;
    expect([req.stimulus.trainOnMs, req.stimulus.trainPeriodMs]).toEqual([330, 1000]);
  });

  it('long runs: suggests a coarser output step and auto-raises it on submit', async () => {
    const { onSubmit, user } = setup();
    const duration = screen.getByLabelText(/Duração/);
    await user.clear(duration);
    await user.type(duration, '60000');
    expect(screen.getByRole('button', { name: /Usar 0,6 ms/ })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Simular' }));
    expect((onSubmit.mock.calls[0]?.[0] as SimulationRequest).outputStepMs).toBe(0.6);
    expect(screen.getByLabelText(/Passo de saída/)).toHaveValue('0.6');
    expect(screen.getByText(/Passo de saída ajustado de 0.1 para 0.6 ms/)).toBeInTheDocument();
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
