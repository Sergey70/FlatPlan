import { useState } from 'react';
export function DesignNumber({
  label,
  value,
  onChange,
  min = -200,
  max = 200,
  step = 0.01,
  disabled = false,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState(String(value)),
    [previous, setPrevious] = useState(value);
  if (previous !== value) {
    setPrevious(value);
    setDraft(String(value));
  }
  function apply() {
    const n = Number(draft.replace(',', '.'));
    if (draft.trim() && Number.isFinite(n) && n >= min && n <= max) onChange(n);
    else setDraft(String(value));
  }
  return (
    <label className="ed-field">
      <span>{label}</span>
      <input
        aria-label={label}
        inputMode="decimal"
        value={draft}
        disabled={disabled}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={apply}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') setDraft(String(value));
        }}
        step={step}
      />
    </label>
  );
}
export function DesignCheck({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="ed-design-check">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>{label}</span>
    </label>
  );
}
