"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useFilters } from "@/lib/use-filters";
import { TopBar } from "./TopBar";
import { BoardTabs } from "./BoardTabs";
import { UploadModal } from "@/components/upload/UploadModal";

/**
 * Persistent chrome for every collection view — the board, a custom board, and
 * the stats page.
 *
 * This lives in a layout rather than inside each page because it used to be the
 * other way round: `BoardView` and `StatsView` each rendered their own `TopBar`
 * and `BoardTabs`, so navigating between them tore the entire header and tab
 * strip down and built a fresh copy. Measured, the DOM node never survived a
 * transition — which is why moving between views looked like a full page
 * reload even though it was a client-side navigation the whole time (the JS
 * globals survived and no new navigation entry was created).
 *
 * Hoisting it also fixes the tab underline. `layoutId="active-tab"` animates
 * between two states only if both exist in one continuous Motion tree, and that
 * tree was being destroyed mid-navigation — so the underline popped instead of
 * sliding. Now only `<main>` swaps.
 */
export function CollectionChrome({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { filters, update } = useFilters();

  const boardId = pathname.startsWith("/board/") ? pathname.split("/")[2] : undefined;
  const onStats = pathname === "/stats";

  const [addOpen, setAddOpen] = useState(false);

  // Debounced search: type into local state, push to the URL after 150ms.
  // Moved here wholesale from BoardView, so it now survives navigating between
  // boards instead of resetting.
  const [searchInput, setSearchInput] = useState(filters.q);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Track the last value *this component* pushed to the URL, so the re-sync
  // below can tell "the URL changed because my own debounced update() finally
  // landed" (ignore — searchInput may already be ahead of it) apart from "the
  // URL changed externally" (back/forward, cleared filters — adopt it).
  // State, not a ref: this is read while rendering to decide whether to adopt
  // the URL's value, and a ref read during render isn't safe under concurrent
  // rendering (it can be a value from a render that got thrown away). It's only
  // ever written from an event handler, so it never cascades a render.
  const [pushedQ, setPushedQ] = useState(filters.q);
  // Re-sync when the URL's `q` changes from elsewhere. Adjusting state during
  // render — rather than in an effect — avoids a wasted render pass. See "You
  // Might Not Need an Effect" (React docs).
  const [prevQ, setPrevQ] = useState(filters.q);
  if (filters.q !== prevQ) {
    setPrevQ(filters.q);
    if (filters.q !== pushedQ) setSearchInput(filters.q);
  }

  const onSearch = (value: string) => {
    setSearchInput(value);
    // Nothing on the stats page responds to `q`, so don't write it to the URL
    // per keystroke there — the commit handler below hands off to the board.
    if (onStats) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setPushedQ(value);
      update({ q: value });
    }, 150);
  };

  // Picking a suggestion (or pressing Enter) is deliberate, not mid-typing, so
  // apply it at once — and drop any in-flight debounce, which would otherwise
  // land after this and overwrite it with whatever was half-typed.
  const onSearchCommit = (value: string) => {
    if (timer.current) clearTimeout(timer.current);
    setSearchInput(value);
    // Searching from stats means "go find these" — there's nothing here to
    // filter, so hand off to the board.
    if (onStats) {
      const q = value.trim();
      router.push(q ? `/?q=${encodeURIComponent(q)}` : "/");
      return;
    }
    setPushedQ(value);
    update({ q: value });
  };

  // Clear a pending debounce on unmount so a late update() can't fire after the
  // component is gone.
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  return (
    <div className="min-h-screen">
      <TopBar
        search={searchInput}
        onSearch={onSearch}
        onSearchCommit={onSearchCommit}
        onSearchSubmit={onSearchCommit}
        onAdd={() => setAddOpen(true)}
      />
      <BoardTabs activeBoardId={boardId} />
      <UploadModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        defaultBoardId={boardId}
      />
      {children}
    </div>
  );
}
