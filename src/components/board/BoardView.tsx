"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { keys, useComics, useUpdatePosition } from "@/lib/client-api";
import { useFilters } from "@/lib/use-filters";
import { applyFilters, filtersActive } from "@/lib/filters";
import { navOrder } from "@/lib/nav-order";
import { useColumns } from "@/lib/use-columns";
import { useSort } from "@/lib/use-sort";
import { useView } from "@/lib/use-view";
import { sortComics } from "@/lib/sort";
import type { ComicDTO } from "@/lib/types";
import { FilterBar } from "@/components/filters/FilterBar";
import { Masonry } from "./Masonry";
import { ListView } from "./ListView";
import { TopBar } from "./TopBar";
import { BoardTabs } from "./BoardTabs";
import { ComicCardMenu } from "./ComicCardMenu";
import { ColumnSelector } from "./ColumnSelector";
import { SortSelector } from "./SortSelector";
import { ViewToggle } from "./ViewToggle";
import { UploadModal } from "@/components/upload/UploadModal";
import { ImageIcon } from "@/components/ui/icons";
import type { ReorderResult } from "./Masonry";

/**
 * The board experience for one tab. `boardId` undefined = the virtual
 * "My Comics" board (all comics). Tabs, upload, and drag are layered on later.
 */
export function BoardView({ boardId }: { boardId?: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { filters, update, clear } = useFilters();
  // My Comics defaults to cover date; custom boards default to their manual
  // (drag) order.
  const { field: sortField, dir: sortDir, setSort } = useSort(
    boardId ? "manual" : "coverDate",
  );
  const { data: comics, isLoading, isError, error } = useComics(boardId ?? null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [columns, setColumns] = useColumns();
  const [view, setView] = useView();
  const qc = useQueryClient();
  const updatePosition = useUpdatePosition();

  const onReorder = ({ movedId, newPosition }: ReorderResult) => {
    // Update just the moved comic's position and re-sort. This is correct even
    // while filtered — the new position sits between the visible neighbours, and
    // hidden (filtered-out) comics keep their positions instead of being dropped.
    const key = keys.comics(boardId ?? null);
    qc.setQueryData<ComicDTO[]>(key, (old) => {
      if (!old) return old;
      return old
        .map((c) => (c.id === movedId ? { ...c, position: newPosition } : c))
        .sort((a, b) => a.position - b.position);
    });
    updatePosition.mutate({ id: movedId, position: newPosition, boardId: boardId ?? null });
  };

  // Debounced search: type into local state, push to the URL after 150ms.
  const [searchInput, setSearchInput] = useState(filters.q);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => setSearchInput(filters.q), [filters.q]);
  const onSearch = (value: string) => {
    setSearchInput(value);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => update({ q: value }), 150);
  };

  const filtered = useMemo(
    () => (comics ? sortComics(applyFilters(comics, filters), sortField, sortDir) : []),
    [comics, filters, sortField, sortDir],
  );
  const isFiltering = filtersActive(filters);

  // Open the detail modal for a comic (shared by grid + list views): record the
  // visible order for ←/→ nav, prime the detail cache so it renders instantly,
  // and carry the board's filter/sort query so the board underneath is stable.
  const openComic = (c: ComicDTO) => {
    navOrder.set(filtered.map((x) => x.id));
    for (const x of filtered) qc.setQueryData(keys.comic(x.id), x);
    const qs = searchParams.toString();
    // scroll:false — the modal is a fixed overlay; without this Next scrolls the
    // board underneath to the modal's DOM position (the bottom of the page).
    router.push(`/comic/${c.id}${qs ? `?${qs}` : ""}`, { scroll: false });
  };

  return (
    <div className="min-h-screen">
      <TopBar search={searchInput} onSearch={onSearch} onUpload={() => setUploadOpen(true)} />
      <BoardTabs activeBoardId={boardId} />
      <FilterBar boardComics={comics ?? []} visibleComics={filtered} />
      <UploadModal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        defaultBoardId={boardId}
      />

      <main className="mx-auto max-w-[1800px] px-5 py-6">
        {comics && comics.length > 0 && (
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="text-xs text-muted">
              {filtered.length} {filtered.length === 1 ? "cover" : "covers"}
            </p>
            <div className="flex items-center gap-2">
              {/* List view sorts via its column headers, so the dropdown is grid-only. */}
              {view === "grid" && (
                <>
                  <SortSelector field={sortField} dir={sortDir} onSelect={setSort} />
                  <ColumnSelector value={columns} onChange={setColumns} />
                </>
              )}
              <ViewToggle value={view} onChange={setView} />
            </div>
          </div>
        )}
        {isLoading && <BoardSkeleton />}
        {isError && (
          <p className="py-20 text-center text-danger">
            {(error as Error)?.message ?? "Failed to load comics"}
          </p>
        )}
        {comics && comics.length === 0 && <EmptyBoard />}
        {comics && comics.length > 0 && filtered.length === 0 && (
          <NoMatches onClear={clear} />
        )}
        {filtered.length > 0 &&
          (view === "list" ? (
            <ListView
              comics={filtered}
              currentBoardId={boardId}
              onOpen={openComic}
              sortField={sortField}
              sortDir={sortDir}
              onSort={setSort}
            />
          ) : (
            <Masonry
              comics={filtered}
              columns={columns}
              stagger={!isFiltering}
              draggable={sortField === "manual"}
              onReorder={onReorder}
              onOpen={openComic}
              renderMenu={(c: ComicDTO) => (
                <ComicCardMenu comic={c} currentBoardId={boardId} />
              )}
            />
          ))}
      </main>
    </div>
  );
}

function BoardSkeleton() {
  const heights = [280, 340, 300, 360, 290, 330, 310, 350, 300, 320, 280, 340];
  return (
    <div className="columns-2 gap-4 sm:columns-3 lg:columns-4 xl:columns-5">
      {heights.map((h, i) => (
        <div
          key={i}
          className="mb-4 w-full animate-pulse rounded-[var(--radius-card)] bg-surface-2"
          style={{ height: h }}
        />
      ))}
    </div>
  );
}

function EmptyBoard() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-32 text-center">
      <div className="grid h-16 w-16 place-items-center rounded-2xl bg-surface-2 text-muted">
        <ImageIcon className="h-8 w-8" />
      </div>
      <div>
        <p className="text-lg font-semibold">No covers yet</p>
        <p className="mt-1 text-sm text-muted">Upload your first comic cover to get started.</p>
      </div>
    </div>
  );
}

function NoMatches({ onClear }: { onClear: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-32 text-center">
      <p className="text-lg font-semibold">No covers match</p>
      <button
        onClick={onClear}
        className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-fg transition hover:brightness-110"
      >
        Clear filters
      </button>
    </div>
  );
}
