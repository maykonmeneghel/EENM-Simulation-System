import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { FormValues } from '../application/formModel';
import { defaultFormValues, driveActive, inactiveFields, parseForm, tremorActive } from '../application/formModel';
import { signalPath } from '../application/signalPath';
import { buildModelSnapshot } from '../application/modelView';
import { setLocale } from '../i18n/locale';
import { InspectorPanel } from './InspectorPanel';
import { STAGE_EXPLANATIONS } from './stageExplanations';
import { stageSymbols, symbolContext } from './stageSymbols';
import { nextStep, stepOfField } from './steps';

const base = defaultFormValues();
const parkinsonTremor = (v: FormValues): FormValues => ({ ...v, condition: 'PARKINSON', conditionAdjustments: ['PD_TREMOR'] });

describe('central drive in the form', () => {
  it('is off by default and sends no drive', () => {
    expect(driveActive(base)).toBe(false);
    const parsed = parseForm(base);
    expect(parsed.ok && parsed.request.centralDrive).toBeUndefined();
    expect(inactiveFields(base).has('centralDrive.voluntaryNa')).toBe(true);
  });

  it('turns on with the switch; the tremor fields stay off outside Parkinson + PD_TREMOR', () => {
    const on = { ...base, driveEnabled: true, 'centralDrive.voluntaryNa': '5' };
    const parsed = parseForm(on);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.request.centralDrive).toMatchObject({ enabled: true, voluntaryNa: 5, backgroundNa: 3.5 });
    expect(inactiveFields(on).has('centralDrive.tremor.frequencyHz')).toBe(true);
    expect(inactiveFields(on).has('centralDrive.voluntaryNa')).toBe(false);
  });

  it('the Parkinson tremor turns the drive on by itself and activates its fields (Cisi & Kohn, not Booth, settings)', () => {
    const pd = parkinsonTremor({ ...base, 'centralDrive.tremor.frequencyHz': '5.9' });
    expect(tremorActive(pd) && driveActive(pd)).toBe(true);
    const inactive = inactiveFields(pd);
    expect(inactive.has('centralDrive.tremor.frequencyHz')).toBe(false);
    expect(inactive.has('centralDrive.thresholdRule')).toBe(false);
    expect(inactive.has('temperatureCelsius')).toBe(true); // Booth 1997 settings do not apply to the drive's motoneurons
    const parsed = parseForm(pd);
    expect(parsed.ok && parsed.request.centralDrive).toMatchObject({ enabled: false, tremor: { frequencyHz: 5.9 } });
  });

  it('the electrode position matters only in the non-invasive mode', () => {
    const invasive = { ...base, driveEnabled: true, stimulationSite: 'MOTONEURON_POOL' };
    expect(inactiveFields(invasive).has('centralDrive.electrodeFraction')).toBe(true);
    expect(inactiveFields({ ...invasive, stimulationSite: 'SKIN_SURFACE' }).has('centralDrive.electrodeFraction')).toBe(false);
  });
});

describe('InspectorPanel', () => {
  it('describes the signal path of each mode', () => {
    expect(signalPath(base).join(' ')).toMatch(/motoneurônio não é simulado/);
    expect(signalPath({ ...base, stimulationSite: 'MOTONEURON_POOL' }).join(' ')).toMatch(/direto no soma/);
    const merged = signalPath(parkinsonTremor(base)).join(' ');
    expect(merged).toMatch(/4,4 Hz \(tremor\)/);
    expect(merged).toMatch(/colide/);
  });

  it('waits for a click: with no topic it only invites one', () => {
    render(<InspectorPanel topic={null} values={base} axonEvents={null} />);
    expect(screen.getByText(/Clique num componente/)).toBeInTheDocument();
    expect(screen.queryAllByRole('link')).toHaveLength(0);
  });

  it('the force chart shows its stages, the path, the live axon counts, the sources and the limits', () => {
    render(
      <InspectorPanel
        topic={{ kind: 'chart', chart: 'force' }}
        values={parkinsonTremor(base)}
        axonEvents={{ central: 1200, centralTransmitted: 300, fesTransmitted: 900, collisions: 850, fesBlocked: 4, resets: 40 }}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Força muscular' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Caminho do sinal' })).toBeInTheDocument();
    const axon = screen.getByRole('heading', { name: 'Encontro no axônio' }).closest('section')!;
    expect(within(axon).getByText('1.200')).toBeInTheDocument();
    expect(within(axon).getByRole('link', { name: 'doi:10.1038/s41593-018-0262-6' })).toHaveAttribute(
      'href',
      'https://doi.org/10.1038/s41593-018-0262-6',
    );
    expect(screen.getByRole('heading', { name: 'Validação e limites' })).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Google Scholar' }).length).toBeGreaterThan(3);
  });

  it('a stage topic explains only that stage and links to its equation', async () => {
    const shown: string[] = [];
    render(
      <InspectorPanel topic={{ kind: 'stage', stage: '2b' }} values={base} axonEvents={null} onShowEquation={(s) => shown.push(s)} />,
    );
    expect(screen.getByRole('heading', { name: /Etapa 2b · Axônio motor/ })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Caminho do sinal' })).toBeNull();
    screen.getByRole('button', { name: 'Ver a equação' }).click();
    expect(shown).toEqual(['2b']);
  });

  it('opened from the equation card, a stage explains its symbols instead of repeating the card', () => {
    const { container } = render(<InspectorPanel topic={{ kind: 'stage', stage: '5b', from: 'equations' }} values={base} axonEvents={null} onShowEquation={() => {}} />);
    const glossary = screen.getByRole('group', { name: 'O que cada símbolo significa' });
    // the card shows "Em palavras" and the sources: neither is repeated here
    expect(screen.queryByText(STAGE_EXPLANATIONS['5b'].plain)).toBeNull();
    expect(screen.queryAllByRole('link', { name: 'Google Scholar' })).toHaveLength(0);
    const terms = within(glossary).getAllByRole('term');
    expect(terms.length).toBe(stageSymbols('5b', symbolContext(buildModelSnapshot({ values: base, muscles: [] }))).length);
    expect(glossary).toHaveTextContent(/Tempo de contração: do disparo ao pico do abalo/);
    expect(glossary).toHaveTextContent(/Calibração do twitch/);
    expect(glossary).toHaveTextContent(/O índice k numera as unidades motoras/);
    expect(container.querySelector('.katex-error')).toBeNull();
    expect(screen.getByRole('button', { name: 'Ver a equação' })).toBeInTheDocument();
  });

  it('opened from a diagram block (no text on screen), a stage keeps its plain explanation and sources and adds the symbols', () => {
    render(<InspectorPanel topic={{ kind: 'stage', stage: '2b', from: 'diagram' }} values={base} axonEvents={null} />);
    expect(screen.getByText(STAGE_EXPLANATIONS['2b'].plain)).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Google Scholar' }).length).toBeGreaterThan(0);
    expect(within(screen.getByRole('group', { name: 'O que cada símbolo significa' })).getByText(/Reobase do axônio k/)).toBeInTheDocument();
  });

  it('charts and scopes keep the plain explanation and sources, without a glossary', () => {
    render(<InspectorPanel topic={{ kind: 'scope', scope: 'pulse' }} values={base} axonEvents={null} />);
    expect(screen.getByText(STAGE_EXPLANATIONS['1'].plain)).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'O que cada símbolo significa' })).toBeNull();
  });

  it('the glossary follows the settings and the language', () => {
    const { unmount } = render(<InspectorPanel topic={{ kind: 'stage', stage: '1', from: 'equations' }} values={base} axonEvents={null} />);
    const pt = screen.getByRole('group', { name: 'O que cada símbolo significa' });
    expect(pt).toHaveTextContent(/Rampa de subida/);
    expect(pt).not.toHaveTextContent(/Ciclo de trabalho/);
    unmount();
    setLocale('en');
    try {
      render(<InspectorPanel topic={{ kind: 'stage', stage: '1', from: 'equations' }} values={defaultFormValues('ORIGINAL')} axonEvents={null} />);
      const en = screen.getByRole('group', { name: 'What each symbol means' });
      expect(en).toHaveTextContent(/Duty cycle/);
      expect(en).not.toHaveTextContent(/Ramp up/);
    } finally {
      setLocale('pt-BR');
    }
  });
});

describe('steps', () => {
  it('every field belongs to the step where it is set', () => {
    expect(stepOfField('stimulationSite')).toBe('stimulator');
    expect(stepOfField('stimulus.frequencyHz')).toBe('stimulator');
    expect(stepOfField('stimulus.durationMs')).toBe('simulation');
    expect(stepOfField('outputStepMs')).toBe('simulation');
    expect(stepOfField('centralDrive.voluntaryNa')).toBe('physiology');
    expect(stepOfField('muscle')).toBe('physiology');
    expect(nextStep('stimulator')?.id).toBe('physiology');
    expect(nextStep('results')?.id).toBe('anatomy');
    expect(nextStep('anatomy')?.id).toBe('compare');
    expect(nextStep('compare')).toBeNull();
  });
});

describe('chart readings', () => {
  it('each results chart explains what it plots', () => {
    for (const chart of ['force', 'stimulus', 'emg'] as const) {
      const { unmount } = render(<InspectorPanel topic={{ kind: 'chart', chart }} values={base} axonEvents={null} />);
      const reading = screen.getByRole('heading', { name: 'O que o gráfico mostra' }).closest('section')!;
      expect(reading.textContent!.length).toBeGreaterThan(120);
      unmount();
    }
    render(<InspectorPanel topic={{ kind: 'fatigue' }} values={base} axonEvents={null} />);
    expect(screen.getByText(/Mostra a capacidade de força que resta/)).toBeInTheDocument();
  });
  it('a "?" help shows its title and text', () => {
    render(<InspectorPanel topic={{ kind: 'help', label: 'Drive central', content: <>Corrente do sistema nervoso central</> }} values={base} axonEvents={null} />);
    expect(screen.getByRole('heading', { name: 'Drive central' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Ajuda: Drive central' })).toHaveTextContent('Corrente do sistema nervoso central');
  });
});
