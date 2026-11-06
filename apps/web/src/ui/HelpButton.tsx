import { useContext } from 'react';
import type { ReactNode } from 'react';
import { HelpContext } from './helpContext';
import { tr } from '../i18n/locale';

/**
 * Small macOS-style "?" help button. Like every other explanation in the app, its text opens in the right sidebar
 * instead of a popover next to the control.
 */
export function HelpButton({ label, children }: { label: string; children: ReactNode }) {
  const show = useContext(HelpContext);
  const name = tr({ 'pt-BR': `Ajuda: ${label}`, en: `Help: ${label}` });
  return (
    <button
      type="button"
      className="help-button"
      aria-label={name}
      aria-controls="inspector"
      title={name}
      onClick={() => show?.(label, children)}
    >
      ?
    </button>
  );
}
