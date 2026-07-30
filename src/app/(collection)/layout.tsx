import { Suspense } from "react";
import { CollectionChrome } from "@/components/board/CollectionChrome";

/**
 * Shared chrome (header + tab strip + upload modal) for the board, custom
 * boards and stats, so navigating between them swaps only `<main>` instead of
 * rebuilding the whole page. See `CollectionChrome` for why.
 *
 * A route group, so none of these URLs change. The `@modal` slot and its
 * `(.)comic/[id]` interceptor both stay at the root level and are unaffected.
 *
 * The Suspense boundary belongs here, not in each page: `CollectionChrome`
 * reads `useSearchParams` (via `useFilters`), which needs one.
 */
export default function CollectionLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense>
      <CollectionChrome>{children}</CollectionChrome>
    </Suspense>
  );
}
