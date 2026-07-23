"use client";

import { useCallback, useSyncExternalStore } from "react";

const KEY = "comic-board:columns";
const EVENT = "comic-board:columns-change";

/** null = auto (responsive by width); a number = user-pinned column count. */
export type ColumnPref = number | null;

function subscribe(cb: () => void): () => void {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

function getSnapshot(): ColumnPref {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw && raw !== "auto") {
      const n = parseInt(raw, 10);
      if (Number.isFinite(n)) return n;
    }
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * Column-count preference, persisted in localStorage. Reports `null` (auto) on
 * the server / first paint to avoid a hydration mismatch, then reads storage on
 * the client via `getSnapshot`.
 */
export function useColumns(): [ColumnPref, (v: ColumnPref) => void] {
  const pref = useSyncExternalStore(subscribe, getSnapshot, () => null);

  const set = useCallback((v: ColumnPref) => {
    try {
      localStorage.setItem(KEY, v == null ? "auto" : String(v));
    } catch {
      /* ignore */
    }
    window.dispatchEvent(new Event(EVENT));
  }, []);

  return [pref, set];
}
