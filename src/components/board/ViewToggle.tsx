"use client";

import type { BoardViewMode } from "@/lib/use-view";
import { Grid, List } from "@/components/ui/icons";

export function ViewToggle({
  value,
  onChange,
}: {
  value: BoardViewMode;
  onChange: (v: BoardViewMode) => void;
}) {
  return (
    <div className="flex items-center gap-0.5 rounded-full border border-border bg-surface p-0.5">
      {(
        [
          { v: "grid", Icon: Grid, label: "Grid view" },
          { v: "list", Icon: List, label: "List view" },
        ] as const
      ).map(({ v, Icon, label }) => (
        <button
          key={v}
          onClick={() => onChange(v)}
          title={label}
          aria-label={label}
          aria-pressed={value === v}
          className={`grid h-7 w-7 place-items-center rounded-full transition ${
            value === v ? "bg-accent text-accent-fg" : "text-muted hover:text-fg"
          }`}
        >
          <Icon className="h-4 w-4" />
        </button>
      ))}
    </div>
  );
}
