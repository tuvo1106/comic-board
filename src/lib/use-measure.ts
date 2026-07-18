"use client";

import { useCallback, useRef, useState } from "react";

/**
 * Track an element's content width via ResizeObserver, using a callback ref so
 * it always observes the *current* node. This matters because the board can
 * swap the masonry container in and out of a drag wrapper when filtering
 * toggles; a plain effect-based observer would keep watching the detached old
 * node (reporting width 0) and never measure the new one.
 */
export function useMeasureWidth<T extends HTMLElement>() {
  const [width, setWidth] = useState(0);
  const observerRef = useRef<ResizeObserver | null>(null);

  const ref = useCallback((node: T | null) => {
    observerRef.current?.disconnect();
    observerRef.current = null;
    if (node) {
      setWidth(node.clientWidth);
      const ro = new ResizeObserver(() => setWidth(node.clientWidth));
      ro.observe(node);
      observerRef.current = ro;
    }
  }, []);

  return { ref, width };
}
