"use client";

import { useMemo, useState } from "react";

interface Props {
  value: string;
  onChange: (value: string) => void;
  suggestions: string[];
  placeholder?: string;
  /** Focus the input on mount (used by the inline click-to-edit cell). */
  autoFocus?: boolean;
  /** Override the input's classes (the inline cell uses a tighter style). */
  className?: string;
  /**
   * Commit callback for edit-then-commit callers. When set, Enter, blur, and
   * picking a suggestion all call `onCommit` (instead of the default, where a
   * picked suggestion just updates `value` and the field stays open).
   */
  onCommit?: (value: string) => void;
  /** Cancel callback (Escape). Only meaningful alongside `onCommit`. */
  onCancel?: () => void;
  /** Grow the dropdown to fit the longest suggestion instead of the input width. */
  fitContent?: boolean;
}

const DEFAULT_INPUT_CLASS =
  "w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent placeholder:text-muted";

/** Single-value text input with an autocomplete dropdown (free text allowed). */
export function Autocomplete({
  value,
  onChange,
  suggestions,
  placeholder,
  autoFocus,
  className,
  onCommit,
  onCancel,
  fitContent,
}: Props) {
  const [focused, setFocused] = useState(false);

  const filtered = useMemo(() => {
    const q = value.trim().toLowerCase();
    return suggestions
      .filter((s) => (q ? s.toLowerCase().includes(q) && s.toLowerCase() !== q : true))
      .slice(0, 8);
  }, [suggestions, value]);

  return (
    <div className="relative">
      <input
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          if (onCommit) onCommit(value);
          else setTimeout(() => setFocused(false), 120);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && onCommit) onCommit(value);
          if (e.key === "Escape" && onCancel) onCancel();
        }}
        placeholder={placeholder}
        className={className ?? DEFAULT_INPUT_CLASS}
      />
      {focused && filtered.length > 0 && (
        <div
          className={`absolute left-0 top-full z-50 mt-1 max-h-52 ${
            fitContent ? "w-max min-w-full" : "w-full"
          } overflow-y-auto rounded-lg border border-border bg-surface p-1 shadow-2xl`}
        >
          {filtered.map((s) => (
            <button
              key={s}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => (onCommit ? onCommit(s) : onChange(s))}
              className="block w-full truncate rounded-md px-2.5 py-1.5 text-left text-sm hover:bg-surface-2"
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
