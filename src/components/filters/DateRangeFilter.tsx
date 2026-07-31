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
            <DateRangeFields from={from} to={to} onChange={onChange} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** How long typing must settle before the drafts are pushed to the filters. */
const COMMIT_DELAY_MS = 400;

/**
 * The two date inputs, plus the drafts that own them while the popover is open.
 *
 * These must NOT be bound straight to the filter props. A `type="date"` input
 * reports a *complete* value on nearly every keystroke in the year segment —
 * typing "2026" yields 0002, then 0020, 0202, 2026 — and filter state lives in
 * the URL, where `router.replace` resolves asynchronously. So the first
 * keystroke's `0002-01-15` came back as a prop mid-typing, React wrote it into
 * the input, and the year the user was halfway through was wiped: the field
 * appeared to reset itself to a year-2 date, which is also what got committed.
 *
 * Holding a draft makes the URL strictly downstream while the popover is open —
 * nothing writes back into the input. Committing on a settle delay keeps the
 * board from flashing through 0002/0020/0202 on the way to the intended year.
 *
 * Mounted only while open (AnimatePresence unmounts it on close), so the drafts
 * re-seed from the committed filters every time it reopens — no prop sync here.
 */
function DateRangeFields({ from, to, onChange }: Props) {
  const [draftFrom, setDraftFrom] = useState(from ?? "");
  const [draftTo, setDraftTo] = useState(to ?? "");

  useEffect(() => {
    const nextFrom = draftFrom || null;
    const nextTo = draftTo || null;
    // Already applied — covers the mount pass and the re-run after our own
    // commit lands back as new props, so this can't loop.
    if (nextFrom === from && nextTo === to) return;
    const t = setTimeout(() => onChange({ dateFrom: nextFrom, dateTo: nextTo }), COMMIT_DELAY_MS);
    return () => clearTimeout(t);
  }, [draftFrom, draftTo, from, to, onChange]);

  const clear = () => {
    setDraftFrom("");
    setDraftTo("");
    onChange({ dateFrom: null, dateTo: null }); // immediate: an explicit click shouldn't wait
  };

  return (
    <>
      <label className="mb-1 block text-xs font-medium text-muted">Cover date from</label>
      <input
        type="date"
        value={draftFrom}
        onChange={(e) => setDraftFrom(e.target.value)}
        className="w-full rounded-md bg-surface-2 px-2.5 py-1.5 text-sm text-fg outline-none [color-scheme:dark]"
        aria-label="Cover date from"
      />
      <label className="mb-1 mt-3 block text-xs font-medium text-muted">Cover date to</label>
      <input
        type="date"
        value={draftTo}
        onChange={(e) => setDraftTo(e.target.value)}
        className="w-full rounded-md bg-surface-2 px-2.5 py-1.5 text-sm text-fg outline-none [color-scheme:dark]"
        aria-label="Cover date to"
      />
      {(draftFrom || draftTo) && (
        <button
          onClick={clear}
          className="mt-3 w-full rounded-md border border-border px-2.5 py-1.5 text-xs text-muted transition hover:text-fg"
        >
          Clear dates
        </button>
      )}
    </>
  );
}
