import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SimulationController } from '../application/simulationController';
import type { ConditionInfo, MusclePreset } from '../domain/simulation';
import { getLocale, setLocale } from '../i18n/locale';
import type { ApiClient } from '../infrastructure/apiClient';

// jsdom has no matchMedia (uPlot reads it when loaded) and no canvas: the charts are not under test here
vi.hoisted(() => {
  window.matchMedia ??= ((query: string) =>
    ({ matches: false, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }) as unknown as MediaQueryList);
});
vi.mock('./LiveCharts', () => ({ LiveCharts: () => null }));

import { App } from './App';

/** Letters and words that only Portuguese text has (the app's English must have none). */
const PORTUGUESE = /[ãõçáéíóúâêôàº]|\b(não|são|está|então|para|pela|pelo|com os|dos|das)\b/i;

const MUSCLES: MusclePreset[] = [{ id: 'SOLEUS', label: 'Soleus', poolSize: { S: 800, FR: 50, FF: 50 } }];
const CONDITIONS: ConditionInfo[] = [{ id: 'NORMAL', label: 'Normal', adjustments: [] }];

function fakeApi(): ApiClient & { locales: (string | undefined)[] } {
  const locales: (string | undefined)[] = [];
  return {
    locales,
    getMuscles: async (_s, locale) => (locales.push(locale), MUSCLES),
    getConditions: async (_s, locale) => (locales.push(locale), CONDITIONS),
    // eslint-disable-next-line require-yield
    async *streamSimulation() {
      return;
    },
  };
}

/** Visible text plus accessible names and tooltips, without bibliographic data (authors, titles, journals) and the
 * language selector. */
function shownText(root: HTMLElement): string {
  const clone = root.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('.stage-ref-cite, .explain-ref-cite, .katex-mathml').forEach((n) => n.remove());
  // each language is named in its own language in the selector ("Português (Brasil)")
  clone.querySelector('[role="radiogroup"][aria-label="Language"]')?.remove();
  const attrs = Array.from(clone.querySelectorAll('[aria-label], [title], [placeholder]')).flatMap((el) =>
    ['aria-label', 'title', 'placeholder'].map((a) => el.getAttribute(a) ?? ''),
  );
  return [clone.textContent ?? '', ...attrs].join('\n');
}

function portugueseIn(text: string): string[] {
  return text.split('\n').flatMap((line) => line.split(/(?<=[.;:])\s/)).filter((s) => PORTUGUESE.test(s));
}

describe('the whole app in English', () => {
  afterEach(() => setLocale('pt-BR'));

  it('switching to EN in the toolbar leaves no Portuguese in any step, help or explanation', async () => {
    const api = fakeApi();
    const user = userEvent.setup();
    const { container } = render(<App api={api} controller={new SimulationController(api)} />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Simulador EENM');

    await user.click(within(screen.getByRole('radiogroup', { name: 'Idioma' })).getByRole('radio', { name: 'EN' }));
    expect(getLocale()).toBe('en');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('EENM Simulator');
    expect(document.title).toBe('EENM Simulator');
    expect(document.documentElement.lang).toBe('en');
    expect(api.locales).toContain('en'); // the server catalogs are fetched again in English

    for (const step of ['Stimulator', 'Physiology', 'Simulation', 'Results']) {
      await user.click(screen.getByRole('tab', { name: new RegExp(step) }));
      // open every help text of the step in the sidebar
      for (const help of screen.queryAllByRole('button', { name: /^Help: / })) {
        await user.click(help);
        expect(portugueseIn(shownText(container)), `${step}, ${help.getAttribute('aria-label')}`).toEqual([]);
      }
      expect(portugueseIn(shownText(container)), step).toEqual([]);
    }
    expect(screen.getByRole('contentinfo')).toHaveTextContent('Built by Maykon Meneghel');
  });
});
