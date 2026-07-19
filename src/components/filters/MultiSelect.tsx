"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Pencil } from "@/components/ui/icons";

interface Option {
  value: string;
  count: number;
}

interface Props {
  label: string;
  options: Option[];
  selected: string[];
  onToggle: (value: string) => void;
  /** When set, each option gets an inline rename (pencil) that renames the
   *  underlying entity everywhere it's used. */
  onRename?: (from: string, to: string) => void;
}

export function MultiSelect({ label, options, selected, onToggle, onRename }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  const startRename = (value: string) => {
    setEditing(value);
    setDraft(value);
  };
  const commitRename = () => {
    if (editing == null) return;
    const next = draft.trim();
    if (next && next !== editing) onRename?.(editing, next);
    setEditing(null);
  };

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? options.filter((o) => o.value.toLowerCase().includes(q)) : options;
  }, [options, query]);

  const active = selected.length > 0;

  return (
    <div ref={rootRef} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition ${
          active
            ? "border-accent/50 bg-accent/15 text-fg"
            : "border-border bg-surface text-muted hover:text-fg"
        }`}
      >
        {label}
        {active && (
          <span className="grid h-5 min-w-5 place-items-center rounded-full bg-accent px-1 text-xs font-bold text-accent-fg">
            {selected.length}
          </span>
        )}
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.14 }}
            className="absolute left-0 top-full z-50 mt-2 w-64 origin-top overflow-hidden rounded-xl border border-border bg-surface shadow-2xl"
          >
            <div className="border-b border-border p-2">
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={`Filter ${label.toLowerCase()}…`}
                className="w-full rounded-md bg-surface-2 px-2.5 py-1.5 text-sm outline-none placeholder:text-muted"
              />
            </div>
            <div className="max-h-64 overflow-y-auto p-1">
              {filtered.length === 0 && (
                <p className="px-3 py-4 text-center text-sm text-muted">No matches</p>
              )}
              {filtered.map((o) => {
                const checked = selected.includes(o.value);
                if (editing === o.value) {
                  return (
                    <div key={o.value} className="flex items-center gap-1 px-1.5 py-1">
                      <input
                        autoFocus
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") commitRename();
                          if (e.key === "Escape") {
                            e.stopPropagation(); // cancel rename, keep the menu open
                            setEditing(null);
                          }
                        }}
                        onBlur={commitRename}
                        className="w-full rounded border border-accent bg-surface-2 px-2 py-1 text-sm outline-none"
                      />
                    </div>
                  );
                }
                return (
                  <div
                    key={o.value}
                    className="group flex items-center rounded-md pr-1 transition hover:bg-surface-2"
                  >
                    <button
                      onClick={() => onToggle(o.value)}
                      className="flex flex-1 items-center gap-2.5 px-2.5 py-1.5 text-left text-sm"
                    >
                      <span
                        className={`grid h-4 w-4 flex-shrink-0 place-items-center rounded border ${
                          checked ? "border-accent bg-accent text-accent-fg" : "border-border"
                        }`}
                      >
                        {checked && <Check className="h-3 w-3" />}
                      </span>
                      <span className="flex-1 truncate">{o.value}</span>
                      <span className="text-xs text-muted">{o.count}</span>
                    </button>
                    {onRename && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          startRename(o.value);
                        }}
                        title={`Rename ${o.value}`}
                        aria-label={`Rename ${o.value}`}
                        className="grid h-6 w-6 flex-shrink-0 place-items-center rounded text-muted opacity-0 transition hover:bg-surface hover:text-fg group-hover:opacity-100"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
