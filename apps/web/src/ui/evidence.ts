import { tr } from '../i18n/locale';

/** Evidence badge text: read in the full text or only in the abstract. */
export function evidenceText(evidence: string): string {
  return evidence === 'FULL_TEXT' ? tr({ 'pt-BR': 'Texto completo', en: 'Full text' }) : tr({ 'pt-BR': 'Só resumo', en: 'Abstract only' });
}
