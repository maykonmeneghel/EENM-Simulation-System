import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { twitchCalibration, twitchShape, TWITCH_CALIBRATION } from '../domain/modelEquations';
import type { MusclePreset } from '../domain/simulation';
import { MuscleSources } from './MuscleSources';

const FCR: MusclePreset = {
  id: 'FLEXOR_CARPI_RADIALIS',
  label: 'Flexor Carpi Radialis (FCR)',
  poolSize: { S: 368, FR: 267, FF: 265 },
  provenance: [
    {
      field: 'Composição S / FR / FF',
      provenance: 'MEASURED',
      value: '368 / 267 / 265',
      source: { citation: 'Mizuno et al. 1994', title: 'Fibre title', doi: '10.1152/jappl.1994.76.2.531', pmid: null },
      evidence: 'FULL_TEXT',
      calibrationTarget: null,
    },
    {
      field: 'Tempo do abalo',
      provenance: 'FITTED',
      value: 'CT 67,3 ms',
      source: { citation: 'Behrens et al. 2019', title: 'Wrist title', doi: '10.3389/fbioe.2019.00181', pmid: null },
      evidence: 'FULL_TEXT',
      calibrationTarget: 'WHOLE_MUSCLE',
    },
    {
      field: 'Tempo do abalo',
      provenance: 'INHERITED',
      value: 'ajuste do sóleo',
      source: null,
      evidence: null,
      calibrationTarget: 'SINGLE_UNIT',
    },
  ],
};

describe('MuscleSources', () => {
  it('shows each field with its provenance and only the twitch source of the chosen calibration', () => {
    render(<MuscleSources preset={FCR} calibrationTarget="WHOLE_MUSCLE" />);
    const list = screen.getByRole('list', { name: /Origem dos valores de Flexor Carpi Radialis/ });
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(within(items[0]!).getByText('medido')).toBeInTheDocument();
    expect(within(items[1]!).getByText('ajustado')).toBeInTheDocument();
    expect(within(items[1]!).getByRole('link', { name: 'doi:10.3389/fbioe.2019.00181' })).toHaveAttribute(
      'href',
      'https://doi.org/10.3389/fbioe.2019.00181',
    );
    expect(within(items[1]!).getByRole('link', { name: 'Google Scholar' })).toHaveAttribute(
      'href',
      expect.stringContaining('scholar.google.com'),
    );
  });

  it('marks inherited values and gives them no source link', () => {
    render(<MuscleSources preset={FCR} calibrationTarget="SINGLE_UNIT" />);
    const items = within(screen.getByRole('list')).getAllByRole('listitem');
    const inherited = items[1]!;
    expect(within(inherited).getByText('herdado')).toBeInTheDocument();
    expect(within(inherited).queryByRole('link')).toBeNull();
  });

  it('renders nothing for the leg presets (no provenance) or an older server', () => {
    const soleus: MusclePreset = { id: 'SOLEUS', label: 'Soleus', poolSize: { S: 800, FR: 50, FF: 50 }, provenance: [] };
    const { container } = render(<MuscleSources preset={soleus} calibrationTarget="WHOLE_MUSCLE" />);
    expect(container).toBeEmptyDOMElement();
    const { container: old } = render(
      <MuscleSources preset={{ id: 'SOLEUS', label: 'Soleus', poolSize: { S: 800, FR: 50, FF: 50 } }} calibrationTarget="WHOLE_MUSCLE" />,
    );
    expect(old).toBeEmptyDOMElement();
  });
});

describe('wrist twitch calibration (muscle_profiles.py)', () => {
  it('uses the wrist muscles own fits where they exist and the soleus fit otherwise', () => {
    expect(twitchShape('LITERATURE', 'WHOLE_MUSCLE', 'FLEXOR_CARPI_RADIALIS')).toEqual({ m: 3.6741, timeScale: 0.9524 });
    expect(twitchShape('LITERATURE', 'SINGLE_UNIT', 'EXTENSOR_CARPI_RADIALIS')).toEqual({ m: 2.0862, timeScale: 0.50605 });
    expect(twitchCalibration('SINGLE_UNIT', 'FLEXOR_CARPI_RADIALIS')).toBe(TWITCH_CALIBRATION.SINGLE_UNIT);
    expect(twitchCalibration('WHOLE_MUSCLE', 'EXTENSOR_CARPI_RADIALIS')).toBe(TWITCH_CALIBRATION.WHOLE_MUSCLE);
    expect(twitchShape('ORIGINAL', 'WHOLE_MUSCLE', 'FLEXOR_CARPI_RADIALIS')).toEqual({ m: 1, timeScale: 1 });
  });
});
