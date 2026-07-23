"use client";

import { useCallback, useSyncExternalStore } from "react";

export type BoardViewMode = "grid" | "list";

const KEY = "comic-board:view";
const EVENT = "comic-board:view-change";

function subscribe(cb: () => void): () => void {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

function getSnapshot(): BoardViewMode {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === "grid" || raw === "list") return raw;
  } catch {
    /* ignore */
  }
  return "grid";
}

/** Grid/list view preference, persisted in localStorage. */
export function useView(): [BoardViewMode, (v: BoardViewMode) => void] {
  const view = useSyncExternalStore(subscribe, getSnapshot, (): BoardViewMode => "grid");

  const set = useCallback((v: BoardViewMode) => {
    try {
      localStorage.setItem(KEY, v);
    } catch {
      /* ignore */
    }
    window.dispatchEvent(new Event(EVENT));
  }, []);

  return [view, set];
}
