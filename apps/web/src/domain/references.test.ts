import { describe, expect, it } from 'vitest';
import { STAGE_EXPLANATIONS } from '../ui/stageExplanations';
import { REFERENCES, scholarUrl, sourceUrl } from './references';
import { STAGES_BY_VARIANT } from './modelEquations';

describe('references', () => {
  it('every reference links somewhere checkable (DOI or PubMed) and searches its exact title on Google Scholar', () => {
    for (const r of Object.values(REFERENCES)) {
      expect(r.doi ?? r.pmid, r.id).toBeTruthy();
      expect(scholarUrl(r)).toBe(`https://scholar.google.com/scholar?q=${encodeURIComponent(`"${r.title}"`)}`);
      expect(sourceUrl(r)).toMatch(r.doi ? /^https:\/\/doi\.org\/10\./ : /^https:\/\/pubmed\.ncbi\.nlm\.nih\.gov\/\d+\/$/);
    }
  });

  it('every stage of both variants has a plain explanation, and a source or an "inherited" note', () => {
    const stages = new Set([...STAGES_BY_VARIANT.ORIGINAL, ...STAGES_BY_VARIANT.LITERATURE]);
    for (const id of stages) {
      const ex = STAGE_EXPLANATIONS[id];
      expect(ex.plain.length, id).toBeGreaterThan(60);
      expect(ex.refs.length > 0 || Boolean(ex.inherited), id).toBe(true);
      for (const r of ex.refs) expect(REFERENCES[r.id], `${id}:${r.id}`).toBeDefined();
    }
  });
});
