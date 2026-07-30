"use client";

import { useMeta } from "@/lib/client-api";
import { suggestSearch } from "@/lib/search-suggest";
import { SuggestionList, useTypeahead } from "@/components/ui/Typeahead";
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
  /**
   * Plain Enter with no suggestion highlighted. Only pages that don't search as
   * you type need this — the board applies `q` on a debounce, so Enter there is
   * already a no-op by the time you press it.
   */
  onSubmit?: (value: string) => void;
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
export function SearchBox({ value, onChange, onCommit, onSubmit }: Props) {
  const { data: meta } = useMeta();
  const suggestions = suggestSearch(meta, value);
  const { open, activeIndex, setActiveIndex, pick, inputProps, anchorRef } = useTypeahead({
    listboxId: LISTBOX_ID,
    value,
    onChange,
    suggestions,
    onPick: onCommit,
  });

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    inputProps.onKeyDown(e);
    // The typeahead calls preventDefault when Enter lands on a highlighted row,
    // which is how we tell "picked a suggestion" from "submitted what I typed".
    if (onSubmit && e.key === "Enter" && !e.defaultPrevented) onSubmit(value);
  };

  return (
    <div className="relative ml-2 max-w-md flex-1">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
      <input
        {...inputProps}
        onKeyDown={onKeyDown}
        placeholder="Search series, artists, characters…"
        className="w-full rounded-lg border border-border bg-surface py-2 pl-9 pr-3 text-sm text-fg placeholder:text-muted outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/30"
      />
      {open && (
        <SuggestionList
          id={LISTBOX_ID}
          anchorRef={anchorRef}
          suggestions={suggestions}
          activeIndex={activeIndex}
          onHover={setActiveIndex}
          onPick={pick}
        />
      )}
    </div>
  );
}
