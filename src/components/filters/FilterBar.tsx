"use client";

import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useCreateBoard, useRenamePublisher } from "@/lib/client-api";
import { useFilters } from "@/lib/use-filters";
import { computeFacets, countActive, filtersActive } from "@/lib/filters";
import type { ComicDTO } from "@/lib/types";
import { useToast } from "@/components/ui/toast";
import { Dialog } from "@/components/ui/Dialog";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Filter, Layers, X } from "@/components/ui/icons";
import { MultiSelect } from "./MultiSelect";

interface Props {
  /** The current board's full comic list — drives facet options + counts. */
  boardComics: ComicDTO[];
  /** The comics currently visible (after filtering) — used by save-as-board. */
  visibleComics: ComicDTO[];
}

export function FilterBar({ boardComics, visibleComics }: Props) {
  const { filters, update, clear, toggle } = useFilters();
  const meta = useMemo(() => computeFacets(boardComics, filters), [boardComics, filters]);
  const active = filtersActive(filters);
  const n = countActive(filters);
  const renamePublisher = useRenamePublisher();
  const { toast } = useToast();
  const [sheetOpen, setSheetOpen] = useState(false);

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

      <div className="flex items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1 text-sm text-muted">
        <input
          type="date"
          value={filters.dateFrom ?? ""}
          onChange={(e) => update({ dateFrom: e.target.value || null })}
          className="bg-transparent text-fg outline-none [color-scheme:dark]"
          aria-label="Cover date from"
        />
        <span className="text-muted">→</span>
        <input
          type="date"
          value={filters.dateTo ?? ""}
          onChange={(e) => update({ dateTo: e.target.value || null })}
          className="bg-transparent text-fg outline-none [color-scheme:dark]"
          aria-label="Cover date to"
        />
      </div>
    </>
  );

  return (
    <div className="sticky top-[99px] z-20 border-b border-border bg-bg/70 backdrop-blur-xl">
      <div className="mx-auto flex max-w-[1800px] items-center gap-2 px-5 py-2.5">
        {/* Desktop: facets inline. */}
        <div className="hidden flex-wrap items-center gap-2 sm:flex">{facets}</div>

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

        <AnimatePresence>
          {active && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="flex items-center gap-2"
            >
              {/* Save-as-board is desktop-only chrome; it lives in the sheet on mobile. */}
              <div className="hidden sm:block">
                <SaveAsBoardButton visibleComics={visibleComics} />
              </div>
              <button
                onClick={clear}
                className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1.5 text-sm text-muted transition hover:text-fg"
              >
                <X className="h-3.5 w-3.5" />
                Clear{n > 0 ? ` (${n})` : ""}
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Active value chips */}
      <ActiveChips />

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
  const chips: { key: string; label: string; onRemove: () => void }[] = [];
  filters.publishers.forEach((v) =>
    chips.push({ key: `p-${v}`, label: v, onRemove: () => toggle("publishers", v) }),
  );
  filters.authors.forEach((v) =>
    chips.push({ key: `au-${v}`, label: v, onRemove: () => toggle("authors", v) }),
  );
  filters.artists.forEach((v) =>
    chips.push({ key: `a-${v}`, label: v, onRemove: () => toggle("artists", v) }),
  );
  filters.characters.forEach((v) =>
    chips.push({ key: `c-${v}`, label: v, onRemove: () => toggle("characters", v) }),
  );
  filters.tags.forEach((v) =>
    chips.push({ key: `t-${v}`, label: v, onRemove: () => toggle("tags", v) }),
  );
  if (filters.dateFrom)
    chips.push({
      key: "from",
      label: `from ${filters.dateFrom}`,
      onRemove: () => update({ dateFrom: null }),
    });
  if (filters.dateTo)
    chips.push({
      key: "to",
      label: `to ${filters.dateTo}`,
      onRemove: () => update({ dateTo: null }),
    });

  if (chips.length === 0) return null;

  return (
    <div className="mx-auto flex max-w-[1800px] flex-wrap gap-1.5 px-5 pb-2.5">
      <AnimatePresence initial={false}>
        {chips.map((c) => (
          <motion.button
            key={c.key}
            layout
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ type: "spring", stiffness: 500, damping: 40 }}
            onClick={c.onRemove}
            className="inline-flex items-center gap-1 rounded-full bg-accent/15 px-2.5 py-1 text-xs font-medium text-fg ring-1 ring-accent/30 transition hover:bg-accent/25"
          >
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
