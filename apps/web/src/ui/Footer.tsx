import { tr } from '../i18n/locale';
import { useLocale } from '../i18n/useLocale';

export const AUTHOR_URL = 'https://maykon.meneghel.me';

/** Discreet credit at the bottom of the window: the author, linked to his portfolio. */
export function Footer() {
  useLocale();
  return (
    <footer className="app-footer">
      {tr({ 'pt-BR': 'Desenvolvido por', en: 'Built by' })}{' '}
      <a href={AUTHOR_URL} target="_blank" rel="noreferrer">
        Maykon Meneghel
      </a>
    </footer>
  );
}
