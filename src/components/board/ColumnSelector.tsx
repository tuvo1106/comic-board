"use client";

import type { ColumnPref } from "@/lib/use-columns";

const OPTIONS: { label: string; value: ColumnPref }[] = [
  { label: "Auto", value: null },
  { label: "3", value: 3 },
  { label: "4", value: 4 },
  { label: "5", value: 5 },
  { label: "6", value: 6 },
];

/** Segmented control to pin the board's column count (density). */
export function ColumnSelector({
  value,
  onChange,
}: {
  value: ColumnPref;
  onChange: (v: ColumnPref) => void;
}) {
  return (
    <div className="flex items-center gap-0.5 rounded-full border border-border bg-surface p-0.5">
      {OPTIONS.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.label}
            onClick={() => onChange(o.value)}
            className={`min-w-7 rounded-full px-2 py-1 text-xs font-medium transition ${
              active ? "bg-accent text-accent-fg" : "text-muted hover:text-fg"
            }`}
            title={o.value == null ? "Auto columns" : `${o.value} columns`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
