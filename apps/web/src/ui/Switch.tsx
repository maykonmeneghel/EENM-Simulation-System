export interface SwitchProps {
  checked: boolean;
  onChange(checked: boolean): void;
  label: string;
  disabled?: boolean;
  description?: string;
}

/** macOS-style small switch: a native checkbox with role="switch". */
export function Switch({ checked, onChange, label, disabled, description }: SwitchProps) {
  return (
    <label className={`switch-row${disabled ? ' switch-row--disabled' : ''}`}>
      <span className="switch-text">
        <span>{label}</span>
        {description ? <small className="row-note">{description}</small> : null}
      </span>
      <input
        type="checkbox"
        role="switch"
        className="switch"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
    </label>
  );
}
