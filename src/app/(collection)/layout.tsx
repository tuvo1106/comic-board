import { Suspense } from "react";
import { CollectionChrome } from "@/components/board/CollectionChrome";

/**
 * Shared chrome for the board, custom boards and stats, so navigating between
 * them swaps only `<main>` — see `CollectionChrome`.
 *
 * A route group, so no URL changes and the root-level `@modal` interceptor is
 * unaffected. The Suspense boundary belongs here because `CollectionChrome`
 * reads `useSearchParams`.
 */
export default function CollectionLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense>
      <CollectionChrome>{children}</CollectionChrome>
    </Suspense>
  );
}
