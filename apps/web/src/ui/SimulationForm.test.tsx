import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { FormValues } from '../application/formModel';
import { defaultFormValues } from '../application/formModel';
import { defaultRequest } from '../domain/defaults';
import type { MusclePreset, SimulationRequest } from '../domain/simulation';
import { SIM_FORM_ID, SimulationForm } from './SimulationForm';

const muscles: MusclePreset[] = [
  { id: 'SOLEUS', label: 'Soleus', poolSize: { S: 800, FR: 50, FF: 50 } },
  { id: 'TIBIALIS_ANTERIOR', label: 'Tibial anterior', poolSize: { S: 100, FR: 50, FF: 50 } },
];
type Props = Parameters<typeof SimulationForm>[0];
function Controlled(props: Omit<Props, 'values' | 'onValuesChange'>) {
  const [values, setValues] = useState<FormValues>(() => defaultFormValues());
  return (
    <>
      <SimulationForm {...props} values={values} onValuesChange={setValues} />
      {/* the toolbar button lives outside the form, like in App */}
      <button type="submit" form={SIM_FORM_ID} disabled={props.running}>
        Simular
      </button>
    </>
  );
}
const setup = (props: Partial<Omit<Props, 'values' | 'onValuesChange'>> = {}) => {
  const onSubmit = vi.fn();
  render(<Controlled muscles={muscles} serverErrors={[]} running={false} onSubmit={onSubmit} {...props} />);
  return { onSubmit, user: userEvent.setup() };
};

describe('SimulationForm', () => {
  it('renders the sidebar sections (no model selector; stimulus summarised) with defaults and muscles', () => {
    setup();
    for (const g of ['Modelo', 'Estímulo', 'Músculo / unidades motoras', 'Simulação']) {
      expect(screen.getByRole('group', { name: g })).toBeInTheDocument();
    }
    for (const gone of ['Modulação', 'Motoneurônio']) expect(screen.queryByRole('group', { name: gone })).toBeNull();
    expect(screen.queryByRole('radiogroup', { name: 'Modelo' })).toBeNull();
    expect(screen.getByRole('radio', { name: 'Músculo inteiro' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText(/40 Hz · 300 µs · bifásica simétrica · amplitude 153 · contínuo/)).toBeInTheDocument();
    expect(screen.getByText(/≈ 100 % das unidades recrutadas/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Duração/)).toHaveValue('1000');
    expect(screen.getByRole('option', { name: 'Tibial anterior' })).toBeInTheDocument();
  });

  it('submits the default request', async () => {
    const { onSubmit, user } = setup();
    await user.click(screen.getByRole('button', { name: 'Simular' }));
    expect(onSubmit).toHaveBeenCalledWith(defaultRequest());
  });

  it('blocks submit and shows a client-side error next to the field', async () => {
    const { onSubmit, user } = setup();
    const duration = screen.getByLabelText(/Duração/);
    await user.clear(duration);
    await user.type(duration, '5');
    await user.click(screen.getByRole('button', { name: 'Simular' }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(duration).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('deve estar entre 10 e 300000')).toBeInTheDocument();
  });

  it('stimulus errors are listed under Estímulo and reported to the app', async () => {
    const onClientErrors = vi.fn();
    const onOpenStimulator = vi.fn();
    setup({
      onClientErrors,
      onOpenStimulator,
      serverErrors: [
        { field: 'stimulus.amplitude', message: 'must be between 0 and 500' },
        { field: 'unitsPerType', message: 'sum must be >= 1' },
      ],
    });
    expect(screen.getByText('must be between 0 and 500')).toBeInTheDocument();
    expect(screen.getByText('sum must be >= 1')).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Abrir estimulador' }));
    expect(onOpenStimulator).toHaveBeenCalled();
  });

  it('automatic units by default, omits unitsPerType; manual counts can be set', async () => {
    const { onSubmit, user } = setup();
    expect(screen.queryByLabelText('Unidades S')).not.toBeInTheDocument();
    expect(screen.getByText(/automático \(120 unidades/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Simular' }));
    expect((onSubmit.mock.calls[0]?.[0] as SimulationRequest).unitsPerType).toBeUndefined();
    await user.click(screen.getByRole('switch', { name: /Definir contagens manualmente/ }));
    expect(screen.getByLabelText('Unidades S')).toBeEnabled();
  });

  it('calibration target is sent with the request', async () => {
    const { onSubmit, user } = setup();
    await user.click(screen.getByRole('radio', { name: 'Unidade isolada' }));
    await user.click(screen.getByRole('button', { name: 'Simular' }));
    expect((onSubmit.mock.calls[0]?.[0] as SimulationRequest).calibrationTarget).toBe('SINGLE_UNIT');
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

  it('while running: inputs and submit disabled', () => {
    setup({ running: true });
    expect(screen.getByRole('button', { name: 'Simular' })).toBeDisabled();
    expect(screen.getByLabelText(/Duração/)).toBeDisabled();
  });

  it('steppers and arrow keys change numeric fields', async () => {
    const { user } = setup();
    const axon = screen.getByLabelText(/Comprimento do axônio/);
    await user.click(axon);
    await user.keyboard('{ArrowUp}');
    expect(axon).toHaveValue('81');
    await user.keyboard('{ArrowDown}{ArrowDown}');
    expect(axon).toHaveValue('79');
  });

  it('help popover opens and closes with Escape', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: 'Ajuda: Calibração do twitch' }));
    expect(screen.getByRole('dialog', { name: 'Calibração do twitch' })).toHaveTextContent('Macefield');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Calibração do twitch' })).not.toBeInTheDocument();
  });
});
