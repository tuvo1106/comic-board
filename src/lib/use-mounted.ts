"use client";

import { useSyncExternalStore } from "react";

const emptySubscribe = () => () => {};

/**
 * Returns `false` during SSR and the first client render, then `true` once
 * mounted. Uses `useSyncExternalStore` (rather than a `setState` in an effect)
 * so it never triggers a cascading render — the getServerSnapshot/getSnapshot
 * split is what React uses to reconcile the hydration boundary.
 *
 * Use this to gate client-only work such as portals to `document.body`.
 */
export function useMounted(): boolean {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
}
