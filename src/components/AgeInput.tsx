import { useState, useEffect, useRef } from 'react';
import { MAX_AGE, clampAge } from '../lib/ageUtils';

interface AgeInputProps {
  value: number | undefined;
  min?: number;
  max?: number;
  optional?: boolean;
  placeholder?: string;
  className?: string;
  onChange: (age: number | undefined) => void;
}

/**
 * Age input with live limit enforcement:
 * - Exceeding max: clamped immediately on each keystroke.
 * - Below min: allowed as a partial entry only if appending more digits could
 *   still reach a valid value (e.g. "6" is fine when min=18, but "13" is not
 *   when max=120 because 130+ would exceed max). Finalised on blur.
 * - Prevents the "clamps to min on first digit" issue with controlled inputs.
 */
export function AgeInput({
  value,
  min = 18,
  max = MAX_AGE,
  optional = false,
  placeholder,
  className,
  onChange,
}: AgeInputProps) {
  const [local, setLocal] = useState(value != null ? String(value) : '');
  const focused = useRef(false);

  // Sync from parent only when the field is not focused
  useEffect(() => {
    if (!focused.current) {
      setLocal(value != null ? String(value) : '');
    }
  }, [value]);

  function handleChange(raw: string) {
    // Allow clearing for optional fields
    if (raw === '') {
      setLocal('');
      if (optional) onChange(undefined);
      return;
    }

    const num = parseInt(raw, 10);
    if (isNaN(num)) return;

    // Exceeds max → clamp immediately
    if (num > max) {
      setLocal(String(max));
      onChange(max);
      return;
    }

    // Below min
    if (num < min) {
      // Allow as a partial entry if adding one more digit could stay ≤ max,
      // meaning at least one valid completion exists (e.g. "6" → 60–69).
      if (num * 10 <= max) {
        setLocal(raw); // show partial, do not commit yet
        return;
      }
      // Dead-end: no valid completion possible (e.g. "13" when max=120).
      setLocal(String(min));
      onChange(min);
      return;
    }

    // Value is within [min, max] — commit immediately
    setLocal(raw);
    onChange(num);
  }

  function handleBlur() {
    focused.current = false;
    if (optional && local === '') {
      onChange(undefined);
      return;
    }
    // Finalise any unresolved partial (e.g. user focused-out after typing "6")
    const num = parseInt(local, 10);
    const clamped = clampAge(isNaN(num) ? min : num, value ?? min, min, max);
    setLocal(String(clamped));
    onChange(clamped);
  }

  return (
    <input
      type="number"
      value={local}
      min={min}
      max={max}
      placeholder={placeholder}
      className={className}
      onChange={e => handleChange(e.target.value)}
      onFocus={() => { focused.current = true; }}
      onBlur={handleBlur}
    />
  );
}
