import { useEffect, useId, useRef, useState } from 'react';
import type { ReactNode } from 'react';

/** Small macOS-style "?" help button that opens a popover; Escape or a click outside closes it. */
export function HelpPopover({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const rootRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <span className="help-anchor" ref={rootRef}>
      <button
        type="button"
        className="help-button"
        aria-label={`Ajuda: ${label}`}
        aria-expanded={open}
        aria-controls={id}
        title={`Ajuda: ${label}`}
        onClick={() => setOpen((o) => !o)}
      >
        ?
      </button>
      {open ? (
        <span id={id} role="dialog" aria-label={label} className="popover">
          {children}
        </span>
      ) : null}
    </span>
  );
}
