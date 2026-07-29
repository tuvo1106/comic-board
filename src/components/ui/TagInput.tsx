"use client";

import { useMemo, useRef, useState } from "react";
import { X } from "./icons";

// Approx dropdown height (max-h-52 + paddings) used to decide flip direction.
const DROPDOWN_H = 232;

/**
 * Whether the suggestions dropdown should open upward: only when it wouldn't fit
 * in the room below the field and there's more room above than below.
 */
export function shouldOpenUp(above: number, below: number, dropdownHeight = DROPDOWN_H): boolean {
  return below < dropdownHeight && above > below;
}

/** Nearest ancestor that scrolls (the edit/upload form), for room calculations. */
function scrollParent(el: HTMLElement): HTMLElement | null {
  let p = el.parentElement;
  while (p) {
    const oy = getComputedStyle(p).overflowY;
    if (oy === "auto" || oy === "scroll") return p;
    p = p.parentElement;
  }
  return null;
}

interface Props {
  values: string[];
  onChange: (values: string[]) => void;
  suggestions: string[];
  placeholder?: string;
}

/** Multi-value tag input with autocomplete and create-on-enter. */
export function TagInput({ values, onChange, suggestions, placeholder }: Props) {
  const [input, setInput] = useState("");
  const [focused, setFocused] = useState(false);
  const [openUp, setOpenUp] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const q = input.trim().toLowerCase();
    return suggestions
      .filter((s) => !values.some((v) => v.toLowerCase() === s.toLowerCase()))
      .filter((s) => (q ? s.toLowerCase().includes(q) : true))
      .slice(0, 8);
  }, [suggestions, values, input]);

  const add = (raw: string) => {
    const value = raw.trim();
    if (!value) return;
    if (!values.some((v) => v.toLowerCase() === value.toLowerCase())) {
      onChange([...values, value]);
    }
    setInput("");
  };

  const remove = (value: string) => onChange(values.filter((v) => v !== value));

  const onFocus = () => {
    setFocused(true);
    const el = inputRef.current;
    if (!el) return;
    // The dropdown is absolutely positioned and clipped by the scroll container
    // (edit/upload form). A bottom field (Tags) can't scroll far enough to fit it
    // below — so open it *upward* when there's more room above than below.
    const sp = scrollParent(el);
    const bounds = sp
      ? sp.getBoundingClientRect()
      : { top: 0, bottom: window.innerHeight };
    const r = el.getBoundingClientRect();
    const below = bounds.bottom - r.bottom;
    const above = r.top - bounds.top;
    setOpenUp(shouldOpenUp(above, below));
    // Nudge the field fully into view if it sits at the container's edge.
    requestAnimationFrame(() => el.scrollIntoView({ block: "nearest", behavior: "smooth" }));
  };

  return (
    <div className="relative">
      <div
        className="flex flex-wrap items-center gap-1.5 rounded-lg border border-border bg-surface-2 p-1.5 focus-within:border-accent"
        onClick={() => inputRef.current?.focus()}
      >
        {values.map((v) => (
          <span
            key={v}
            className="inline-flex items-center gap-1 rounded-md bg-accent/20 px-2 py-0.5 text-sm text-fg ring-1 ring-accent/30"
          >
            {v}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                remove(v);
              }}
              className="text-muted hover:text-fg"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onFocus={onFocus}
          onBlur={() => {
            // Commit whatever was typed but not yet Entered, so "type a name
            // then click Save" works without an explicit Enter first.
            if (input.trim()) add(input);
            setTimeout(() => setFocused(false), 120);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add(input);
            } else if (e.key === "Backspace" && !input && values.length) {
              remove(values[values.length - 1]);
            }
          }}
          placeholder={values.length === 0 ? placeholder : ""}
          className="min-w-[8ch] flex-1 bg-transparent px-1 py-0.5 text-sm outline-none placeholder:text-muted"
        />
      </div>

      {focused && (filtered.length > 0 || input.trim()) && (
        <div
          className={`absolute left-0 z-50 max-h-52 w-full overflow-y-auto rounded-lg border border-border bg-surface p-1 shadow-2xl ${
            openUp ? "bottom-full mb-1" : "top-full mt-1"
          }`}
        >
          {input.trim() &&
            !suggestions.some((s) => s.toLowerCase() === input.trim().toLowerCase()) && (
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => add(input)}
                className="flex w-full items-center gap-1.5 rounded-md px-2.5 py-1.5 text-left text-sm hover:bg-surface-2"
              >
                <span className="text-muted">Create</span>
                <span className="font-medium">“{input.trim()}”</span>
              </button>
            )}
          {filtered.map((s) => (
            <button
              key={s}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => add(s)}
              className="block w-full truncate rounded-md px-2.5 py-1.5 text-left text-sm hover:bg-surface-2"
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
