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
function Controlled({
  errors = [],
  running = false,
  initial = {},
}: {
  errors?: FieldError[];
  running?: boolean;
  initial?: Partial<FormValues>;
}) {
  const [values, setValues] = useState<FormValues>(() => ({ ...defaultFormValues(), ...initial }));
  useEffect(() => {
    seen.values = values;
  }, [values]);
  return <StimulatorView values={values} onValuesChange={setValues} errors={errors} running={running} />;
}
const setup = (props: { errors?: FieldError[]; running?: boolean; initial?: Partial<FormValues> } = {}) => {
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
    expect(screen.getByLabelText('Largura de pulso')).toHaveValue('300'); // µs, absolute
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
    expect(screen.getByLabelText('Período do trem')).toHaveValue('1000'); // on 330 + off 670 ms
    expect(screen.getByLabelText('Tempo ligado')).toHaveValue('33'); // % of the period
    const ramp = screen.getByLabelText('Rampa de subida');
    await user.clear(ramp);
    await user.type(ramp, '30'); // % of the 330 ms on time
    expect(request().stimulus).toMatchObject({
      waveform: 'MONOPHASIC',
      trainOnMs: 330,
      trainPeriodMs: 1000,
      rampUpMs: 99,
    });
    const on = screen.getByLabelText('Tempo ligado');
    await user.clear(on);
    await user.type(on, '50');
    expect(request().stimulus).toMatchObject({ trainOnMs: 500, trainPeriodMs: 1000 }); // the period stays; off is the rest
    expect(screen.getByText(/desligado 500 ms \(50 %\)/)).toBeInTheDocument();
    const period = screen.getByLabelText('Período do trem');
    await user.clear(period);
    await user.type(period, '800'); // ≤ the 1000 ms run
    expect(request().stimulus).toMatchObject({ trainOnMs: 400, trainPeriodMs: 800 }); // the on share stays at 50 %
  });

  it('warns instead of drawing when the ramps do not fit in the on time', () => {
    setup({ initial: { 'stimulus.rampUpMs': '700', 'stimulus.rampDownMs': '700' } });
    expect(screen.getByText(/Rampa de subida \+ descida maior que o tempo ligado/)).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: /Envelope/ })).toBeNull();
  });

  it('shows field errors next to their control (trainPeriodMs on the train period)', async () => {
    const user = setup({
      errors: [
        { field: 'stimulus.amplitude', message: 'must be between 0 and 500' },
        { field: 'stimulus.trainPeriodMs', message: 'must be ≤ durationMs' },
      ],
    });
    expect(screen.getByLabelText('Amplitude')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('must be between 0 and 500')).toBeInTheDocument();
    expect(screen.queryByText('must be ≤ durationMs')).toBeNull(); // period control hidden while trains are off
    await user.click(screen.getByRole('switch', { name: /Trens/ }));
    expect(screen.getByLabelText('Período do trem')).toHaveAttribute('aria-invalid', 'true');
  });

  it('motoneuron pool site: the Weiss meter gives way to an explanation, and the site reaches the request', async () => {
    const user = setup();
    expect(screen.getByRole('radio', { name: 'Não invasivo (pele)' })).toHaveAttribute('aria-checked', 'true');
    await user.click(screen.getByRole('radio', { name: 'Invasivo (pool)' }));
    expect(screen.queryByRole('meter', { name: 'Unidades recrutadas' })).toBeNull();
    expect(screen.getByText(/não segue a lei de Weiss/)).toBeInTheDocument();
    expect(request().stimulationSite).toBe('MOTONEURON_POOL');
  });

  it('while running the controls are disabled', () => {
    setup({ running: true });
    expect(screen.getByLabelText('Frequência')).toBeDisabled();
    expect(screen.getByLabelText('Frequência (controle deslizante)')).toBeDisabled();
  });

  it('has an Electrode section on the skin only, with the sourced defaults, the effect options and G = 1', async () => {
    const user = setup();
    const section = screen.getByRole('group', { name: 'Eletrodo' });
    expect(section).toHaveTextContent('5 × 5 cm · G = 1');
    expect(screen.getByLabelText('Largura')).toHaveValue('5');
    expect(screen.getByLabelText('Gordura subcutânea')).toHaveValue('0.75');
    expect(screen.getByRole('radio', { name: /Fórmula derivada/ })).toBeChecked();
    expect(section).toHaveTextContent('modelo derivado, magnitude ilustrativa, não validada');
    expect(screen.getByRole('radio', { name: /Sem efeito — Lieber & Kelly 1991/ })).not.toBeChecked();
    expect(section).toHaveTextContent('Sem efeito: o estimulador é de corrente constante');
    expect(section).toHaveTextContent('Leitura: G = 1 · 1ª unidade 56,9 u.m. · todas 102,1 u.m.');
    // the electrode position on the axon lives here now; it counts only with a central drive
    expect(screen.getByLabelText('Posição no axônio (com comando central)')).toBeDisabled();
    await user.click(screen.getByRole('radio', { name: 'Invasivo (pool)' }));
    expect(screen.queryByRole('group', { name: 'Eletrodo' })).toBeNull();
  });

  it('a larger electrode needs more amplitude: the recruited fraction falls', async () => {
    const user = setup();
    const meter = screen.getByRole('meter', { name: 'Unidades recrutadas' });
    expect(meter).toHaveAttribute('aria-valuenow', '100');
    const length = screen.getByLabelText('Comprimento');
    await user.clear(length);
    await user.type(length, '9');
    expect(Number(meter.getAttribute('aria-valuenow'))).toBeLessThan(100);
    expect(screen.getByRole('group', { name: 'Eletrodo' })).toHaveTextContent(/G = 1,9/);
    expect(request().electrode).toMatchObject({ widthCm: 5, lengthCm: 9 });
    // the "no effect" option keeps G = 1
    await user.click(screen.getByRole('radio', { name: /Sem efeito/ }));
    expect(meter).toHaveAttribute('aria-valuenow', '100');
    expect(request().electrode!.effectModel).toBe('NONE');
  });

  it('a measured fat thickness is one click, and a round pad keeps the area', async () => {
    const user = setup();
    await user.click(screen.getByRole('radio', { name: 'Redondo' }));
    expect(screen.getByLabelText('Diâmetro')).toHaveValue('5.64'); // the disk of 25 cm²
    expect(screen.getByRole('group', { name: 'Eletrodo' })).toHaveTextContent('G = 1');
    expect(screen.getByRole('button', { name: '0,75 cm' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('calibrating in mA turns the amplitude into mA', async () => {
    const user = setup();
    await user.click(screen.getByRole('switch', { name: /Calibrar em mA/ }));
    const mt = screen.getByLabelText('Limiar motor medido');
    await user.type(mt, '18');
    const full = screen.getByLabelText('Recrutamento total (opcional)');
    await user.type(full, '40');
    const amp = screen.getByLabelText('Amplitude');
    await user.clear(amp);
    await user.type(amp, '29');
    expect(screen.getAllByText('mA').length).toBeGreaterThan(0);
    expect(screen.getByRole('group', { name: 'Eletrodo' })).toHaveTextContent('1ª unidade 18 mA · todas 40 mA');
    const meter = screen.getByRole('meter', { name: 'Unidades recrutadas' });
    expect(meter).toHaveAttribute('aria-valuenow', '50'); // (29 − 18) / (40 − 18)
    expect(request().electrode!.calibration).toEqual({ motorThresholdMa: 18, fullRecruitmentMa: 40, pulseWidthUs: 300, electrodeAreaCm2: 25 });
  });

  it('settingsFromForm is null while a value is not a number', () => {
    expect(settingsFromForm(defaultFormValues())).not.toBeNull();
    expect(settingsFromForm({ ...defaultFormValues(), 'stimulus.pulseWidthUs': 'x' })).toBeNull();
  });
});
