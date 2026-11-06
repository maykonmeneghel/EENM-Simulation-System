import { useContext } from 'react';
import type { ReactNode } from 'react';
import { HelpContext } from './helpContext';

/**
 * Small macOS-style "?" help button. Like every other explanation in the app, its text opens in the right sidebar
 * instead of a popover next to the control.
 */
export function HelpButton({ label, children }: { label: string; children: ReactNode }) {
  const show = useContext(HelpContext);
  return (
    <button
      type="button"
      className="help-button"
      aria-label={`Ajuda: ${label}`}
      aria-controls="inspector"
      title={`Ajuda: ${label}`}
      onClick={() => show?.(label, children)}
    >
      ?
    </button>
  );
}
