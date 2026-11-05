import { useId, useRef } from 'react';
import type { KeyboardEvent } from 'react';

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
}

export interface SegmentedControlProps<T extends string> {
  options: readonly SegmentOption<T>[];
  value: T;
  onChange(value: T): void;
  /** Accessible name of the group. */
  label: string;
  /** `tabs` → role=tablist (switches panels); `radio` → role=radiogroup (form value). */
  mode?: 'tabs' | 'radio';
  /** For tabs: id of the panel controlled by each segment. */
  panelId?: (value: T) => string;
  /** For tabs: id given to each tab (so panels can reference it). */
  tabId?: (value: T) => string;
  disabled?: boolean;
  size?: 'regular' | 'small';
  id?: string;
  /** Tooltip per segment (e.g. keyboard shortcut). */
  titles?: (value: T) => string;
}

/**
 * iOS/macOS-style segmented control with a sliding selection. Arrow keys / Home / End move
 * and select (roving tabindex: only the selected segment is in the tab order).
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  label,
  mode = 'radio',
  panelId,
  tabId,
  disabled = false,
  size = 'regular',
  id,
  titles,
}: SegmentedControlProps<T>) {
  const autoId = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const index = Math.max(0, options.findIndex((o) => o.value === value));
  const isTabs = mode === 'tabs';

  const select = (i: number) => {
    const n = options.length;
    const next = ((i % n) + n) % n;
    const opt = options[next];
    if (!opt) return;
    onChange(opt.value);
    refs.current[next]?.focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    const keys: Record<string, () => void> = {
      ArrowRight: () => select(index + 1),
      ArrowDown: () => select(index + 1),
      ArrowLeft: () => select(index - 1),
      ArrowUp: () => select(index - 1),
      Home: () => select(0),
      End: () => select(options.length - 1),
    };
    const action = keys[e.key];
    if (action) {
      e.preventDefault();
      action();
    }
  };

  return (
    <div
      id={id}
      className={`segmented segmented--${size}${disabled ? ' segmented--disabled' : ''}`}
      role={isTabs ? 'tablist' : 'radiogroup'}
      aria-label={label}
      aria-disabled={disabled || undefined}
      style={{ ['--seg-count' as string]: options.length, ['--seg-index' as string]: index }}
    >
      <span className="segmented-thumb" aria-hidden="true" />
      {options.map((o, i) => {
        const selected = i === index;
        return (
          <button
            key={o.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            id={tabId ? tabId(o.value) : `${autoId}-${i}`}
            className={`segment${selected ? ' segment--selected' : ''}`}
            role={isTabs ? 'tab' : 'radio'}
            aria-selected={isTabs ? selected : undefined}
            aria-checked={isTabs ? undefined : selected}
            aria-controls={isTabs && panelId ? panelId(o.value) : undefined}
            tabIndex={selected ? 0 : -1}
            disabled={disabled}
            title={titles ? `${o.label} (${titles(o.value)})` : undefined}
            onClick={() => onChange(o.value)}
            onKeyDown={onKeyDown}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
