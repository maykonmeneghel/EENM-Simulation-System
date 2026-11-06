import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultFormValues } from '../application/formModel';
import { buildModelSnapshot } from '../application/modelView';
import { defaultRequest } from '../domain/defaults';
import type { MusclePreset } from '../domain/simulation';
import { DiagramView } from './DiagramView';
import { EquationsView } from './EquationsView';
import { buildStageContents, texNum } from './stageTex';
import { STAGE_EXPLANATIONS, STAGE_TITLES } from './stageExplanations';
import { setLocale } from '../i18n/locale';
import type { FormValues } from '../application/formModel';

const soleus: MusclePreset = { id: 'SOLEUS', label: 'Sóleo', poolSize: { S: 800, FR: 50, FF: 50 } };
const stageIds = (container: HTMLElement) =>
  Array.from(container.querySelectorAll('[data-stage]')).map((el) => el.getAttribute('data-stage'));

describe('EquationsView', () => {
  it('ORIGINAL shows stages 1, 2a, 3, 4, 5a, 8a', () => {
    const snapshot = buildModelSnapshot({ values: defaultFormValues('ORIGINAL'), muscles: [soleus] });
    const { container } = render(<EquationsView snapshot={snapshot} focus={null} />);
    expect(stageIds(container)).toEqual(['1', '2a', '3', '4', '5a', '8a']);
    expect(screen.getByRole('heading', { name: 'Motoneurônio (soma + dendrito)' })).toBeInTheDocument();
    expect(container.querySelectorAll('.katex').length).toBeGreaterThan(10);
    expect(container.querySelector('.katex-error')).toBeNull();
  });

  it('LITERATURE shows stages 1, 2b, 3, 4, 5b, 6, 7, 8b with the recruitment status', () => {
    const values = { ...defaultFormValues('LITERATURE'), 'stimulus.dutyCyclePercent': '1.2', 'stimulus.amplitude': '153' };
    const snapshot = buildModelSnapshot({ values, muscles: [soleus] });
    const { container } = render(<EquationsView snapshot={snapshot} focus={null} />);
    expect(stageIds(container)).toEqual(['1', '2b', '3', '4', '5b', '6', '7', '8b']);
    const card = container.querySelector<HTMLElement>('#stage-2b')!;
    expect(within(card).getByRole('status')).toHaveTextContent('A = 153 ≥ 102,1: todas as unidades recrutadas');
    expect(container.querySelector('.katex-error')).toBeNull();
  });

  it('partial / none recruitment texts', () => {
    const base = { ...defaultFormValues('LITERATURE'), 'stimulus.dutyCyclePercent': '1.2' };
    const partial = buildStageContents(buildModelSnapshot({ values: { ...base, 'stimulus.amplitude': '80' }, muscles: [] }));
    expect(partial.find((s) => s.id === '2b')?.status).toMatchObject({ tone: 'warn' });
    expect(partial.find((s) => s.id === '2b')?.status?.text).toMatch(/^56,9 ≤ A = 80 < 102,1: recrutamento parcial/);
    const none = buildStageContents(buildModelSnapshot({ values: { ...base, 'stimulus.amplitude': '40' }, muscles: [] }));
    expect(none.find((s) => s.id === '2b')?.status?.text).toBe('A = 40 < 56,9: nenhuma unidade recrutada');
  });

  it('substitutes the live values (PW, delays, weights)', () => {
    const values = defaultFormValues('LITERATURE');
    const stages = buildStageContents(
      buildModelSnapshot({
        values,
        muscles: [soleus],
        lastRequest: defaultRequest('LITERATURE'),
        lastStarted: { type: 'started', simulationId: 'x', durationMs: 1000, outputStepMs: 0.1, motorUnits: { S: 106, FR: 7, FF: 7 }, muscle: 'SOLEUS' },
      }),
    );
    const tex = (id: string) => stages.find((s) => s.id === id)!.substituted.join(' ');
    expect(tex('1')).toContain('PW = 300\\ \\mu\\text{s}');
    expect(tex('1')).toContain('T_p = \\frac{1000}{40} = 25\\ \\text{ms}');
    expect(tex('3')).toContain('18{,}18\\ \\text{ms}');
    expect(tex('3')).toContain('15{,}09\\ \\text{ms}');
    expect(tex('8b')).toContain('\\frac{800}{106}');
    expect(tex('8b')).toContain('w_{S} = 7{,}547');
    // per-type spans from the last started counts (106/7/7, slice centres)
    expect(tex('5b')).toContain('\\text{S}\\ (106)');
    expect(tex('7')).toContain('\\ln(P_k/0{,}103)');
    expect(tex('2b')).toContain('R = 1{,}7944');
  });

  it('2a shows both compartment currents', () => {
    const soma = buildStageContents(buildModelSnapshot({ values: defaultFormValues('ORIGINAL'), muscles: [soleus] }));
    expect(soma.find((s) => s.id === '2a')!.substituted.join(' ')).toContain('I_s = I(t),\\quad I_d = 0');
    const dend = buildStageContents(
      buildModelSnapshot({ values: { ...defaultFormValues('ORIGINAL'), injectionSite: 'DENDRITE' }, muscles: [soleus] }),
    );
    expect(dend.find((s) => s.id === '2a')!.substituted.join(' ')).toContain('I_d = I(t),\\quad I_s = 0');
  });

  it('5a shows P_k and T_k ranges for the simulated ORIGINAL units', () => {
    const st = buildStageContents(buildModelSnapshot({ values: defaultFormValues('ORIGINAL'), muscles: [soleus] }));
    const t = st.find((s) => s.id === '5a')!.substituted.join(' ');
    expect(t).toContain('\\text{S}\\ (5)');
    expect(t).toContain('T_k = 110 \\to 109{,}95');
  });

  it('8b says "automático" before any run', () => {
    const stages = buildStageContents(buildModelSnapshot({ values: defaultFormValues('LITERATURE'), muscles: [soleus] }));
    expect(stages.find((s) => s.id === '8b')!.substituted.join(' ')).toContain('\\text{automático}');
  });

  it('texNum uses a decimal comma and an em dash for NaN', () => {
    expect(texNum(0.04, 4)).toBe('0{,}04');
    expect(texNum(NaN)).toBe('\\text{—}');
  });
});

describe('DiagramView', () => {
  it('clicking or pressing Enter on a block selects its stage', async () => {
    const onSelect = vi.fn();
    const snapshot = buildModelSnapshot({ values: defaultFormValues('LITERATURE'), muscles: [soleus] });
    render(<DiagramView snapshot={snapshot} running={false} onSelectStage={onSelect} />);
    await userEvent.click(screen.getByRole('button', { name: /Pele e axônios motores/ }));
    expect(onSelect).toHaveBeenLastCalledWith('2b');
    screen.getByRole('button', { name: /Fadiga periférica/ }).focus();
    await userEvent.keyboard('{Enter}');
    expect(onSelect).toHaveBeenLastCalledWith('7');
  });

  it('ORIGINAL draws the motoneuron and no fatigue badge', () => {
    const snapshot = buildModelSnapshot({ values: defaultFormValues('ORIGINAL'), muscles: [soleus] });
    render(<DiagramView snapshot={snapshot} running={false} onSelectStage={() => undefined} />);
    expect(screen.getByRole('button', { name: /Motoneurônio — ver equação 2a/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Fadiga/ })).not.toBeInTheDocument();
    expect(screen.getByText('injeção no soma')).toBeInTheDocument();
  });

  it('LITERATURE diagram shows the 56.9 … 102.1 threshold at PW = 0.3 ms', () => {
    const values = { ...defaultFormValues('LITERATURE'), 'stimulus.dutyCyclePercent': '1.2', 'stimulus.amplitude': '153' };
    const snapshot = buildModelSnapshot({ values, muscles: [soleus] });
    render(<DiagramView snapshot={snapshot} running={false} onSelectStage={() => undefined} />);
    expect(screen.getByText('limiar 56,9 … 102,1')).toBeInTheDocument();
    expect(screen.getByText('100 % recrutados')).toBeInTheDocument();
  });

  it('each stage explains the equation in words and links its sources (Google Scholar and DOI)', () => {
    render(<EquationsView snapshot={buildModelSnapshot({ values: defaultFormValues(), muscles: [soleus] })} focus={null} />);
    const fatigue = document.querySelector('[data-stage="7"]') as HTMLElement;
    expect(fatigue).toHaveTextContent('Em palavras');
    expect(fatigue).toHaveTextContent('Cada disparo consome um pouco da capacidade de força');
    const scholar = Array.from(fatigue.querySelectorAll('a')).map((a) => a.getAttribute('href'));
    expect(scholar).toContain('https://doi.org/10.1371/journal.pcbi.1005581');
    expect(scholar.some((h) => h?.startsWith('https://scholar.google.com/scholar?q=%22A%20motor%20unit-based'))).toBe(true);
    const muap = document.querySelector('[data-stage="4"]') as HTMLElement;
    expect(muap).toHaveTextContent('Do modelo original, sem fonte publicada');
  });
});

describe('equations in English', () => {
  afterEach(() => setLocale('pt-BR'));

  const PORTUGUESE = /[ãõçáéíóúâêôàÃÕÇÁÉÍÓÚÂÊÔ]|\b(de|da|dos|das|com|para|não|em|unidades|quando|caso)\b/;
  const lit = defaultFormValues();
  const configurations: FormValues[] = [
    lit,
    { ...defaultFormValues('ORIGINAL') },
    { ...defaultFormValues('ORIGINAL'), 'stimulus.modulation.target': 'FREQUENCY' },
    { ...defaultFormValues('ORIGINAL'), 'stimulus.waveform': 'MONOPHASIC', trainsEnabled: true, 'stimulus.trainOnMs': '330', 'stimulus.trainOffMs': '670' },
    { ...lit, trainsEnabled: true, 'stimulus.trainOnMs': '330', 'stimulus.trainOffMs': '670', 'stimulus.amplitude': '70' },
    { ...lit, 'stimulus.amplitude': '10', 'stimulus.waveform': 'MONOPHASIC' },
    { ...lit, stimulationSite: 'MOTONEURON_POOL' },
    { ...lit, driveEnabled: true },
    { ...lit, driveEnabled: true, stimulationSite: 'MOTONEURON_POOL', 'centralDrive.thresholdRule': 'WATANABE_2013', 'centralDrive.currentScale': 'RHEOBASE' },
    { ...lit, condition: 'PARKINSON', conditionAdjustments: ['PD_MOTOR_UNIT_LOSS', 'PD_NEUROPATHY', 'PD_TREMOR'] },
    { ...lit, condition: 'SCI_CHRONIC', conditionAdjustments: ['SCI_FATIGABILITY', 'SCI_FAST_TWITCH', 'SCI_ATROPHY', 'SCI_CHRONAXIE'] },
    { ...lit, manualUnits: true, 'unitsPerType.S': '10', 'unitsPerType.FR': '5', 'unitsPerType.FF': '5', calibrationTarget: 'SINGLE_UNIT' },
  ];

  const texts = (values: FormValues, muscles: MusclePreset[]) =>
    buildStageContents(buildModelSnapshot({ values, muscles })).flatMap((st) => [
      st.title,
      ...st.symbolic,
      ...st.substituted,
      ...st.notes,
      ...(st.condition ?? []),
      ...(st.status ? [st.status.text] : []),
    ]);

  it('every stage text of every mode has no Portuguese and uses decimal points', () => {
    setLocale('en');
    for (const values of configurations) {
      for (const muscles of [[soleus], []]) {
        for (const t of texts(values, muscles)) {
          expect(t, t).not.toMatch(PORTUGUESE);
          expect(t, t).not.toContain('{,}');
          expect(t, t).not.toMatch(/\d,\d/);
        }
      }
    }
    // a value the user set shows with a point: 0.3 ms pulse, 0.459 ms in the Weiss law
    const weiss = buildStageContents(buildModelSnapshot({ values: lit, muscles: [soleus] })).find((st) => st.id === '2b')!;
    expect(weiss.symbolic.join(' ')).toContain('0.459');
  });

  it('the plain explanations, sources and titles are in English', () => {
    setLocale('en');
    for (const [id, ex] of Object.entries(STAGE_EXPLANATIONS)) {
      for (const t of [ex.plain, ex.inherited ?? '', ...ex.refs.map((r) => r.supports), STAGE_TITLES[id as keyof typeof STAGE_TITLES]]) {
        expect(t, t).not.toMatch(PORTUGUESE);
      }
    }
    expect(STAGE_TITLES['7']).toBe('Peripheral fatigue');
    setLocale('pt-BR');
    expect(STAGE_TITLES['7']).toBe('Fadiga periférica');
  });

  it('the equations view switches its labels and rebuilds the equations', () => {
    setLocale('en');
    render(<EquationsView snapshot={buildModelSnapshot({ values: lit, muscles: [soleus] })} focus={null} onInspect={vi.fn()} />);
    const fatigue = document.querySelector('[data-stage="7"]') as HTMLElement;
    expect(fatigue).toHaveTextContent('In words');
    expect(fatigue).toHaveTextContent('With the current values');
    expect(fatigue).toHaveTextContent('Sources');
    expect(fatigue).toHaveTextContent('Peripheral fatigue');
    expect(screen.getByText(/Model corrected by the literature/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Stage 7 — show explanation' })).toBeInTheDocument();
    expect(document.querySelector('[data-stage="4"]')).toHaveTextContent('From the original model, with no published source');
  });
});
