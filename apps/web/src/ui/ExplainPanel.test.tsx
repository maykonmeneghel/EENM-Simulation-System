import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { FormValues } from '../application/formModel';
import { defaultFormValues, driveActive, inactiveFields, parseForm, tremorActive } from '../application/formModel';
import { signalPath } from '../application/signalPath';
import { ExplainPanel } from './ExplainPanel';

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

describe('ExplainPanel', () => {
  it('describes the signal path of each mode', () => {
    expect(signalPath(base).join(' ')).toMatch(/motoneurônio não é simulado/);
    expect(signalPath({ ...base, stimulationSite: 'MOTONEURON_POOL' }).join(' ')).toMatch(/direto no soma/);
    const merged = signalPath(parkinsonTremor(base)).join(' ');
    expect(merged).toMatch(/4,4 Hz \(tremor\)/);
    expect(merged).toMatch(/colide/);
  });

  it('shows the live axon counts, the sources with links and the known limits in the non-invasive drive mode', () => {
    render(
      <ExplainPanel
        values={parkinsonTremor(base)}
        axonEvents={{ central: 1200, centralTransmitted: 300, fesTransmitted: 900, collisions: 850, fesBlocked: 4, resets: 40 }}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Modo não invasivo' })).toBeInTheDocument();
    const axon = screen.getByRole('heading', { name: 'Encontro no axônio' }).closest('section')!;
    expect(within(axon).getByText('1.200')).toBeInTheDocument();
    expect(within(axon).getByText('850')).toBeInTheDocument();
    expect(within(axon).getByRole('link', { name: 'doi:10.1038/s41593-018-0262-6' })).toHaveAttribute(
      'href',
      'https://doi.org/10.1038/s41593-018-0262-6',
    );
    expect(screen.getByRole('heading', { name: 'Limites conhecidos' })).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Google Scholar' }).length).toBeGreaterThan(3);
  });

  it('without a drive it shows only the path and the model stages', () => {
    render(<ExplainPanel values={base} axonEvents={null} />);
    expect(screen.queryByRole('heading', { name: 'Encontro no axônio' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Limites conhecidos' })).toBeNull();
    expect(screen.getByRole('heading', { name: 'Etapas do modelo' })).toBeInTheDocument();
  });
});
