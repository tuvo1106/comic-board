"use client";

import { AnimatePresence, motion } from "motion/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  useAddToBoard,
  useBoards,
  useComic,
  useDeleteComic,
  useRemoveFromBoard,
  useUpdateComic,
} from "@/lib/client-api";
import { navOrder } from "@/lib/nav-order";
import type { ComicDTO } from "@/lib/types";
import { useToast } from "@/components/ui/toast";
import { Menu } from "@/components/ui/Menu";
import { StarRating } from "@/components/ui/StarRating";
import { MetadataForm, type ComicFormValue } from "@/components/forms/MetadataForm";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Layers,
  Pencil,
  Plus,
  Trash,
  X,
} from "@/components/ui/icons";

function toForm(c: ComicDTO): ComicFormValue {
  return {
    series: c.series,
    issueNumber: c.issueNumber ?? "",
    publisher: c.publisher ?? "",
    coverDate: c.coverDate ?? "",
    authors: c.authors,
    artists: c.artists,
    characters: c.characters,
    tags: c.tags,
  };
}

interface Props {
  id: string;
  /** True when shown as an intercepted modal (close = router.back). */
  asModal?: boolean;
}

export function ComicDetail({ id, asModal }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const { data: comic, isLoading } = useComic(id);
  const deleteComic = useDeleteComic();
  const updateComic = useUpdateComic();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<ComicFormValue | null>(null);

  const startEdit = () => {
    if (comic) {
      setForm(toForm(comic));
      setEditing(true);
    }
  };
  const cancelEdit = () => {
    setEditing(false);
    setForm(null);
  };

  const close = useCallback(() => {
    if (asModal) router.back();
    else router.push("/");
  }, [asModal, router]);

  const searchParams = useSearchParams();
  const { prev, next } = navOrder.neighbors(id);
  const goto = useCallback(
    (target: string | null) => {
      if (!target) return;
      // Keep the board's filter/sort params so the board underneath is stable.
      const qs = searchParams.toString();
      router.replace(`/comic/${target}${qs ? `?${qs}` : ""}`, { scroll: false });
    },
    [router, searchParams],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (editing) {
        // While editing, Escape backs out of edit mode; don't navigate covers.
        if (e.key === "Escape") cancelEdit();
        return;
      }
      if (e.key === "Escape") close();
      else if (e.key === "ArrowLeft") goto(prev);
      else if (e.key === "ArrowRight") goto(next);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close, goto, prev, next, editing]);

  const applyFilter = (
    kind: "author" | "artist" | "character" | "series" | "publisher" | "tag",
    value: string,
  ) => {
    router.push(`/?${kind}=${encodeURIComponent(value)}`);
  };

  const onDelete = async () => {
    try {
      await deleteComic.mutateAsync(id);
      toast("Cover deleted", "success");
      close();
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };

  const onSave = async () => {
    if (!form || !form.series.trim()) return;
    try {
      await updateComic.mutateAsync({
        id,
        patch: {
          series: form.series.trim(),
          issueNumber: form.issueNumber.trim() || null,
          publisher: form.publisher.trim() || null,
          coverDate: form.coverDate || null,
          authors: form.authors,
          artists: form.artists,
          characters: form.characters,
          tags: form.tags,
        },
      });
      toast("Changes saved", "success");
      setEditing(false);
      setForm(null);
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 sm:p-8">
      {/* Backdrop */}
      <motion.div
        className="absolute inset-0 bg-black/70 backdrop-blur-md"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={close}
      />

      {/* Prev / next */}
      {prev && (
        <NavArrow side="left" onClick={() => goto(prev)}>
          <ChevronLeft className="h-6 w-6" />
        </NavArrow>
      )}
      {next && (
        <NavArrow side="right" onClick={() => goto(next)}>
          <ChevronRight className="h-6 w-6" />
        </NavArrow>
      )}

      {/* Panel */}
      <div className="relative flex max-h-full w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-surface shadow-2xl ring-1 ring-border md:flex-row">
        {/* Cover — shared element with the board card. */}
        <div className="flex items-center justify-center bg-black/40 p-4 md:w-[55%]">
          {comic ? (
            <motion.img
              layoutId={`cover-${id}`}
              src={comic.imageUrl}
              alt={comic.series}
              className="max-h-[45vh] w-auto rounded-lg object-contain shadow-xl md:max-h-[80vh]"
              transition={{ type: "spring", stiffness: 320, damping: 34 }}
            />
          ) : (
            // Reserve the cover space while loading (cold deep-link) so the panel
            // opens full-size instead of a small box that grows.
            <div className="aspect-[2/3] h-[45vh] max-w-full animate-pulse rounded-lg bg-surface-2 md:h-[76vh]" />
          )}
        </div>

        {/* Metadata */}
        <div className="flex min-h-0 flex-1 flex-col md:w-[45%]">
          <div className="flex items-start justify-between gap-2 border-b border-border p-5">
            <div className="min-w-0">
              {isLoading && <div className="h-6 w-40 animate-pulse rounded bg-surface-2" />}
              {comic && (
                <>
                  <h2 className="text-xl font-bold leading-tight">{comic.series}</h2>
                  {comic.issueNumber && (
                    <p className="mt-0.5 text-sm font-medium text-muted">#{comic.issueNumber}</p>
                  )}
                </>
              )}
            </div>
            <button
              onClick={close}
              className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-md text-muted transition hover:bg-surface-2 hover:text-fg"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {comic && editing && form ? (
            <div className="flex-1 overflow-y-auto p-5">
              <MetadataForm value={form} onChange={setForm} />
            </div>
          ) : comic ? (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
              className="flex-1 space-y-5 overflow-y-auto p-5"
            >
              <Field label="Your rating">
                <StarRating
                  value={comic.rating}
                  onChange={(rating) => updateComic.mutate({ id, patch: { rating } })}
                />
              </Field>

              {(comic.publisher || comic.coverDate) && (
                <div className="flex flex-wrap gap-x-6 gap-y-3">
                  {comic.publisher && (
                    <div>
                      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">
                        Publisher
                      </p>
                      <button
                        onClick={() => applyFilter("publisher", comic.publisher!)}
                        className="text-sm text-fg underline-offset-2 hover:underline"
                      >
                        {comic.publisher}
                      </button>
                    </div>
                  )}
                  {comic.coverDate && (
                    <div>
                      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">
                        Cover date
                      </p>
                      <span className="text-sm">{formatDate(comic.coverDate)}</span>
                    </div>
                  )}
                </div>
              )}

              {comic.authors.length > 0 && (
                <Field label="Author">
                  <ChipRow values={comic.authors} onClick={(v) => applyFilter("author", v)} />
                </Field>
              )}
              {comic.artists.length > 0 && (
                <Field label="Cover Artists">
                  <ChipRow values={comic.artists} onClick={(v) => applyFilter("artist", v)} />
                </Field>
              )}
              {comic.characters.length > 0 && (
                <Field label="Characters on cover">
                  <ChipRow
                    values={comic.characters}
                    onClick={(v) => applyFilter("character", v)}
                  />
                </Field>
              )}
              {comic.tags.length > 0 && (
                <Field label="Tags">
                  <ChipRow values={comic.tags} onClick={(v) => applyFilter("tag", v)} />
                </Field>
              )}
              <Field label="Boards">
                <BoardsField comicId={id} boardIds={comic.boardIds} onOpenBoard={close} />
              </Field>
            </motion.div>
          ) : null}

          {/* Actions */}
          <div className="flex items-center justify-between gap-2 border-t border-border p-4">
            {editing ? (
              <>
                <span className="text-sm text-muted">
                  {form && !form.series.trim() ? "Series is required" : "Editing"}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={cancelEdit}
                    className="rounded-md px-3 py-1.5 text-sm text-muted hover:text-fg"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={onSave}
                    disabled={!form?.series.trim() || updateComic.isPending}
                    className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3.5 py-1.5 text-sm font-semibold text-accent-fg transition hover:brightness-110 disabled:opacity-50"
                  >
                    <Check className="h-4 w-4" />
                    {updateComic.isPending ? "Saving…" : "Save"}
                  </button>
                </div>
              </>
            ) : (
              <>
                <button
                  onClick={startEdit}
                  disabled={!comic}
                  className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-muted transition hover:bg-surface-2 hover:text-fg disabled:opacity-50"
                >
                  <Pencil className="h-4 w-4" />
                  Edit
                </button>
                <AnimatePresence mode="wait">
                  {confirmDelete ? (
                    <motion.div
                      key="confirm"
                      initial={{ opacity: 0, x: 8 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0 }}
                      className="flex items-center gap-2"
                    >
                      <span className="text-sm text-muted">Delete this cover?</span>
                      <button
                        onClick={() => setConfirmDelete(false)}
                        className="rounded-md px-3 py-1.5 text-sm text-muted hover:text-fg"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={onDelete}
                        disabled={deleteComic.isPending}
                        className="rounded-md bg-danger px-3 py-1.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
                      >
                        {deleteComic.isPending ? "Deleting…" : "Delete"}
                      </button>
                    </motion.div>
                  ) : (
                    <motion.button
                      key="delete"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      onClick={() => setConfirmDelete(true)}
                      className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-muted transition hover:bg-surface-2 hover:text-danger"
                    >
                      <Trash className="h-4 w-4" />
                      Delete
                    </motion.button>
                  )}
                </AnimatePresence>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function NavArrow({
  side,
  onClick,
  children,
}: {
  side: "left" | "right";
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`absolute top-1/2 z-10 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-surface/80 text-fg shadow-lg ring-1 ring-border backdrop-blur transition hover:bg-surface ${
        side === "left" ? "left-2 sm:left-4" : "right-2 sm:right-4"
      }`}
    >
      {children}
    </button>
  );
}

function BoardsField({
  comicId,
  boardIds,
  onOpenBoard,
}: {
  comicId: string;
  boardIds: string[];
  onOpenBoard: () => void;
}) {
  const { data: boards } = useBoards();
  const addToBoard = useAddToBoard();
  const removeFromBoard = useRemoveFromBoard();
  const router = useRouter();
  const memberOf = (boards ?? []).filter((b) => boardIds.includes(b.id));

  const toggle = (boardId: string, isMember: boolean) => {
    if (isMember) removeFromBoard.mutate({ boardId, comicId });
    else addToBoard.mutate({ boardId, comicId });
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {memberOf.map((b) => (
        <button
          key={b.id}
          onClick={() => {
            onOpenBoard();
            router.push(`/board/${b.id}`);
          }}
          className="rounded-full bg-accent/15 px-2.5 py-1 text-sm text-fg ring-1 ring-accent/30 transition hover:bg-accent/25"
        >
          {b.name}
        </button>
      ))}

      <Menu
        align="left"
        widthClass="w-56"
        trigger={({ toggle: t }) => (
          <button
            onClick={t}
            className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-2.5 py-1 text-sm text-muted transition hover:border-accent hover:text-fg"
          >
            <Plus className="h-3.5 w-3.5" /> Add to board
          </button>
        )}
      >
        {() => (
          <>
            <p className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
              <Layers className="h-3.5 w-3.5" /> Boards
            </p>
            <div className="max-h-52 overflow-y-auto">
              {boards && boards.length > 0 ? (
                boards.map((b) => {
                  const isMember = boardIds.includes(b.id);
                  return (
                    <button
                      key={b.id}
                      onClick={() => toggle(b.id, isMember)}
                      className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-sm transition hover:bg-surface-2"
                    >
                      <span
                        className={`grid h-4 w-4 flex-shrink-0 place-items-center rounded border ${
                          isMember ? "border-accent bg-accent text-accent-fg" : "border-border"
                        }`}
                      >
                        {isMember && <Check className="h-3 w-3" />}
                      </span>
                      <span className="flex-1 truncate">{b.name}</span>
                    </button>
                  );
                })
              ) : (
                <p className="px-2.5 py-1.5 text-sm text-muted">No boards yet</p>
              )}
            </div>
          </>
        )}
      </Menu>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
      {children}
    </div>
  );
}

function ChipRow({ values, onClick }: { values: string[]; onClick: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {values.map((v) => (
        <button
          key={v}
          onClick={() => onClick(v)}
          className="rounded-full bg-surface-2 px-2.5 py-1 text-sm text-fg ring-1 ring-border transition hover:bg-accent/20 hover:ring-accent/40"
        >
          {v}
        </button>
      ))}
    </div>
  );
}

function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  const mi = parseInt(m, 10) - 1;
  if (!months[mi]) return y;
  const day = parseInt(d, 10);
  return Number.isFinite(day) ? `${months[mi]} ${day}, ${y}` : `${months[mi]} ${y}`;
}
