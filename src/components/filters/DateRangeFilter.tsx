"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "@/components/ui/icons";

interface Props {
  from: string | null;
  to: string | null;
  onChange: (next: { dateFrom?: string | null; dateTo?: string | null }) => void;
}

/** Cover-date range as a pill+popover, matching the other facet dropdowns. */
export function DateRangeFilter({ from, to, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

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

  const active = from !== null || to !== null;
  const count = (from ? 1 : 0) + (to ? 1 : 0);

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
        Date
        {active && (
          <span className="grid h-5 min-w-5 place-items-center rounded-full bg-accent px-1 text-xs font-bold text-accent-fg">
            {count}
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
            className="absolute left-0 top-full z-50 mt-2 w-64 origin-top overflow-hidden rounded-xl border border-border bg-surface p-3 shadow-2xl"
          >
            <label className="mb-1 block text-xs font-medium text-muted">Cover date from</label>
            <input
              type="date"
              value={from ?? ""}
              onChange={(e) => onChange({ dateFrom: e.target.value || null })}
              className="w-full rounded-md bg-surface-2 px-2.5 py-1.5 text-sm text-fg outline-none [color-scheme:dark]"
              aria-label="Cover date from"
            />
            <label className="mb-1 mt-3 block text-xs font-medium text-muted">Cover date to</label>
            <input
              type="date"
              value={to ?? ""}
              onChange={(e) => onChange({ dateTo: e.target.value || null })}
              className="w-full rounded-md bg-surface-2 px-2.5 py-1.5 text-sm text-fg outline-none [color-scheme:dark]"
              aria-label="Cover date to"
            />
            {active && (
              <button
                onClick={() => onChange({ dateFrom: null, dateTo: null })}
                className="mt-3 w-full rounded-md border border-border px-2.5 py-1.5 text-xs text-muted transition hover:text-fg"
              >
                Clear dates
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
