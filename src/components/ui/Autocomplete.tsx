"use client";

import { useMemo, useState } from "react";

interface Props {
  value: string;
  onChange: (value: string) => void;
  suggestions: string[];
  placeholder?: string;
}

/** Single-value text input with an autocomplete dropdown (free text allowed). */
export function Autocomplete({ value, onChange, suggestions, placeholder }: Props) {
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
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 120)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent placeholder:text-muted"
      />
      {focused && filtered.length > 0 && (
        <div className="absolute left-0 top-full z-50 mt-1 max-h-52 w-full overflow-y-auto rounded-lg border border-border bg-surface p-1 shadow-2xl">
          {filtered.map((s) => (
            <button
              key={s}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onChange(s)}
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
