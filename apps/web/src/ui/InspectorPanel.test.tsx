import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { FormValues } from '../application/formModel';
import { defaultFormValues, driveActive, inactiveFields, parseForm, tremorActive } from '../application/formModel';
import { signalPath } from '../application/signalPath';
import { InspectorPanel } from './InspectorPanel';
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

  it('the Parkinson tremor turns the drive on by itself and activates its fields and the motoneuron group', () => {
    const pd = parkinsonTremor({ ...base, 'centralDrive.tremor.frequencyHz': '5.9' });
    expect(tremorActive(pd) && driveActive(pd)).toBe(true);
    const inactive = inactiveFields(pd);
    expect(inactive.has('centralDrive.tremor.frequencyHz')).toBe(false);
    expect(inactive.has('temperatureCelsius')).toBe(false); // the motoneurons are simulated
    expect(inactive.has('injectionSite')).toBe(true); // ... but the drive always enters the soma here
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
    expect(screen.getByRole('heading', { name: 'Limites conhecidos' })).toBeInTheDocument();
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
    expect(nextStep('results')).toBeNull();
  });
});
