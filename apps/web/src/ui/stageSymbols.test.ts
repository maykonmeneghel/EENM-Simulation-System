import { afterEach, describe, expect, it } from 'vitest';
import type { FormValues } from '../application/formModel';
import { defaultFormValues } from '../application/formModel';
import { buildModelSnapshot } from '../application/modelView';
import type { ModelSnapshot } from '../application/modelView';
import { defaultRequest } from '../domain/defaults';
import type { StageId } from '../domain/modelEquations';
import type { MusclePreset } from '../domain/simulation';
import type { Locale } from '../i18n/locale';
import { setLocale } from '../i18n/locale';
import type { GlossaryEntry } from './stageSymbols';
import { allGlossaryEntries, glossaryEntries, stageSymbols, subscriptNote, symbolContext, symbolPattern } from './stageSymbols';
import { buildStageContents } from './stageTex';

const soleus: MusclePreset = { id: 'SOLEUS', label: 'Sóleo', poolSize: { S: 800, FR: 50, FF: 50 } };
const lit = defaultFormValues('LITERATURE');
const orig = defaultFormValues('ORIGINAL');
const drive = (v: FormValues): FormValues => ({ ...v, driveEnabled: true, 'centralDrive.voluntaryNa': '5' });

/** Settings that together render every variant of every stage (stageTex.ts branches). */
const CONFIGS: Record<string, () => ModelSnapshot> = {
  'ORIGINAL default (amplitude modulation, step)': () => buildModelSnapshot({ values: orig, muscles: [soleus] }),
  'ORIGINAL triangle + trains, biphasic': () =>
    buildModelSnapshot({
      values: {
        ...orig,
        'stimulus.waveform': 'BIPHASIC',
        'stimulus.modulation.shape': 'TRIANGLE',
        'stimulus.modulation.peakTimeMs': '400',
        trainsEnabled: true,
        'stimulus.trainOnMs': '300',
        'stimulus.trainOffMs': '700',
      },
      muscles: [soleus],
    }),
  'ORIGINAL frequency modulation': () => buildModelSnapshot({ values: { ...orig, 'stimulus.modulation.target': 'FREQUENCY' }, muscles: [] }),
  'LITERATURE default': () => buildModelSnapshot({ values: lit, muscles: [soleus] }),
  'LITERATURE trains, monophasic, after a run': () =>
    buildModelSnapshot({
      values: { ...lit, 'stimulus.waveform': 'MONOPHASIC', trainsEnabled: true, 'stimulus.trainOnMs': '300', 'stimulus.trainOffMs': '700' },
      muscles: [soleus],
      lastRequest: defaultRequest('LITERATURE'),
      lastStarted: { type: 'started', simulationId: 'x', durationMs: 1000, outputStepMs: 0.1, motorUnits: { S: 106, FR: 7, FF: 7 }, muscle: 'SOLEUS' },
    }),
  'LITERATURE manual counts': () =>
    buildModelSnapshot({ values: { ...lit, manualUnits: true, 'unitsPerType.S': '5', 'unitsPerType.FR': '2', 'unitsPerType.FF': '2' }, muscles: [soleus] }),
  'LITERATURE unknown muscle': () => buildModelSnapshot({ values: { ...lit, muscle: 'NOT_A_MUSCLE' }, muscles: [] }),
  'LITERATURE invasive, no drive (2a)': () => buildModelSnapshot({ values: { ...lit, stimulationSite: 'MOTONEURON_POOL' }, muscles: [soleus] }),
  'LITERATURE drive, non-invasive (2c + 2b, electrode)': () => buildModelSnapshot({ values: drive(lit), muscles: [soleus] }),
  'LITERATURE drive, invasive, Watanabe, by rheobase, Parkinson tremor': () =>
    buildModelSnapshot({
      values: {
        ...drive(lit),
        stimulationSite: 'MOTONEURON_POOL',
        'centralDrive.thresholdRule': 'WATANABE_2013',
        'centralDrive.currentScale': 'RHEOBASE',
        condition: 'PARKINSON',
        conditionAdjustments: ['PD_TREMOR', 'PD_MOTOR_UNIT_LOSS', 'PD_NEUROPATHY'],
      },
      muscles: [soleus],
    }),
  'LITERATURE spinal cord injury (all adjustments)': () =>
    buildModelSnapshot({
      values: { ...lit, condition: 'SCI', conditionAdjustments: ['SCI_FATIGABILITY', 'SCI_FAST_TWITCH', 'SCI_ATROPHY', 'SCI_CHRONAXIE'] },
      muscles: [soleus],
    }),
};

/** TeX operators, layout commands and units: everything that is not a model symbol. */
const COMMANDS = new Set([
  'frac', 'tfrac', 'cdot', 'quad', 'qquad', 'left', 'right', 'bmod', 'min', 'max', 'ln', 'sin', 'pi', 'to',
  'Rightarrow', 'iff', 'le', 'ge', 'in', 'ldots', 'sum', 'underbrace', 'sqrt', 'leftarrow', 'times', 'mu',
]); // prettier-ignore
const UNITS = [/\\mu [AF]\/cm\^2/g, /\\Omega\\,cm/g, /\\to nA/g, /\((?:S|FR|FF)\)/g, /\(S \/ FR \/ FF\)/g];

/**
 * What is left of a TeX line once the glossary symbols, operators, numbers, prose (`\text{…}`) and units are removed:
 * any letter left over is a symbol with no glossary entry.
 */
function leftover(line: string, entries: readonly GlossaryEntry[]): string {
  let s = line
    .replace(/\\frac\{d/g, '\\frac{') // d/dt
    .replace(/\{dt\}/g, '{}')
    .replace(/(?<![\\A-Za-z])e\^/g, '^'); // Euler's number
  // longest forms first, so `t` does not eat the t of `A(t)`; forms written with \text before the prose is removed
  const forms = entries
    .flatMap((e) => e.forms.map((form) => ({ form, pattern: symbolPattern(form, e.bare) })))
    .sort((a, b) => b.form.length - a.form.length);
  const withText = forms.filter((f) => f.form.includes('\\text'));
  for (const f of withText) s = s.replace(f.pattern, ' ');
  s = s.replace(/\\(?:begin|end)\{cases\}/g, ' ').replace(/\\operatorname\{mean\}/g, ' ').replace(/\\text\{[^}]*\}/g, ' ');
  for (const u of UNITS) s = s.replace(u, ' ');
  for (const f of forms.filter((f) => !withText.includes(f))) s = s.replace(f.pattern, ' ');
  s = s.replace(/_\{k=1\}/g, ' ').replace(/_k(?![A-Za-z])/g, ' '); // the unit index of sums and means
  s = s.replace(/\\([A-Za-z]+)/g, (m, name: string) => (COMMANDS.has(name) ? ' ' : m));
  s = s.replace(/\\[,; %\\!]/g, ' ');
  return (s.match(/\\?[A-Za-z]+/g) ?? []).join(' ');
}

function check(snapshot: ModelSnapshot) {
  const context = symbolContext(snapshot);
  const missing: string[] = [];
  const used = new Map<StageId, Set<string>>();
  for (const stage of buildStageContents(snapshot)) {
    const entries = glossaryEntries(stage.id, context);
    for (const line of [...stage.symbolic, ...stage.substituted]) {
      const rest = leftover(line, entries);
      if (rest) missing.push(`${stage.id}: "${rest}" in ${line}`);
      for (const e of entries) {
        if (e.forms.some((form) => symbolPattern(form, e.bare).test(line))) {
          (used.get(stage.id) ?? used.set(stage.id, new Set()).get(stage.id)!).add(e.tex);
        }
      }
    }
  }
  return { missing, used };
}

afterEach(() => setLocale('pt-BR'));

describe('glossary of the stage symbols', () => {
  for (const locale of ['pt-BR', 'en'] as Locale[]) {
    it(`every symbol of every rendered stage has an entry (${locale})`, () => {
      setLocale(locale);
      const missing = Object.entries(CONFIGS).flatMap(([name, make]) => check(make()).missing.map((m) => `[${name}] ${m}`));
      expect(missing).toEqual([]);
    });
  }

  it('every entry appears in the equations of some setting (no stale entries)', () => {
    const seen = new Map<StageId, Set<string>>();
    for (const make of Object.values(CONFIGS)) {
      for (const [stage, texs] of check(make()).used) for (const t of texs) (seen.get(stage) ?? seen.set(stage, new Set()).get(stage)!).add(t);
    }
    const ids: StageId[] = ['1', '2a', '2b', '2c', '3', '4', '5a', '5b', '6', '7', '8a', '8b'];
    const stale = ids.flatMap((id) => allGlossaryEntries(id).filter((e) => !seen.get(id)?.has(e.tex)).map((e) => `${id}: ${e.tex}`));
    expect(stale).toEqual([]);
  });

  it('the check can fail: a stage without one of its entries leaves that symbol over', () => {
    const snapshot = CONFIGS['LITERATURE default']!();
    const context = symbolContext(snapshot);
    const twitch = buildStageContents(snapshot).find((s) => s.id === '5b')!;
    const withoutM = glossaryEntries('5b', context).filter((e) => e.tex !== 'm');
    expect(leftover(twitch.symbolic[0]!, withoutM)).toBe('m m');
    expect(leftover(twitch.symbolic[0]!, glossaryEntries('5b', context))).toBe('');
  });

  it('shows only the symbols of the current settings', () => {
    const fes = symbolContext(CONFIGS['ORIGINAL default (amplitude modulation, step)']!());
    const stim = symbolContext(CONFIGS['LITERATURE default']!());
    const texs = (c: typeof fes) => stageSymbols('1', c).map((s) => s.tex);
    expect(texs(fes)).toContain('D');
    expect(texs(fes)).not.toContain('E(t)');
    expect(texs(stim)).toContain('E(t)');
    expect(texs(stim)).not.toContain('D');
    expect(subscriptNote('1')).toBeNull();
    expect(subscriptNote('5b')).toMatch(/índice k/);
  });

  it('every entry has a meaning, a unit and a source in both languages, the English with no Portuguese', () => {
    const PORTUGUESE = /[ãõçáéíóúâêôàº]|\b(não|são|está|então|para|pela|pelo|com os|dos|das)\b/i;
    const ids: StageId[] = ['1', '2a', '2b', '2c', '3', '4', '5a', '5b', '6', '7', '8a', '8b'];
    for (const id of ids) {
      for (const e of allGlossaryEntries(id)) {
        for (const text of [e.meaning, e.unit, e.source]) {
          expect(text['pt-BR'].length, `${id} ${e.tex}`).toBeGreaterThan(0);
          expect(text.en, `${id} ${e.tex}`).not.toMatch(PORTUGUESE);
        }
      }
    }
    setLocale('en');
    expect(subscriptNote('3')).not.toMatch(PORTUGUESE);
  });
});
