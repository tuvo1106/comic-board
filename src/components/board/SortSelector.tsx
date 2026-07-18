"use client";

import { SORT_OPTIONS, type SortKey } from "@/lib/sort";
import { Menu, MenuItem } from "@/components/ui/Menu";
import { Check, ChevronDown } from "@/components/ui/icons";

export function SortSelector({
  value,
  onChange,
}: {
  value: SortKey;
  onChange: (key: SortKey) => void;
}) {
  const current = SORT_OPTIONS.find((o) => o.value === value) ?? SORT_OPTIONS[0];
  return (
    <Menu
      align="right"
      widthClass="w-44"
      trigger={({ toggle, open }) => (
        <button
          onClick={toggle}
          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-muted transition hover:text-fg"
        >
          <span className="text-muted">Sort:</span>
          <span className="text-fg">{current.label}</span>
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
      )}
    >
      {(close) =>
        SORT_OPTIONS.map((o) => (
          <MenuItem
            key={o.value}
            icon={
              <Check
                className={`h-4 w-4 ${o.value === value ? "opacity-100" : "opacity-0"}`}
              />
            }
            onClick={() => {
              onChange(o.value);
              close();
            }}
          >
            {o.label}
          </MenuItem>
        ))
      }
    </Menu>
  );
}
