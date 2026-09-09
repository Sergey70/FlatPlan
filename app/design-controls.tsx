import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
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

/** Keep native picker input local; only its confirmed change edits the project. */
export function DesignColor({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState(value);
  const [previous, setPrevious] = useState(value);
  const committed = useRef(value);
  const latestChange = useRef(onChange);
  if (previous !== value) {
    setPrevious(value);
    setDraft(value);
  }
  useLayoutEffect(() => {
    committed.current = value;
    latestChange.current = onChange;
  }, [value, onChange]);
  const apply = useCallback(() => {
    const color = input.current?.value;
    if (color && color !== committed.current) {
      committed.current = color;
      latestChange.current(color);
    }
  }, []);
  useEffect(() => {
    const element = input.current!;
    // React onChange also fires for every native input event during dragging.
    element.addEventListener('change', apply);
    return () => element.removeEventListener('change', apply);
  }, [apply]);
  return (
    <label className="ed-field">
      <span>{label}</span>
      <input
        ref={input}
        type="color"
        aria-label={label}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={apply}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.currentTarget.value = committed.current;
            setDraft(committed.current);
            e.currentTarget.blur();
          }
          if (e.key === 'Enter') e.currentTarget.blur();
        }}
      />
    </label>
  );
}
