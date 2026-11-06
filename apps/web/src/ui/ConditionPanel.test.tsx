import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect, useState } from 'react';
import { describe, expect, it } from 'vitest';
import type { FormValues } from '../application/formModel';
import { changeCondition, defaultFormValues, parseForm, toggleAdjustment } from '../application/formModel';
import type { ConditionInfo } from '../domain/simulation';
import { ConditionPanel } from './ConditionPanel';

const adj = (id: string, extra: Partial<ConditionInfo['adjustments'][number]> = {}) => ({
  id,
  label: id,
  effect: `efeito ${id}`,
  finding: `achado ${id}`,
  source: { citation: `Autor ${id}`, title: `Title ${id}`, doi: `10.1/${id}`, pmid: null },
  evidence: 'FULL_TEXT' as const,
  measuredIn: 'sóleo',
  default: false,
  available: true,
  ...extra,
});
const CATALOG: ConditionInfo[] = [
  { id: 'NORMAL', label: 'Normal', adjustments: [] },
  {
    id: 'SCI_CHRONIC',
    label: 'Lesão medular crônica',
    adjustments: [adj('SCI_FATIGABILITY', { default: true }), adj('SCI_ATROPHY', { evidence: 'ABSTRACT', measuredIn: 'coxa (outro músculo)' })],
  },
  {
    id: 'PARKINSON',
    label: 'Doença de Parkinson',
    adjustments: [adj('PD_MOTOR_UNIT_LOSS', { default: true }), adj('PD_TREMOR', { available: false, source: { citation: 'Zach 2015', title: 'T', doi: null, pmid: '1' } })],
  },
];

const seen: { values: FormValues | null } = { values: null };
function Controlled() {
  const [values, setValues] = useState<FormValues>(() => defaultFormValues());
  useEffect(() => {
    seen.values = values;
  }, [values]);
  return <ConditionPanel values={values} onChange={setValues} conditions={CATALOG} error={null} disabled={false} />;
}
const request = () => {
  const r = parseForm(seen.values!);
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  return r.request;
};

describe('condition (form model)', () => {
  it('choosing a condition makes its defaults the explicit choice; toggling keeps the catalog order', () => {
    const sci = changeCondition(defaultFormValues(), 'SCI_CHRONIC', CATALOG);
    expect(sci.conditionAdjustments).toEqual(['SCI_FATIGABILITY']);
    const both = toggleAdjustment(sci, 'SCI_ATROPHY', true, CATALOG);
    expect(both.conditionAdjustments).toEqual(['SCI_FATIGABILITY', 'SCI_ATROPHY']);
    expect(toggleAdjustment(both, 'SCI_FATIGABILITY', false, CATALOG).conditionAdjustments).toEqual(['SCI_ATROPHY']);
    // without a catalog the engine decides the defaults: nothing explicit is sent
    const offline = parseForm(changeCondition(defaultFormValues(), 'PARKINSON', []));
    expect(offline.ok && offline.request).toMatchObject({ condition: 'PARKINSON' });
    expect(offline.ok && 'conditionAdjustments' in offline.request).toBe(false);
  });
});

describe('ConditionPanel', () => {
  it('lists the adjustments of the chosen condition with evidence badges and source links, and sends the choice', async () => {
    const user = userEvent.setup();
    render(<Controlled />);
    expect(request().condition).toBe('NORMAL');
    await user.selectOptions(screen.getByLabelText('Condição'), 'SCI_CHRONIC');
    const list = screen.getByRole('list', { name: 'Ajustes de Lesão medular crônica' });
    expect(within(list).getByRole('switch', { name: /SCI_FATIGABILITY/ })).toBeChecked();
    expect(within(list).getByRole('switch', { name: /SCI_ATROPHY/ })).not.toBeChecked();
    expect(within(list).getByText('só resumo')).toBeInTheDocument();
    expect(within(list).getByText('outro músculo')).toBeInTheDocument();
    const links = within(list).getAllByRole('link').map((a) => a.getAttribute('href'));
    expect(links).toContain('https://doi.org/10.1/SCI_ATROPHY');
    expect(links).toContain(`https://scholar.google.com/scholar?q=${encodeURIComponent('"Title SCI_ATROPHY"')}`);
    await user.click(within(list).getByRole('switch', { name: /SCI_ATROPHY/ }));
    expect(request()).toMatchObject({ condition: 'SCI_CHRONIC', conditionAdjustments: ['SCI_FATIGABILITY', 'SCI_ATROPHY'] });
  });

  it('an adjustment that needs the central layer cannot be switched on', async () => {
    const user = userEvent.setup();
    render(<Controlled />);
    await user.selectOptions(screen.getByLabelText('Condição'), 'PARKINSON');
    expect(screen.getByRole('switch', { name: /PD_TREMOR/ })).toBeDisabled();
    expect(screen.getByRole('link', { name: 'PubMed 1' })).toHaveAttribute('href', 'https://pubmed.ncbi.nlm.nih.gov/1/');
    expect(request().conditionAdjustments).toEqual(['PD_MOTOR_UNIT_LOSS']);
  });
});
