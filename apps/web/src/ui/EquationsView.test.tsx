import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { defaultFormValues } from '../application/formModel';
import { buildModelSnapshot } from '../application/modelView';
import { defaultRequest } from '../domain/defaults';
import type { MusclePreset } from '../domain/simulation';
import { DiagramView } from './DiagramView';
import { EquationsView } from './EquationsView';
import { buildStageContents, texNum } from './stageTex';

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
    const values = { ...defaultFormValues('LITERATURE'), 'stimulus.dutyCyclePercent': '1.2' };
    const stages = buildStageContents(
      buildModelSnapshot({
        values,
        muscles: [soleus],
        lastRequest: defaultRequest('LITERATURE'),
        lastStarted: { type: 'started', simulationId: 'x', durationMs: 1000, outputStepMs: 0.1, motorUnits: { S: 106, FR: 7, FF: 7 }, muscle: 'SOLEUS' },
      }),
    );
    const tex = (id: string) => stages.find((s) => s.id === id)!.substituted.join(' ');
    expect(tex('1')).toContain('= 0{,}3\\ \\text{ms}');
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
});
