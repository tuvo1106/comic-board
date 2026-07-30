"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useFilters } from "@/lib/use-filters";
import { TopBar } from "./TopBar";
import { BoardTabs } from "./BoardTabs";
import { UploadModal } from "@/components/upload/UploadModal";

/**
 * Persistent header, tab strip and upload modal for every collection view —
 * the board, a custom board, and stats.
 *
 * **Must stay in the layout, not in each page.** Rendering it per-page rebuilds
 * the whole header on every navigation (which reads as a full page reload) and
 * destroys the Motion tree `layoutId="active-tab"` needs, so the tab underline
 * pops instead of sliding. See `ENGINEERING_NOTES.md`.
 */
export function CollectionChrome({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { filters, update } = useFilters();

  const boardId = pathname.startsWith("/board/") ? pathname.split("/")[2] : undefined;
  const onStats = pathname === "/stats";

  const [addOpen, setAddOpen] = useState(false);

  // Debounced search: type into local state, push to the URL after 150ms.
  const [searchInput, setSearchInput] = useState(filters.q);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The last value *this* component pushed, so the re-sync below can tell its
  // own debounced update() landing (ignore — searchInput is already ahead) from
  // the URL changing externally (back/forward, cleared filters — adopt it).
  // State rather than a ref because it's read during render, which a ref isn't
  // safe for under concurrent rendering; only ever written from a handler, so
  // it never cascades a render.
  const [pushedQ, setPushedQ] = useState(filters.q);
  // Adjusted during render rather than in an effect, which would cost a wasted
  // pass ("You Might Not Need an Effect", React docs).
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
