"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useMounted } from "@/lib/use-mounted";
import type { Suggestion } from "@/lib/search-suggest";

interface Options {
  /** Unique per instance — used for the listbox and per-option element ids. */
  listboxId: string;
  value: string;
  onChange: (value: string) => void;
  suggestions: Suggestion[];
  /** Called with the chosen suggestion's value. */
  onPick: (value: string) => void;
}

/**
 * Keyboard, focus and ARIA behaviour for a suggestion dropdown, shared by the
 * board search (`SearchBox`) and the provider-search box (`MetadataSearch`).
 *
 * Headless on purpose: the two call sites sit in very different layouts (a
 * top-bar field vs. an input paired with a submit button inside a dialog), so
 * they own their own markup and only borrow the fiddly parts — the highlight
 * state machine and the combobox/listbox wiring that's easy to get subtly wrong
 * twice.
 */
export function useTypeahead({ listboxId, value, onChange, suggestions, onPick }: Options) {
  const [focused, setFocused] = useState(false);
  // Escape hides the list without clearing the query; typing brings it back.
  const [dismissed, setDismissed] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The list is portalled, so it needs the input's on-screen box to position
  // against (see SuggestionList).
  const inputRef = useRef<HTMLInputElement>(null);

  const open = focused && !dismissed && suggestions.length > 0;

  // A stale highlight would point at a different row (or past the end) once the
  // query changes. Adjusted during render rather than in an effect, which would
  // set state synchronously on every keystroke and cascade an extra render.
  const [prevValue, setPrevValue] = useState(value);
  if (value !== prevValue) {
    setPrevValue(value);
    setActiveIndex(-1);
  }

  useEffect(() => () => { if (blurTimer.current) clearTimeout(blurTimer.current); }, []);

  const pick = (next: string) => {
    // Dismiss before handing the value up: `onPick` changes `value`, and without
    // this the list would immediately reopen with matches for the new text.
    setDismissed(true);
    setActiveIndex(-1);
    onPick(next);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      if (!open) return;
      e.preventDefault();
      // Dialog closes itself on a document-level Escape listener. Stop the event
      // here so dismissing the dropdown doesn't also tear down the whole modal.
      e.stopPropagation();
      setDismissed(true);
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
      const next = activeIndex + (e.key === "ArrowDown" ? 1 : -1);
      // Clamp rather than wrap: -1 means "nothing highlighted, act on exactly
      // what I typed", which needs to stay reachable by arrowing back up.
      setActiveIndex(Math.max(-1, Math.min(suggestions.length - 1, next)));
      return;
    }
    if (e.key === "Enter" && open && activeIndex >= 0) {
      // preventDefault also suppresses an enclosing form's implicit submit, so
      // Enter-on-a-highlighted-row picks instead of searching.
      e.preventDefault();
      pick(suggestions[activeIndex].value);
    }
  };

  const inputProps = {
    ref: inputRef,
    value,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
      setDismissed(false);
      onChange(e.target.value);
    },
    onFocus: () => setFocused(true),
    onBlur: () => {
      // Let a suggestion's click land before unmounting the list. Options also
      // preventDefault on mousedown; this is the backstop for focus leaving by
      // other means (Tab, clicking elsewhere).
      blurTimer.current = setTimeout(() => setFocused(false), 120);
    },
    onKeyDown,
    role: "combobox" as const,
    "aria-expanded": open,
    "aria-controls": listboxId,
    "aria-autocomplete": "list" as const,
    "aria-activedescendant": activeIndex >= 0 ? `${listboxId}-${activeIndex}` : undefined,
  };

  return { open, activeIndex, setActiveIndex, pick, inputProps, anchorRef: inputRef };
}

interface ListProps {
  id: string;
  /** The input to hang the list under — its box drives the fixed position. */
  anchorRef: React.RefObject<HTMLInputElement | null>;
  suggestions: Suggestion[];
  activeIndex: number;
  onHover: (index: number) => void;
  onPick: (value: string) => void;
  /**
   * Show which field each suggestion came from. Off when every row is the same
   * kind (the provider box is series-only), where the label is just noise.
   */
  showKind?: boolean;
}

/**
 * The dropdown, rendered in a **portal** and fixed-positioned under the input.
 *
 * It must portal: `Dialog`'s panel is `overflow-hidden` (needed to clip its own
 * rounded corners) and silently cut the list off mid-row when this was rendered
 * in place. Same fix as the tab "…" menu (`Menu.tsx`) — measure the anchor,
 * render to `document.body`. `z-[90]` clears `Dialog`'s `z-[80]`.
 */
export function SuggestionList({
  id,
  anchorRef,
  suggestions,
  activeIndex,
  onHover,
  onPick,
  showKind = true,
}: ListProps) {
  const mounted = useMounted();
  const [box, setBox] = useState<{ top: number; left: number; width: number } | null>(null);

  useLayoutEffect(() => {
    const measure = () => {
      const el = anchorRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setBox({ top: r.bottom + 4, left: r.left, width: r.width });
    };
    measure();
    // `capture` so an inner scroller (the modal's scrolling details pane) is
    // caught too, not just the window.
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
    };
  }, [anchorRef, suggestions.length]);

  if (!mounted || !box) return null;

  return createPortal(
    <div
      id={id}
      role="listbox"
      style={{ position: "fixed", top: box.top, left: box.left, width: box.width }}
      className="z-[90] max-h-72 overflow-y-auto rounded-lg border border-border bg-surface p-1 shadow-2xl"
    >
      {suggestions.map((s, i) => (
        <button
          key={`${s.kind}:${s.value}`}
          id={`${id}-${i}`}
          type="button"
          role="option"
          aria-selected={i === activeIndex}
          onMouseDown={(e) => e.preventDefault()} // don't lose the click to blur
          onMouseEnter={() => onHover(i)}
          onClick={() => onPick(s.value)}
          className={`flex w-full items-center gap-3 rounded-md px-2.5 py-1.5 text-left text-sm ${
            i === activeIndex ? "bg-surface-2" : ""
          }`}
        >
          <span className="min-w-0 flex-1 truncate text-fg">{s.value}</span>
          {showKind && <span className="shrink-0 text-xs text-muted">{s.label}</span>}
          <span className="shrink-0 tabular-nums text-xs text-muted">{s.count}</span>
        </button>
      ))}
    </div>,
    document.body,
  );
}
