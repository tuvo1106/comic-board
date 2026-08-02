"use client";

import { useEffect, type RefObject } from "react";

/**
 * Publish a sticky bar's measured height to `<html>` as a CSS variable, so the
 * bars below it can pin themselves with `top: var(--…)` instead of a magic
 * number.
 *
 * The stack (top bar → board tabs → filter row → board toolbar) has four
 * members, each of which must sit exactly at the sum of the heights above it.
 * Hard-coding those offsets is what broke this before: the numbers were derived
 * from the wordmark's height, the search box later grew the header from 57px to
 * 63px, and the tab strip has been sliding 6px under it ever since. Nothing in
 * the type system or the tests can catch that drift — and the filter row's
 * facets wrap on narrow viewports, so no single constant is even correct across
 * widths. Measuring is the only version that stays true.
 *
 * Defaults for the first paint (before this effect runs) live in
 * `globals.css`; the variable is removed on unmount so a bar that isn't
 * rendered on a given route — the filter row is board-only — collapses to that
 * default rather than leaving a gap behind.
 */
export function useChromeHeight(ref: RefObject<HTMLElement | null>, cssVar: string) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const root = document.documentElement;
    const observer = new ResizeObserver(() => {
      root.style.setProperty(cssVar, `${el.getBoundingClientRect().height}px`);
    });
    observer.observe(el);
    return () => {
      observer.disconnect();
      root.style.removeProperty(cssVar);
    };
  }, [ref, cssVar]);
}
