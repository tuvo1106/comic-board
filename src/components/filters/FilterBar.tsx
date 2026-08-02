"use client";

import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { useCreateBoard, useRenamePublisher } from "@/lib/client-api";
import { useChromeHeight } from "@/lib/use-chrome-height";
import { useFilters } from "@/lib/use-filters";
import { activeChips, computeFacets, countActive, filtersActive } from "@/lib/filters";
import type { ComicDTO } from "@/lib/types";
import { useToast } from "@/components/ui/toast";
import { Dialog } from "@/components/ui/Dialog";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Filter, Layers, X } from "@/components/ui/icons";
import { MultiSelect } from "./MultiSelect";
import { DateRangeFilter } from "./DateRangeFilter";

interface Props {
  /** The current board's full comic list — drives facet options + counts. */
  boardComics: ComicDTO[];
  /** The comics currently visible (after filtering) — used by save-as-board. */
  visibleComics: ComicDTO[];
  /**
   * The board's own view controls (count, sort, columns, grid/list), pinned at
   * the right end of this row. They belong to the board, not to filtering, but
   * they're the same kind of control at the same altitude — a second sticky
   * band underneath just to hold them read as an extra layer of chrome.
   */
  trailing?: React.ReactNode;
}

export function FilterBar({ boardComics, visibleComics, trailing }: Props) {
  const { filters, update, clear, toggle } = useFilters();
  const meta = useMemo(() => computeFacets(boardComics, filters), [boardComics, filters]);
  const active = filtersActive(filters);
  const n = countActive(filters);
  const renamePublisher = useRenamePublisher();
  const { toast } = useToast();
  const [sheetOpen, setSheetOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useChromeHeight(ref, "--h-filters");

  // The facet controls, shared between the inline desktop bar and the mobile
  // bottom sheet. Rendered twice; each instance keeps its own dropdown state.
  const facets = (
    <>
      <MultiSelect
        label="Publisher"
        options={meta.publishers ?? []}
        selected={filters.publishers}
        onToggle={(v) => toggle("publishers", v)}
        onRename={(from, to) =>
          renamePublisher.mutate(
            { from, to },
            {
              onSuccess: () => {
                // A selected filter chip still holds the old name; move it over.
                if (filters.publishers.includes(from)) {
                  toggle("publishers", from);
                  toggle("publishers", to);
                }
                toast(`Renamed “${from}” to “${to}”`, "success");
              },
              onError: (e) => toast((e as Error).message, "error"),
            },
          )
        }
      />
      <MultiSelect
        label="Author"
        options={meta.authors ?? []}
        selected={filters.authors}
        onToggle={(v) => toggle("authors", v)}
      />
      <MultiSelect
        label="Cover Artist"
        options={meta.artists ?? []}
        selected={filters.artists}
        onToggle={(v) => toggle("artists", v)}
      />
      <MultiSelect
        label="Character"
        options={meta.characters ?? []}
        selected={filters.characters}
        onToggle={(v) => toggle("characters", v)}
      />
      <MultiSelect
        label="Tag"
        options={meta.tags ?? []}
        selected={filters.tags}
        onToggle={(v) => toggle("tags", v)}
      />

      {/* Last among the facets: unlike the others it isn't a name you'd search
          for, and the stats histogram links straight into it. */}
      <MultiSelect
        label="Rating"
        options={meta.ratings}
        selected={filters.ratings}
        onToggle={(v) => toggle("ratings", v)}
      />

      <DateRangeFilter from={filters.dateFrom} to={filters.dateTo} onChange={update} />
    </>
  );

  return (
    <div
      ref={ref}
      className="sticky top-[var(--top-filters)] z-20 border-b border-border bg-bg/70 backdrop-blur-xl"
    >
      {/*
        `items-start`, not `items-center`: every control in this row is the same
        34px pill, so on one line the two read identically — but when the facets
        wrap on a narrow viewport, the view controls stay level with the first
        row of them instead of drifting to the middle of a double-height block.
      */}
      <div className="mx-auto flex max-w-[1800px] items-start gap-3 px-5 py-2.5">
        {/*
          Always on — this is "how much is on the board right now," not a
          filter-only readout, and it needs to answer that whether or not
          anything is filtered. It briefly lived only in the active-chips row
          as "5 of 25 covers", which looked nicer while filtering but meant
          there was no count at all the rest of the time — a real loss, not
          just a missed test (the integration suite's `coverCount()` reads
          this exact "N covers" text everywhere from "board loaded" to
          "drill-through landed on the right subset").
        */}
        <p className="flex-shrink-0 whitespace-nowrap pt-2 text-xs text-muted">
          {visibleComics.length} {visibleComics.length === 1 ? "cover" : "covers"}
        </p>

        {/* Desktop: facets inline. */}
        <div className="hidden min-w-0 flex-wrap items-center gap-2 sm:flex">{facets}</div>

        {/* Mobile: one button that opens the facets in a bottom sheet. */}
        <button
          onClick={() => setSheetOpen(true)}
          className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition sm:hidden ${
            active
              ? "border-accent/50 bg-accent/15 text-fg"
              : "border-border bg-surface text-muted hover:text-fg"
          }`}
        >
          <Filter className="h-3.5 w-3.5" />
          Filters
          {n > 0 && (
            <span className="grid h-5 min-w-5 place-items-center rounded-full bg-accent px-1 text-xs font-bold text-accent-fg">
              {n}
            </span>
          )}
        </button>

        <div className="flex-1" />

        {trailing && (
          <>
            {/* Same device the tab strip uses to separate boards from Stats:
                these are controls of the same weight, but a different job. */}
            <div aria-hidden className="mx-1 mt-[7px] hidden h-5 w-px flex-shrink-0 bg-border sm:block" />
            {trailing}
          </>
        )}
      </div>

      {/*
        Active filters get their own row: the chips, and the two actions that
        only exist while something is filtered. Those actions used to sit up in
        the facet row, where their ~245px appearing mid-session wrapped `Date`
        onto a second line and left the view controls floating against a
        double-height row. Down here the facet row keeps one stable line, and
        the actions sit next to the chips they act on.
      */}
      {active && (
        <div className="mx-auto flex max-w-[1800px] items-center gap-2 px-5 pb-2.5">
          <ActiveChips />
          <div className="flex-1" />
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-shrink-0 items-center gap-2"
          >
            {/* Save-as-board is desktop-only chrome; it lives in the sheet on mobile. */}
            <div className="hidden sm:block">
              <SaveAsBoardButton visibleComics={visibleComics} />
            </div>
            <button
              onClick={clear}
              className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-border px-3 py-1.5 text-sm text-muted transition hover:text-fg"
            >
              <X className="h-3.5 w-3.5" />
              Clear{n > 0 ? ` (${n})` : ""}
            </button>
          </motion.div>
        </div>
      )}

      <BottomSheet open={sheetOpen} onClose={() => setSheetOpen(false)} title="Filters">
        <div className="flex flex-col items-start gap-4 p-5">
          {facets}
          <div className="mt-1 flex w-full items-center gap-2 border-t border-border pt-4">
            <SaveAsBoardButton visibleComics={visibleComics} />
            {active && (
              <button
                onClick={clear}
                className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1.5 text-sm text-muted transition hover:text-fg"
              >
                <X className="h-3.5 w-3.5" />
                Clear ({n})
              </button>
            )}
          </div>
        </div>
      </BottomSheet>
    </div>
  );
}

function ActiveChips() {
  const { filters, toggle, update } = useFilters();
  const chips = activeChips(filters);

  if (chips.length === 0) return null;

  return (
    <div className="flex min-w-0 flex-wrap gap-1.5">
      <AnimatePresence initial={false}>
        {chips.map((c) => (
          <motion.button
            key={c.key}
            layout
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ type: "spring", stiffness: 500, damping: 40 }}
            onClick={() =>
              c.remove.type === "toggle"
                ? toggle(c.remove.key, c.remove.value)
                : update({ [c.remove.field]: null })
            }
            className="inline-flex items-center gap-1 rounded-full bg-accent/15 px-2.5 py-1 text-xs font-medium text-fg ring-1 ring-accent/30 transition hover:bg-accent/25"
          >
            <span className="font-normal text-muted">{c.facet}:</span>
            {c.label}
            <X className="h-3 w-3 text-muted" />
          </motion.button>
        ))}
      </AnimatePresence>
    </div>
  );
}

function SaveAsBoardButton({ visibleComics }: { visibleComics: ComicDTO[] }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const createBoard = useCreateBoard();
  const router = useRouter();
  const { toast } = useToast();

  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    try {
      const board = await createBoard.mutateAsync({
        name: trimmed,
        comicIds: visibleComics.map((c) => c.id),
      });
      setOpen(false);
      setName("");
      toast(`Saved “${board.name}” with ${board.count} covers`, "success");
      router.push(`/board/${board.id}`);
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-3 py-1.5 text-sm font-medium text-fg ring-1 ring-border transition hover:bg-surface-2/70"
      >
        <Layers className="h-3.5 w-3.5" />
        Save as board…
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Save view as a board">
        <div className="p-5">
          <p className="mb-3 text-sm text-muted">
            Snapshots the {visibleComics.length} covers currently shown into a new board. It’s a
            copy — future uploads won’t be added automatically.
          </p>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && save()}
            placeholder="Board name"
            className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <div className="mt-4 flex justify-end gap-2">
            <button
              onClick={() => setOpen(false)}
              className="rounded-lg px-3 py-2 text-sm text-muted transition hover:text-fg"
            >
              Cancel
            </button>
            <button
              onClick={save}
              disabled={!name.trim() || createBoard.isPending}
              className="rounded-lg bg-accent px-3.5 py-2 text-sm font-semibold text-accent-fg transition hover:brightness-110 disabled:opacity-50"
            >
              {createBoard.isPending ? "Saving…" : "Create board"}
            </button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
