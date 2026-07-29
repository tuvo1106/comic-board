"use client";

import { useEffect, useRef, useState } from "react";
import { useMeta } from "@/lib/client-api";
import { suggestSearch } from "@/lib/search-suggest";
import { Search } from "@/components/ui/icons";

interface Props {
  value: string;
  /** Per-keystroke change — debounced upstream. */
  onChange: (value: string) => void;
  /**
   * Apply a value immediately, skipping the upstream debounce. Picking a
   * suggestion is a deliberate act, so it shouldn't wait out a timer meant to
   * absorb typing.
   */
  onCommit: (value: string) => void;
}

const LISTBOX_ID = "search-suggestions";

/**
 * The collection search input, with a typeahead dropdown of terms that actually
 * exist in the collection (built from the cached `/api/meta` payload).
 *
 * Picking a suggestion fills the search box and runs the same free-text search
 * as typing it would — it deliberately does NOT jump to applying that value as
 * a facet filter. One control with two different behaviours depending on which
 * row you hit is exactly the edit-vs-filter ambiguity that was already found
 * and fixed once in this codebase (list-view chips vs. modal chips).
 */
export function SearchBox({ value, onChange, onCommit }: Props) {
  const { data: meta } = useMeta();
  const [focused, setFocused] = useState(false);
  // Escape hides the dropdown without clearing the query; typing brings it back.
  const [dismissed, setDismissed] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const suggestions = suggestSearch(meta, value);
  const open = focused && !dismissed && suggestions.length > 0;

  // A stale highlight would point at a different row (or past the end) once the
  // query changes, so reset it whenever the query does. Adjusted during render
  // rather than in an effect — an effect here would set state synchronously on
  // every keystroke and cascade an extra render pass. Same pattern BoardView
  // uses to re-sync its search input. See "You Might Not Need an Effect".
  const [prevValue, setPrevValue] = useState(value);
  if (value !== prevValue) {
    setPrevValue(value);
    setActiveIndex(-1);
  }

  useEffect(() => () => { if (blurTimer.current) clearTimeout(blurTimer.current); }, []);

  const pick = (next: string) => {
    setDismissed(true);
    setActiveIndex(-1);
    onCommit(next);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      if (open) {
        e.preventDefault();
        setDismissed(true);
      }
      return;
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      // Re-open on an arrow press after Escape, rather than making the user
      // retype to get the list back.
      if (!open) {
        if (suggestions.length > 0) setDismissed(false);
        return;
      }
      e.preventDefault();
      const delta = e.key === "ArrowDown" ? 1 : -1;
      const next = activeIndex + delta;
      // Clamp rather than wrap: -1 means "no row highlighted, Enter searches
      // exactly what I typed", which needs to stay reachable by arrowing back up.
      setActiveIndex(Math.max(-1, Math.min(suggestions.length - 1, next)));
      return;
    }
    if (e.key === "Enter" && open && activeIndex >= 0) {
      e.preventDefault();
      pick(suggestions[activeIndex].value);
    }
  };

  return (
    <div className="relative ml-2 max-w-md flex-1">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
      <input
        value={value}
        onChange={(e) => {
          setDismissed(false);
          onChange(e.target.value);
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          // Let a suggestion's click land before unmounting the dropdown. The
          // options also preventDefault on mousedown, so this is a backstop for
          // focus leaving by other means (Tab, clicking elsewhere).
          blurTimer.current = setTimeout(() => setFocused(false), 120);
        }}
        onKeyDown={onKeyDown}
        placeholder="Search series, artists, characters…"
        className="w-full rounded-lg border border-border bg-surface py-2 pl-9 pr-3 text-sm text-fg placeholder:text-muted outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/30"
        role="combobox"
        aria-expanded={open}
        aria-controls={LISTBOX_ID}
        aria-autocomplete="list"
        aria-activedescendant={
          activeIndex >= 0 ? `${LISTBOX_ID}-${activeIndex}` : undefined
        }
      />
      {open && (
        <div
          id={LISTBOX_ID}
          role="listbox"
          className="absolute left-0 top-full z-50 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border border-border bg-surface p-1 shadow-2xl"
        >
          {suggestions.map((s, i) => (
            <button
              key={`${s.kind}:${s.value}`}
              id={`${LISTBOX_ID}-${i}`}
              type="button"
              role="option"
              aria-selected={i === activeIndex}
              onMouseDown={(e) => e.preventDefault()} // don't lose the click to blur
              onMouseEnter={() => setActiveIndex(i)}
              onClick={() => pick(s.value)}
              className={`flex w-full items-center gap-3 rounded-md px-2.5 py-1.5 text-left text-sm ${
                i === activeIndex ? "bg-surface-2" : ""
              }`}
            >
              <span className="min-w-0 flex-1 truncate text-fg">{s.value}</span>
              <span className="shrink-0 text-xs text-muted">{s.label}</span>
              <span className="shrink-0 tabular-nums text-xs text-muted">{s.count}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
