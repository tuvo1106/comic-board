"use client";

import { SORT_LABELS, SORT_MENU_FIELDS, type SortDir, type SortField } from "@/lib/sort";
import { Menu, MenuItem } from "@/components/ui/Menu";
import { ArrowDown, ArrowUp, ChevronDown } from "@/components/ui/icons";

export function SortSelector({
  field,
  dir,
  onSelect,
}: {
  field: SortField;
  dir: SortDir;
  onSelect: (field: SortField) => void;
}) {
  const DirArrow = dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <Menu
      align="right"
      widthClass="w-48"
      trigger={({ toggle, open }) => (
        <button
          onClick={toggle}
          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-muted transition hover:text-fg"
        >
          <span className="text-muted">Sort:</span>
          <span className="text-fg">{SORT_LABELS[field]}</span>
          {field !== "manual" && <DirArrow className="h-3 w-3 text-muted" />}
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
      )}
    >
      {(close) =>
        SORT_MENU_FIELDS.map((f) => {
          const active = f === field;
          const ActiveArrow = dir === "asc" ? ArrowUp : ArrowDown;
          return (
            <MenuItem
              key={f}
              icon={
                active && f !== "manual" ? (
                  <ActiveArrow className="h-4 w-4 text-accent" />
                ) : (
                  <span className={`inline-block h-4 w-4 ${active ? "text-accent" : "opacity-0"}`}>
                    •
                  </span>
                )
              }
              onClick={() => {
                onSelect(f); // choosing the active field toggles direction
                if (!active) close();
              }}
            >
              {SORT_LABELS[f]}
            </MenuItem>
          );
        })
      }
    </Menu>
  );
}
