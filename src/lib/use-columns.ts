"use client";

import { useEffect, useState } from "react";

const KEY = "comic-board:columns";

/** null = auto (responsive by width); a number = user-pinned column count. */
export type ColumnPref = number | null;

/**
 * Column-count preference, persisted in localStorage. Starts as `null` (auto)
 * on the server / first paint to avoid hydration mismatch, then hydrates from
 * storage after mount.
 */
export function useColumns(): [ColumnPref, (v: ColumnPref) => void] {
  const [pref, setPref] = useState<ColumnPref>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw === "auto") setPref(null);
      else if (raw) {
        const n = parseInt(raw, 10);
        if (Number.isFinite(n)) setPref(n);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const set = (v: ColumnPref) => {
    setPref(v);
    try {
      localStorage.setItem(KEY, v == null ? "auto" : String(v));
    } catch {
      /* ignore */
    }
  };

  return [pref, set];
}
