import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FormValues } from '../application/formModel';
import { defaultFormValues } from '../application/formModel';
import { defaultRequest } from '../domain/defaults';
import type { MusclePreset, SimulationRequest } from '../domain/simulation';
import { randomSeed } from '../application/formModel';
import { HelpContext } from './helpContext';
import { SIM_FORM_ID, SimulationForm } from './SimulationForm';
import { STEPS, stepCounter } from './steps';
import { setLocale } from '../i18n/locale';

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

  it('the "?" help opens its text in the right sidebar, not a popover', async () => {
    const show = vi.fn();
    const user = userEvent.setup();
    render(
      <HelpContext.Provider value={show}>
        <Controlled muscles={muscles} serverErrors={[]} running={false} onSubmit={vi.fn()} />
      </HelpContext.Provider>,
    );
    const help = screen.getByRole('button', { name: 'Ajuda: Calibração do twitch' });
    expect(help).toHaveAttribute('aria-controls', 'inspector');
    await user.click(help);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(show).toHaveBeenCalledTimes(1);
    const [label, content] = show.mock.calls[0]!;
    expect(label).toBe('Calibração do twitch');
    render(<>{content}</>);
    expect(screen.getByText(/Macefield/)).toBeInTheDocument();
  });

  it('the simulation step has no sub-heading repeating its name', () => {
    setup({ step: 'simulation' });
    expect(screen.getByRole('group', { name: 'Simulação' })).toBeInTheDocument();
    expect(screen.queryByText('Simulação', { selector: 'summary' })).toBeNull();
  });

  it('the seed has a default, can be typed, drawn at random, and goes back to the default when emptied', async () => {
    const { user, onSubmit } = setup({ step: 'simulation' });
    const seed = screen.getByLabelText(/Semente/);
    expect(seed).toHaveValue('0');
    await user.clear(seed);
    await user.type(seed, '42');
    expect(seed).toHaveValue('42');
    await user.clear(seed);
    await user.tab();
    expect(seed).toHaveValue('0');
    const before = (seed as HTMLInputElement).value;
    const spy = vi.spyOn(Math, 'random').mockReturnValue(0.123456789);
    await user.click(screen.getByRole('button', { name: 'Sortear outra semente' }));
    spy.mockRestore();
    expect(seed).toHaveValue('123456');
    expect(seed).not.toHaveValue(before);
    await user.click(screen.getAllByRole('button', { name: 'Simular' })[0]!);
    expect(onSubmit.mock.calls[0]![0].seed).toBe(123456);
  });

  it('randomSeed gives whole numbers from 0 to 999 999', () => {
    expect(randomSeed(() => 0)).toBe('0');
    expect(randomSeed(() => 0.9999999)).toBe('999999');
  });
});

describe('SimulationForm in English', () => {
  const PT = /[ãõçáéíóúâêôÃÕÇÁÉÍÓÚÂÊÔ]/;
  afterEach(() => setLocale('pt-BR'));

  // the stimulator step's controls belong to the Estimulador view (StimulatorView), checked there
  it.each(['physiology', 'simulation', 'results'] as const)('the %s step has no Portuguese text', (step) => {
    setLocale('en');
    const { container } = render(
      <Controlled muscles={muscles} serverErrors={[]} running={false} onSubmit={vi.fn()} step={step} onGoToStep={vi.fn()} />,
    );
    const text = container.textContent ?? '';
    const labels = Array.from(container.querySelectorAll('[aria-label],[title]'))
      .flatMap((el) => [el.getAttribute('aria-label') ?? '', el.getAttribute('title') ?? ''])
      .join(' ');
    expect(text + labels).not.toMatch(PT);
  });

  it('shows English labels, hints and buttons', () => {
    setLocale('en');
    setup({ step: 'simulation' });
    expect(screen.getByRole('group', { name: 'Simulation' })).toBeInTheDocument();
    expect(screen.getByLabelText(/Duration/)).toHaveValue('1000');
    expect(screen.getByLabelText(/Integration step/)).toHaveAttribute('title', 'Range: 0.005 – 0.1');
    expect(screen.getByRole('button', { name: 'Draw another seed' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Restore defaults' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Simulate' }).length).toBeGreaterThan(0);
  });

  it('the drive help, notice and switch are in English', async () => {
    setLocale('en');
    const show = vi.fn();
    const user = userEvent.setup();
    render(
      <HelpContext.Provider value={show}>
        <Controlled muscles={muscles} serverErrors={[]} running={false} onSubmit={vi.fn()} step="physiology" />
      </HelpContext.Provider>,
    );
    await user.click(screen.getByRole('switch', { name: /Turn on the central drive/ }));
    expect(screen.getByRole('note')).toHaveTextContent('near threshold they fire at 7–11 Hz');
    await user.click(screen.getByRole('button', { name: 'Help: Central drive' }));
    const [label, content] = show.mock.calls[0]!;
    expect(label).toBe('Central drive');
    render(<>{content}</>);
    expect(screen.getByText(/Current reaching the motoneurons/)).toBeInTheDocument();
  });

  it('client errors are given again in the new language after a language change', async () => {
    const { user } = setup({ step: 'simulation' });
    const duration = screen.getByLabelText(/Duração/);
    await user.clear(duration);
    await user.click(screen.getAllByRole('button', { name: 'Simular' })[0]!);
    expect(screen.getByText('obrigatório')).toBeInTheDocument();
    act(() => setLocale('en'));
    expect(screen.queryByText('obrigatório')).toBeNull();
    expect(screen.getByText('required')).toBeInTheDocument();
  });

  it('step labels and the step counter follow the language', () => {
    setLocale('en');
    expect(STEPS.map((s) => s.label)).toEqual(['Stimulator', 'Physiology', 'Simulation', 'Results']);
    expect(stepCounter(STEPS[1]!)).toBe('Step 2 of 4');
    setLocale('pt-BR');
    expect(STEPS[0]!.label).toBe('Estimulador');
    expect(stepCounter(STEPS[1]!)).toBe('Etapa 2 de 4');
  });
});
