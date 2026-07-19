"use client";

import { useEffect, useState } from "react";

export type BoardViewMode = "grid" | "list";

const KEY = "comic-board:view";

/** Grid/list view preference, persisted in localStorage. */
export function useView(): [BoardViewMode, (v: BoardViewMode) => void] {
  const [view, setView] = useState<BoardViewMode>("grid");

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw === "grid" || raw === "list") setView(raw);
    } catch {
      /* ignore */
    }
  }, []);

  const set = (v: BoardViewMode) => {
    setView(v);
    try {
      localStorage.setItem(KEY, v);
    } catch {
      /* ignore */
    }
  };

  return [view, set];
}
