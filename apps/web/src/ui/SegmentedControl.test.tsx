import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { SegmentedControl } from './SegmentedControl';

const OPTIONS = [
  { value: 'a', label: 'Simulação' },
  { value: 'b', label: 'Equações' },
  { value: 'c', label: 'Diagrama' },
] as const;
type V = (typeof OPTIONS)[number]['value'];

function Harness({ mode, onChange }: { mode: 'tabs' | 'radio'; onChange?: (v: V) => void }) {
  const [v, setV] = useState<V>('a');
  return (
    <SegmentedControl<V>
      options={OPTIONS}
      value={v}
      label="Vista"
      mode={mode}
      panelId={(x) => `panel-${x}`}
      onChange={(x) => {
        setV(x);
        onChange?.(x);
      }}
    />
  );
}

describe('SegmentedControl', () => {
  it('tabs mode exposes tablist/tab with aria-selected and aria-controls', () => {
    render(<Harness mode="tabs" />);
    expect(screen.getByRole('tablist', { name: 'Vista' })).toBeInTheDocument();
    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(3);
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
    expect(tabs[1]).toHaveAttribute('aria-selected', 'false');
    expect(tabs[1]).toHaveAttribute('aria-controls', 'panel-b');
    // roving tabindex
    expect(tabs.map((t) => t.tabIndex)).toEqual([0, -1, -1]);
  });

  it('click selects', async () => {
    const onChange = vi.fn();
    render(<Harness mode="tabs" onChange={onChange} />);
    await userEvent.click(screen.getByRole('tab', { name: 'Diagrama' }));
    expect(onChange).toHaveBeenCalledWith('c');
    expect(screen.getByRole('tab', { name: 'Diagrama' })).toHaveAttribute('aria-selected', 'true');
  });

  it('arrow keys, Home and End move selection and focus (wrapping)', async () => {
    const user = userEvent.setup();
    render(<Harness mode="tabs" />);
    await user.tab();
    expect(screen.getByRole('tab', { name: 'Simulação' })).toHaveFocus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Equações' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Equações' })).toHaveFocus();
    await user.keyboard('{End}');
    expect(screen.getByRole('tab', { name: 'Diagrama' })).toHaveFocus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Simulação' })).toHaveAttribute('aria-selected', 'true');
    await user.keyboard('{ArrowLeft}');
    expect(screen.getByRole('tab', { name: 'Diagrama' })).toHaveAttribute('aria-selected', 'true');
    await user.keyboard('{Home}');
    expect(screen.getByRole('tab', { name: 'Simulação' })).toHaveAttribute('aria-selected', 'true');
  });

  it('radio mode exposes radiogroup/radio with aria-checked', async () => {
    render(<Harness mode="radio" />);
    expect(screen.getByRole('radiogroup', { name: 'Vista' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Simulação' })).toHaveAttribute('aria-checked', 'true');
    await userEvent.click(screen.getByRole('radio', { name: 'Equações' }));
    expect(screen.getByRole('radio', { name: 'Equações' })).toHaveAttribute('aria-checked', 'true');
  });
});
