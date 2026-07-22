"use client";

import { useEffect, useRef, useState } from "react";
import { useMeta, useUpdateComic } from "@/lib/client-api";
import type { ComicDTO } from "@/lib/types";
import type { SortDir, SortField } from "@/lib/sort";
import { StarRating } from "@/components/ui/StarRating";
import { TagInput } from "@/components/ui/TagInput";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "@/components/ui/icons";
import { ComicCardMenu } from "./ComicCardMenu";

const COLS =
  "grid-cols-[44px_minmax(150px,1.5fr)_56px_minmax(90px,0.8fr)_128px_minmax(120px,1fr)_minmax(120px,1fr)_minmax(120px,1fr)_140px_36px]";

interface Props {
  comics: ComicDTO[];
  currentBoardId?: string;
  onOpen: (comic: ComicDTO) => void;
  sortField: SortField;
  sortDir: SortDir;
  onSort: (field: SortField) => void;
}

export function ListView({ comics, currentBoardId, onOpen, sortField, sortDir, onSort }: Props) {
  const { data: meta } = useMeta();
  const suggestions = {
    authors: (meta?.authors ?? []).map((a) => a.value),
    artists: (meta?.artists ?? []).map((a) => a.value),
    tags: (meta?.tags ?? []).map((t) => t.value),
    publishers: (meta?.publishers ?? []).map((p) => p.value),
  };

  const sortProps = { active: sortField, dir: sortDir, onSort };

  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <div className="min-w-[900px]">
        {/* Header */}
        <div
          className={`grid ${COLS} gap-2 border-b border-border bg-surface px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted`}
        >
          <span />
          <SortHeader field="series" label="Series" {...sortProps} />
          <SortHeader field="issue" label="#" {...sortProps} />
          <SortHeader field="publisher" label="Publisher" {...sortProps} />
          <SortHeader field="coverDate" label="Cover date" {...sortProps} />
          <span>Author</span>
          <span>Cover Artist</span>
          <span>Tags</span>
          <SortHeader field="rating" label="Rating" {...sortProps} />
          <span />
        </div>
        {comics.map((c) => (
          <Row
            key={c.id}
            comic={c}
            currentBoardId={currentBoardId}
            onOpen={() => onOpen(c)}
            suggestions={suggestions}
          />
        ))}
      </div>
    </div>
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
}: {
  comic: ComicDTO;
  currentBoardId?: string;
  onOpen: () => void;
  suggestions: { authors: string[]; artists: string[]; tags: string[]; publishers: string[] };
}) {
  const update = useUpdateComic();
  const save = (patch: Parameters<typeof update.mutate>[0]["patch"]) =>
    update.mutate({ id: comic.id, patch });

  return (
    <div
      className={`group/row grid ${COLS} items-center gap-2 border-b border-border px-3 py-1.5 text-sm transition hover:bg-surface/50`}
    >
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

      <RatingCell value={comic.rating} onChange={(rating) => save({ rating })} />

      <ComicCardMenu comic={comic} currentBoardId={currentBoardId} />
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
  useEffect(() => setDraft(value), [value]);

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
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
 *  known publishers. Free text is still allowed for new ones. */
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
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => setDraft(value), [value]);

  const commit = (v: string) => {
    setEditing(false);
    if (v !== value) onCommit(v);
  };

  const matches = suggestions
    .filter((s) => {
      const q = draft.trim().toLowerCase();
      return q ? s.toLowerCase().includes(q) && s.toLowerCase() !== q : true;
    })
    .slice(0, 8);

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="truncate rounded px-1 py-1 text-left hover:bg-surface-2"
        title="Click to edit"
      >
        {value || <span className="text-muted">—</span>}
      </button>
    );
  }
  return (
    <div ref={ref} className="relative">
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => commit(draft)}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit(draft);
          if (e.key === "Escape") {
            setDraft(value);
            setEditing(false);
          }
        }}
        className="w-full rounded border border-accent bg-surface-2 px-1 py-1 outline-none"
      />
      {matches.length > 0 && (
        <div className="absolute left-0 top-full z-50 mt-1 max-h-52 w-max min-w-full overflow-y-auto rounded-lg border border-border bg-surface p-1 shadow-2xl">
          {matches.map((s) => (
            <button
              key={s}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => commit(s)}
              className="block w-full truncate rounded-md px-2.5 py-1.5 text-left text-sm hover:bg-surface-2"
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function EditDate({ value, onCommit }: { value: string | null; onCommit: (v: string) => void }) {
  // Hold a local draft and PATCH once on blur/Enter (like EditText) rather than
  // firing a request on every keystroke as the native date picker fills in.
  const [draft, setDraft] = useState(value ?? "");
  useEffect(() => setDraft(value ?? ""), [value]);

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
