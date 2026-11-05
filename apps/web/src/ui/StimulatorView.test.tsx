import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect, useState } from 'react';
import { describe, expect, it } from 'vitest';
import type { FormValues } from '../application/formModel';
import { defaultFormValues, parseForm } from '../application/formModel';
import type { FieldError } from '../domain/simulation';
import { settingsFromForm } from '../application/stimulatorForm';
import { StimulatorView } from './StimulatorView';

const seen: { values: FormValues | null } = { values: null };
function Controlled({ errors = [], running = false }: { errors?: FieldError[]; running?: boolean }) {
  const [values, setValues] = useState<FormValues>(() => defaultFormValues());
  useEffect(() => {
    seen.values = values;
  }, [values]);
  return <StimulatorView values={values} onValuesChange={setValues} errors={errors} running={running} />;
}
const setup = (props: { errors?: FieldError[]; running?: boolean } = {}) => {
  render(<Controlled {...props} />);
  return userEvent.setup();
};
const request = () => {
  const r = parseForm(seen.values!);
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  return r.request;
};

describe('StimulatorView', () => {
  it('shows the device controls, both scopes and the recruitment meter with the defaults', () => {
    setup();
    expect(screen.getByLabelText('Frequência')).toHaveValue('40');
    expect(screen.getByLabelText('Largura de pulso')).toHaveValue('300');
    expect(screen.getByLabelText('Amplitude')).toHaveValue('153');
    expect(screen.getByRole('radio', { name: 'Bifásica simétrica' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('img', { name: /Pulso bifásico de 300 µs/ })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /Envelope/ })).toBeInTheDocument();
    expect(screen.getByRole('meter', { name: 'Unidades recrutadas' })).toHaveAttribute('aria-valuenow', '100');
  });

  it('editing the pulse width and amplitude changes the request and the recruited fraction', async () => {
    const user = setup();
    const amp = screen.getByLabelText('Amplitude');
    await user.clear(amp);
    await user.type(amp, '80');
    const meter = screen.getByRole('meter', { name: 'Unidades recrutadas' });
    const partial = Number(meter.getAttribute('aria-valuenow'));
    expect(partial).toBeGreaterThan(0);
    expect(partial).toBeLessThan(100);
    const pw = screen.getByLabelText('Largura de pulso');
    await user.clear(pw);
    await user.type(pw, '600');
    expect(Number(meter.getAttribute('aria-valuenow'))).toBeGreaterThan(partial); // longer pulse, lower threshold
    expect(request().stimulus).toMatchObject({ pulseWidthUs: 600, amplitude: 80 });
  });

  it('monophasic, trains and ramps reach the request', async () => {
    const user = setup();
    await user.click(screen.getByRole('radio', { name: 'Monofásica' }));
    expect(screen.getByRole('img', { name: /Pulso monofásico/ })).toBeInTheDocument();
    await user.click(screen.getByRole('switch', { name: /Trens/ }));
    const ramp = screen.getByLabelText('Rampa de subida');
    await user.clear(ramp);
    await user.type(ramp, '100');
    expect(request().stimulus).toMatchObject({
      waveform: 'MONOPHASIC',
      trainOnMs: 330,
      trainPeriodMs: 1000,
      rampUpMs: 100,
    });
  });

  it('warns instead of drawing when the ramps do not fit in the on time', async () => {
    const user = setup();
    const ramp = screen.getByLabelText('Rampa de subida');
    await user.clear(ramp);
    await user.type(ramp, '1500');
    expect(screen.getByText(/Rampa de subida \+ descida maior que o tempo ligado/)).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: /Envelope/ })).toBeNull();
  });

  it('shows field errors next to their control (trainPeriodMs on the off time)', async () => {
    const user = setup({
      errors: [
        { field: 'stimulus.amplitude', message: 'must be between 0 and 500' },
        { field: 'stimulus.trainPeriodMs', message: 'must be ≤ durationMs' },
      ],
    });
    expect(screen.getByLabelText('Amplitude')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('must be between 0 and 500')).toBeInTheDocument();
    expect(screen.queryByText('must be ≤ durationMs')).toBeNull(); // off-time control hidden while trains are off
    await user.click(screen.getByRole('switch', { name: /Trens/ }));
    expect(screen.getByLabelText('Tempo desligado')).toHaveAttribute('aria-invalid', 'true');
  });

  it('motoneuron pool site: the Weiss meter gives way to an explanation, and the site reaches the request', async () => {
    const user = setup();
    expect(screen.getByRole('radio', { name: 'Superfície da pele' })).toHaveAttribute('aria-checked', 'true');
    await user.click(screen.getByRole('radio', { name: 'Pool de motoneurônios' }));
    expect(screen.queryByRole('meter', { name: 'Unidades recrutadas' })).toBeNull();
    expect(screen.getByText(/não segue a lei de Weiss/)).toBeInTheDocument();
    expect(request().stimulationSite).toBe('MOTONEURON_POOL');
  });

  it('while running the controls are disabled', () => {
    setup({ running: true });
    expect(screen.getByLabelText('Frequência')).toBeDisabled();
    expect(screen.getByLabelText('Frequência (controle deslizante)')).toBeDisabled();
  });

  it('settingsFromForm is null while a value is not a number', () => {
    expect(settingsFromForm(defaultFormValues())).not.toBeNull();
    expect(settingsFromForm({ ...defaultFormValues(), 'stimulus.pulseWidthUs': 'x' })).toBeNull();
  });
});
