"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMeta, useUpdateComic } from "@/lib/client-api";
import type { ComicDTO } from "@/lib/types";
import type { SortDir, SortField } from "@/lib/sort";
import { Autocomplete } from "@/components/ui/Autocomplete";
import { StarRating } from "@/components/ui/StarRating";
import { TagInput } from "@/components/ui/TagInput";
import { ArrowDown, ArrowUp, Check, ChevronsUpDown, Minus } from "@/components/ui/icons";
import { BulkActionBar } from "./BulkActionBar";
import { ComicCardMenu } from "./ComicCardMenu";

const COLS =
  "grid-cols-[28px_44px_minmax(150px,1.5fr)_56px_minmax(90px,0.8fr)_128px_minmax(120px,1fr)_minmax(120px,1fr)_minmax(120px,1fr)_96px_140px_36px]";

interface Props {
  comics: ComicDTO[];
  currentBoardId?: string;
  onOpen: (comic: ComicDTO) => void;
  sortField: SortField;
  sortDir: SortDir;
  onSort: (field: SortField) => void;
}

/**
 * The list/table view of a board — every field editable in place, sortable
 * column headers, and (unlike the virtualized grid) every row always mounted,
 * which is what makes shift-click range-select straightforward here.
 */
export function ListView({ comics, currentBoardId, onOpen, sortField, sortDir, onSort }: Props) {
  const { data: meta } = useMeta();
  const suggestions = {
    authors: (meta?.authors ?? []).map((a) => a.value),
    artists: (meta?.artists ?? []).map((a) => a.value),
    tags: (meta?.tags ?? []).map((t) => t.value),
    publishers: (meta?.publishers ?? []).map((p) => p.value),
  };

  const sortProps = { active: sortField, dir: sortDir, onSort };

  // Multi-select, list-view only for now. A plain Set (not derived from
  // props) so selection survives a re-render triggered by the row's own
  // edits; `selected` below prunes ids that fall out of the current
  // (possibly re-filtered/re-sorted) `comics` list.
  const [rawSelected, setRawSelected] = useState<Set<string>>(new Set());
  const [anchorIndex, setAnchorIndex] = useState<number | null>(null);
  const selected = useMemo(() => {
    const ids = new Set(comics.map((c) => c.id));
    return new Set([...rawSelected].filter((id) => ids.has(id)));
  }, [rawSelected, comics]);

  const toggleOne = (id: string, index: number, extendRange: boolean) => {
    setRawSelected((prev) => {
      const next = new Set(prev);
      if (extendRange && anchorIndex != null) {
        const [lo, hi] = [Math.min(anchorIndex, index), Math.max(anchorIndex, index)];
        for (let i = lo; i <= hi; i++) next.add(comics[i].id);
      } else if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
    setAnchorIndex(index);
  };

  const toggleAll = () => {
    setRawSelected((prev) => (prev.size === comics.length ? new Set() : new Set(comics.map((c) => c.id))));
  };

  const clearSelection = () => setRawSelected(new Set());

  return (
    <div className="space-y-3">
      {selected.size > 0 && (
        <BulkActionBar
          comics={comics}
          selectedIds={selected}
          currentBoardId={currentBoardId}
          suggestions={suggestions}
          onClear={clearSelection}
          onDone={clearSelection}
        />
      )}
      {/*
        The bounded height is what makes the sticky header work at all, not a
        style choice. `overflow-x-auto` forces overflow-y to `auto` as well
        (CSS computes a `visible` axis to `auto` when its partner isn't), so
        this box is already a scroll container — but with auto height it never
        scrolls vertically, and a sticky child of a container that never scrolls
        never moves. Giving it a real height makes it the scrollport the header
        sticks to. The height clears the app chrome above via `--h-chrome`
        (top bar + tabs + filter row, measured — see `use-chrome-height.ts`).
      */}
      <div
        data-list-table
        // The second figure covers the bulk action bar, which renders in normal
        // flow directly above this box. Without it, selecting a row pushed the
        // table's bottom edge below the viewport and the page grew a second
        // scrollbar outside the one the sticky header is anchored to. The 48px
        // is `main`'s own vertical padding.
        className={`${
          selected.size > 0
            ? "max-h-[calc(100vh-var(--h-chrome)-110px)]"
            : "max-h-[calc(100vh-var(--h-chrome)-48px)]"
        } overflow-auto rounded-xl border border-border`}
      >
        <div className="min-w-[900px]">
          {/* Header */}
          <div
            className={`sticky top-0 z-10 grid ${COLS} gap-2 border-b border-border bg-surface px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted`}
          >
            <HeaderCheckbox
              checked={selected.size > 0 && selected.size === comics.length}
              indeterminate={selected.size > 0 && selected.size < comics.length}
              onChange={toggleAll}
            />
            <span />
            <SortHeader field="series" label="Series" {...sortProps} />
            <SortHeader field="issue" label="#" {...sortProps} />
            <SortHeader field="publisher" label="Publisher" {...sortProps} />
            <SortHeader field="coverDate" label="Cover date" {...sortProps} />
            <span>Author</span>
            <span>Cover Artist</span>
            <span>Tags</span>
            <SortHeader field="size" label="Size" {...sortProps} />
            <SortHeader field="rating" label="Rating" {...sortProps} />
            <span />
          </div>
          {comics.map((c, i) => (
            <Row
              key={c.id}
              comic={c}
              currentBoardId={currentBoardId}
              onOpen={() => onOpen(c)}
              suggestions={suggestions}
              selected={selected.has(c.id)}
              onToggleSelect={(extendRange) => toggleOne(c.id, i, extendRange)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

/** Custom tri-state checkbox (checked/indeterminate/unchecked), matching the
 *  boxed-check visual used elsewhere (AuthForm, BoardMembershipList). Sets
 *  `.indeterminate` on the real (visually hidden) input for a11y, since
 *  that's DOM-property-only — no HTML attribute for it. */
function HeaderCheckbox({
  checked,
  indeterminate,
  onChange,
}: {
  checked: boolean;
  indeterminate: boolean;
  onChange: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);

  return (
    <label className="flex cursor-pointer items-center justify-center">
      <span
        className={`grid h-4 w-4 place-items-center rounded border transition ${
          checked || indeterminate ? "border-accent bg-accent text-accent-fg" : "border-border"
        }`}
      >
        {checked && <Check className="h-3 w-3" />}
        {!checked && indeterminate && <Minus className="h-3 w-3" />}
      </span>
      <input
        ref={ref}
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="sr-only"
        aria-label="Select all rows"
      />
    </label>
  );
}

function RowCheckbox({
  checked,
  onToggle,
}: {
  checked: boolean;
  onToggle: (extendRange: boolean) => void;
}) {
  return (
    <label
      className="flex cursor-pointer select-none items-center justify-center"
      onClick={(e) => e.stopPropagation()}
      // Shift+click near any selectable text (every other cell in the row)
      // can make the browser start extending a text selection instead of
      // delivering a normal click — that gesture begins at mousedown, so
      // preventDefault has to happen here, not (only) in onClick.
      onMouseDown={(e) => e.preventDefault()}
    >
      <span
        className={`grid h-4 w-4 place-items-center rounded border transition ${
          checked ? "border-accent bg-accent text-accent-fg" : "border-border"
        }`}
      >
        {checked && <Check className="h-3 w-3" />}
      </span>
      <input
        type="checkbox"
        checked={checked}
        readOnly
        onClick={(e) => {
          // Controlled via state, not native toggling — and onClick (not
          // onChange) is what reliably carries a real MouseEvent's shiftKey.
          e.preventDefault();
          onToggle(e.shiftKey);
        }}
        className="sr-only"
        aria-label="Select row"
      />
    </label>
  );
}

function SortHeader({
  field,
  label,
  active,
  dir,
  onSort,
}: {
  field: SortField;
  label: string;
  active: SortField;
  dir: SortDir;
  onSort: (field: SortField) => void;
}) {
  const isActive = active === field;
  const Arrow = dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <button
      onClick={() => onSort(field)}
      className={`group inline-flex items-center gap-1 truncate text-left uppercase tracking-wide transition hover:text-fg ${
        isActive ? "text-fg" : ""
      }`}
      title={`Sort by ${label}`}
    >
      <span className="truncate">{label}</span>
      {isActive ? (
        <Arrow className="h-3 w-3 shrink-0" />
      ) : (
        // Faint neutral glyph on hover marks this header as sortable (the plain
        // Author/Cover Artist/Tags headers stay bare). Once a column is active it
        // shows the real asc/desc arrow instead.
        <ChevronsUpDown className="h-3 w-3 shrink-0 opacity-0 transition group-hover:opacity-40" />
      )}
    </button>
  );
}

function Row({
  comic,
  currentBoardId,
  onOpen,
  suggestions,
  selected,
  onToggleSelect,
}: {
  comic: ComicDTO;
  currentBoardId?: string;
  onOpen: () => void;
  suggestions: { authors: string[]; artists: string[]; tags: string[]; publishers: string[] };
  selected: boolean;
  onToggleSelect: (extendRange: boolean) => void;
}) {
  const update = useUpdateComic();
  const save = (patch: Parameters<typeof update.mutate>[0]["patch"]) =>
    update.mutate({ id: comic.id, patch });

  return (
    <div
      className={`group/row grid ${COLS} items-center gap-2 border-b border-border px-3 py-1.5 text-sm transition hover:bg-surface/50 ${
        selected ? "bg-accent/5" : ""
      }`}
    >
      <RowCheckbox checked={selected} onToggle={onToggleSelect} />
      <button onClick={onOpen} className="group relative h-12 w-9 overflow-hidden rounded ring-1 ring-white/10">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={comic.thumbUrl}
          alt={comic.series}
          className="h-full w-full object-cover"
          loading="lazy"
          style={{ backgroundImage: `url(${comic.blurDataUrl})`, backgroundSize: "cover" }}
        />
      </button>

      <EditText value={comic.series} placeholder="Series" onCommit={(v) => save({ series: v.trim() || comic.series })} />
      <EditText value={comic.issueNumber ?? ""} placeholder="—" onCommit={(v) => save({ issueNumber: v.trim() || null })} />
      <EditPublisher
        value={comic.publisher ?? ""}
        suggestions={suggestions.publishers}
        onCommit={(v) => save({ publisher: v.trim() || null })}
      />
      <EditDate value={comic.coverDate} onCommit={(v) => save({ coverDate: v || null })} />

      <EditTags values={comic.authors} suggestions={suggestions.authors} placeholder="—" onCommit={(v) => save({ authors: v })} />
      <EditTags values={comic.artists} suggestions={suggestions.artists} placeholder="—" onCommit={(v) => save({ artists: v })} />
      <EditTags values={comic.tags} suggestions={suggestions.tags} placeholder="—" onCommit={(v) => save({ tags: v })} />

      <SizeCell comic={comic} />

      <RatingCell value={comic.rating} onChange={(rating) => save({ rating })} />

      <ComicCardMenu comic={comic} currentBoardId={currentBoardId} />
    </div>
  );
}

/**
 * Stored pixel dimensions — read-only, unlike every other cell here, because
 * they're a property of the file rather than metadata you can type.
 *
 * Earns a column because it's the one thing that tells you whether a cover is
 * worth upscaling, and scanning for that in a 400-cover collection is a list-view
 * job. Sortable ascending by total pixels, so "smallest first" surfaces the
 * candidates directly.
 *
 * Dimmed below 1000px wide: roughly where a cover stops filling the detail
 * view's ~960 retina pixels and starts looking soft. A hint, not a verdict —
 * the number is right there to judge for yourself.
 */
function SizeCell({ comic }: { comic: ComicDTO }) {
  const small = comic.width < 1000;
  return (
    <div className="flex min-w-0 items-center gap-1 px-1 py-1 text-xs">
      <span className={small ? "text-muted" : "text-fg"}>
        {comic.width}×{comic.height}
      </span>
      {comic.upscaled && (
        <span title="Upscaled — can be reverted from the detail view" className="text-accent">
          ↑
        </span>
      )}
    </div>
  );
}

/** Rating cell for a list row. Rated comics always show their stars. Unrated
 *  rows stay quiet at rest — a single muted dot instead of five empty outlines —
 *  and reveal the settable stars only when the row is hovered or focused (TODO
 *  item 17 / DR#3c). */
function RatingCell({ value, onChange }: { value: number | null; onChange: (v: number | null) => void }) {
  if (value != null) {
    return <StarRating value={value} size={16} onChange={onChange} />;
  }
  return (
    <div>
      <span
        className="text-muted group-hover/row:hidden group-focus-within/row:hidden"
        aria-hidden
      >
        ·
      </span>
      <div className="hidden group-hover/row:block group-focus-within/row:block">
        <StarRating value={null} size={16} onChange={onChange} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inline editable cells
// ---------------------------------------------------------------------------

function EditText({
  value,
  placeholder,
  onCommit,
}: {
  value: string;
  placeholder: string;
  onCommit: (v: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  if (!editing) {
    return (
      <button
        onClick={() => {
          setDraft(value);
          setEditing(true);
        }}
        className="truncate rounded px-1 py-1 text-left hover:bg-surface-2"
        title="Click to edit"
      >
        {value || <span className="text-muted">{placeholder}</span>}
      </button>
    );
  }
  return (
    <input
      autoFocus
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        setEditing(false);
        if (draft !== value) onCommit(draft);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          setDraft(value);
          setEditing(false);
        }
      }}
      className="w-full rounded border border-accent bg-surface-2 px-1 py-1 outline-none"
    />
  );
}

/** Inline publisher cell: click-to-edit text with an autocomplete dropdown of
 *  known publishers. Free text is still allowed for new ones. Delegates the
 *  input + dropdown to the shared Autocomplete, adding the click-to-edit shell
 *  and commit-on-blur/Enter semantics. */
function EditPublisher({
  value,
  suggestions,
  onCommit,
}: {
  value: string;
  suggestions: string[];
  onCommit: (v: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  const commit = (v: string) => {
    setEditing(false);
    if (v !== value) onCommit(v);
  };

  if (!editing) {
    return (
      <button
        onClick={() => {
          setDraft(value);
          setEditing(true);
        }}
        className="truncate rounded px-1 py-1 text-left hover:bg-surface-2"
        title="Click to edit"
      >
        {value || <span className="text-muted">—</span>}
      </button>
    );
  }
  return (
    <Autocomplete
      value={draft}
      onChange={setDraft}
      suggestions={suggestions}
      autoFocus
      fitContent
      className="w-full rounded border border-accent bg-surface-2 px-1 py-1 outline-none"
      onCommit={commit}
      onCancel={() => {
        setDraft(value);
        setEditing(false);
      }}
    />
  );
}

function EditDate({ value, onCommit }: { value: string | null; onCommit: (v: string) => void }) {
  // Hold a local draft and PATCH once on blur/Enter (like EditText) rather than
  // firing a request on every keystroke as the native date picker fills in.
  const [draft, setDraft] = useState(value ?? "");
  // Re-seed the draft when the committed value changes underneath us. Adjusting
  // during render (not in an effect) avoids a wasted render pass.
  const [prev, setPrev] = useState(value);
  if (value !== prev) {
    setPrev(value);
    setDraft(value ?? "");
  }

  const commit = () => {
    if (draft !== (value ?? "")) onCommit(draft);
  };

  return (
    <input
      type="date"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          setDraft(value ?? "");
          e.currentTarget.blur();
        }
      }}
      className="w-full rounded border border-transparent bg-transparent px-1 py-1 text-sm outline-none hover:border-border focus:border-accent [color-scheme:dark]"
    />
  );
}

function EditTags({
  values,
  suggestions,
  placeholder,
  onCommit,
}: {
  values: string[];
  suggestions: string[];
  placeholder: string;
  onCommit: (v: string[]) => void;
}) {
  const [editing, setEditing] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!editing) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setEditing(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [editing]);

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="flex min-h-8 flex-wrap items-center gap-1 rounded px-1 py-1 text-left hover:bg-surface-2"
        title="Click to edit"
      >
        {values.length ? (
          values.map((v) => (
            <span key={v} className="rounded bg-surface-2 px-1.5 py-0.5 text-xs ring-1 ring-border">
              {v}
            </span>
          ))
        ) : (
          <span className="text-muted">{placeholder}</span>
        )}
      </button>
    );
  }
  return (
    <div ref={ref}>
      <TagInput values={values} suggestions={suggestions} onChange={onCommit} placeholder="Add…" />
    </div>
  );
}
