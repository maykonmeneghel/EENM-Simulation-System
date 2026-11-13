import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultFormValues } from '../application/formModel';
import { buildModelSnapshot } from '../application/modelView';
import { DiagramView, VERTICAL_WIDTH } from './DiagramView';
import { COMPACT_QUERY } from './useMediaQuery';

const draw = (stimulationSite: string, onSelectStage: (stage: string) => void = () => {}) =>
  render(
    <DiagramView
      snapshot={buildModelSnapshot({ values: { ...defaultFormValues(), stimulationSite }, muscles: [] })}
      running={false}
      onSelectStage={onSelectStage}
    />,
  );

/** A window whose width matches only the phone query (COMPACT_QUERY). */
function phoneWidth() {
  vi.stubGlobal(
    'matchMedia',
    (query: string) =>
      ({
        matches: query === COMPACT_QUERY,
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      }) as unknown as MediaQueryList,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const diagram = () => screen.getByRole('group', { name: 'Diagrama do modelo' });

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

  it('on a wide window the chain runs left → right', () => {
    draw('SKIN_SURFACE');
    expect(diagram()).toHaveAttribute('viewBox', '0 28 1100 222');
    expect(diagram()).not.toHaveClass('diagram-svg--vertical');
    expect(screen.getByText(/Clique num bloco/)).toBeInTheDocument();
  });

  describe('on a phone', () => {
    it('the chain runs top → bottom, one stage under the other, in the same order', () => {
      phoneWidth();
      draw('SKIN_SURFACE');
      const svg = diagram();
      expect(svg).toHaveClass('diagram-svg--vertical');
      const [x, y, w, h] = svg.getAttribute('viewBox')!.split(' ').map(Number);
      expect([x, y, w]).toEqual([0, 0, VERTICAL_WIDTH]);
      expect(h).toBeGreaterThan(4 * VERTICAL_WIDTH); // a tall column, not a squashed row

      const regions = [...svg.querySelectorAll<SVGGElement>('[data-region]')];
      expect(regions.map((g) => g.dataset.region)).toEqual(['stimulus', 'excitation', 'axon', 'fibres', 'twitch', 'force']);
      // each stage sits lower than the previous one
      const tops = regions.map((g) => Number(/translate\(\S+ (\S+)\)/.exec(g.getAttribute('transform')!)![1]));
      const regionY = [34, 34, 114, 34, 34, 114];
      const placedTops = tops.map((dy, i) => dy + regionY[i]!);
      for (let i = 1; i < placedTops.length; i++) expect(placedTops[i]).toBeGreaterThan(placedTops[i - 1]!);
      // an arrow joins each pair of consecutive stages
      expect(svg.querySelectorAll('.dg-link')).toHaveLength(regions.length - 1);
      expect(screen.getByText(/Toque num bloco/)).toBeInTheDocument();
    });

    it('keeps the stage blocks, their labels and the tap that opens the explanation', () => {
      phoneWidth();
      const onSelect = vi.fn();
      draw('MOTONEURON_POOL', onSelect);
      expect(screen.getByText('Motoneurônio')).toBeInTheDocument();
      const axon = screen.getByRole('button', { name: /Condução pelo axônio/ });
      fireEvent.click(axon);
      expect(onSelect).toHaveBeenCalledWith('3');
      fireEvent.keyDown(screen.getByRole('button', { name: /Fadiga periférica/ }), { key: 'Enter' });
      expect(onSelect).toHaveBeenLastCalledWith('7');
    });

    it('the small chips get a hit area tall enough to tap', () => {
      phoneWidth();
      draw('SKIN_SURFACE');
      for (const name of [/MUAP e EMG/, /Fadiga periférica/, /Saturação por frequência/]) {
        const hit = screen.getByRole('button', { name }).querySelector('.dg-hit');
        expect(hit).not.toBeNull();
        // ≥ 44 px on screen as long as the column is drawn at least VERTICAL_WIDTH px wide (styles.css caps it at 300)
        expect(Number(hit!.getAttribute('height'))).toBeGreaterThanOrEqual(44);
      }
    });
  });
});
