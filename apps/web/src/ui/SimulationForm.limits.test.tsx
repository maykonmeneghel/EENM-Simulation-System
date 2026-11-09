import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FormValues } from '../application/formModel';
import { defaultFormValues } from '../application/formModel';
import type { ServerLimits } from '../domain/limits';
import { CONTRACT_LIMITS } from '../domain/limits';
import { setLocale } from '../i18n/locale';
import { SIM_FORM_ID, SimulationForm } from './SimulationForm';

const HOSTED: ServerLimits = { ...CONTRACT_LIMITS, maxDurationMs: 5000 };

function setup(limits?: ServerLimits) {
  const onSubmit = vi.fn();
  function Controlled() {
    const [values, setValues] = useState<FormValues>(() => defaultFormValues());
    return (
      <>
        <SimulationForm values={values} onValuesChange={setValues} muscles={[]} serverErrors={[]} running={false} onSubmit={onSubmit} limits={limits} />
        <button type="submit" form={SIM_FORM_ID}>
          Simular
        </button>
      </>
    );
  }
  render(<Controlled />);
  return { onSubmit, user: userEvent.setup() };
}

afterEach(() => act(() => setLocale('pt-BR')));

describe('SimulationForm with server limits', () => {
  it('shows the server maximum by the duration field and refuses a longer run before calling the API', async () => {
    const { onSubmit, user } = setup(HOSTED);
    expect(screen.getByText('Este servidor permite até 5.000 ms por simulação.')).toBeInTheDocument();
    const duration = screen.getByLabelText('Duração');
    expect(duration).toHaveAttribute('title', 'Intervalo: 10 – 5.000');
    await user.clear(duration);
    await user.type(duration, '6000');
    await user.click(screen.getByRole('button', { name: 'Simular' }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('este servidor limita a duração a 5000 ms');
    act(() => setLocale('en'));
    await user.click(screen.getByRole('button', { name: 'Simular' }));
    expect(screen.getByRole('alert')).toHaveTextContent('this server limits the duration to 5000 ms');
  });

  it('says nothing more without limits (local server)', () => {
    setup();
    expect(screen.queryByText(/Este servidor permite/)).toBeNull();
    expect(screen.getByLabelText('Duração')).toHaveAttribute('title', 'Intervalo: 10 – 300000');
  });
});
