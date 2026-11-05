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
const chooseLiterature = (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole('radio', { name: 'Corrigido pela literatura' }));

describe('SimulationForm', () => {
  it('renders the groups prefilled with contract defaults and loaded muscles', () => {
    setup();
    for (const g of ['Estímulo', 'Modulação', 'Músculo / unidades motoras', 'Motoneurônio']) {
      expect(screen.getByRole('group', { name: g })).toBeInTheDocument();
    }
    expect(screen.getByRole('radiogroup', { name: 'Modelo' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Original (MATLAB fiel)' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'Monofásica' })).toHaveAttribute('aria-checked', 'true');
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
    await chooseLiterature(user);
    expect(screen.getByText(/Sem efeito no modelo corrigido/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Temperatura/)).toBeDisabled();
    expect(screen.getByRole('radio', { name: 'Soma' })).toBeDisabled();
    expect(screen.queryByLabelText('Unidades S')).not.toBeInTheDocument();
    expect(screen.getByText('Unidades simuladas')).toBeInTheDocument();
    expect(screen.getByText(/automático \(120 unidades/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Simular' }));
    const req = onSubmit.mock.calls[0]?.[0] as SimulationRequest;
    expect(req.modelVariant).toBe('LITERATURE');
    expect(req.unitsPerType).toBeUndefined();

    await user.click(screen.getByRole('switch', { name: /Definir contagens manualmente/ }));
    expect(screen.getByLabelText('Unidades S')).toBeEnabled();
  });

  it('LITERATURE: "Aplicar estímulo clínico" fills duty cycle and amplitude only on click', async () => {
    const { user } = setup();
    await chooseLiterature(user);
    expect(screen.getByLabelText(/Ciclo de trabalho/)).toHaveValue('20');
    await user.click(screen.getByRole('button', { name: 'Aplicar estímulo clínico' }));
    expect(screen.getByLabelText(/Ciclo de trabalho/)).toHaveValue('1.2');
    expect(screen.getByLabelText(/Amplitude/)).toHaveValue('153');
  });

  it('intermittent trains toggle shows the two fields and sends them', async () => {
    const { onSubmit, user } = setup();
    expect(screen.queryByLabelText(/Trem ligado/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('switch', { name: /Trens intermitentes/ }));
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

  it('while running: inputs and submit disabled', () => {
    setup({ running: true });
    expect(screen.getByRole('button', { name: 'Simular' })).toBeDisabled();
    expect(screen.getByLabelText(/Frequência/)).toBeDisabled();
  });

  it('steppers and arrow keys change numeric fields', async () => {
    const { user } = setup();
    const duty = screen.getByLabelText(/Ciclo de trabalho/);
    await user.click(duty);
    await user.keyboard('{ArrowUp}');
    expect(duty).toHaveValue('20.1');
    await user.keyboard('{ArrowDown}{ArrowDown}');
    expect(duty).toHaveValue('19.9');
  });

  it('a client error opens its collapsed section', async () => {
    const { user } = setup();
    const modulation = screen.getByText('Modulação').closest('details')!;
    expect(modulation.open).toBe(false);
    await user.selectOptions(screen.getByLabelText('Forma da modulação'), 'TRIANGLE');
    await user.click(screen.getByRole('button', { name: 'Simular' }));
    expect(modulation.open).toBe(true);
  });

  it('help popover opens and closes with Escape', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: 'Ajuda: Modelo' }));
    expect(screen.getByRole('dialog', { name: 'Modelo' })).toHaveTextContent('Correções validadas');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Modelo' })).not.toBeInTheDocument();
  });

});
