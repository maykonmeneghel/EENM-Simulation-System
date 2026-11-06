import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { defaultFormValues } from '../application/formModel';
import { buildModelSnapshot } from '../application/modelView';
import { DiagramView } from './DiagramView';

const draw = (stimulationSite: string) =>
  render(
    <DiagramView
      snapshot={buildModelSnapshot({ values: { ...defaultFormValues(), stimulationSite }, muscles: [] })}
      running={false}
      onSelectStage={() => {}}
    />,
  );

describe('DiagramView', () => {
  it('shows the skin and axons in the non-invasive mode', () => {
    draw('SKIN_SURFACE');
    expect(screen.getByText('Pele + axônios motores')).toBeInTheDocument();
    expect(screen.queryByText('Motoneurônio')).toBeNull();
  });
  it('shows the motoneuron in the invasive mode', () => {
    draw('MOTONEURON_POOL');
    expect(screen.getByText('Motoneurônio')).toBeInTheDocument();
    expect(screen.queryByText('Pele + axônios motores')).toBeNull();
  });
});
