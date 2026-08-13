"use client";

import { AnimatePresence, motion } from "motion/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  useBoards,
  useComic,
  useDeleteComic,
  useRestoreComic,
  useRevertUpscale,
  useUpdateComic,
  useUpscalerInfo,
} from "@/lib/client-api";
import { navOrder } from "@/lib/nav-order";
import { lockScroll, unlockScroll } from "@/lib/scroll-lock";
import type { ComicDTO } from "@/lib/types";
import { useToast } from "@/components/ui/toast";
import { Menu } from "@/components/ui/Menu";
import { StarRating } from "@/components/ui/StarRating";
import { MetadataForm, type ComicFormValue } from "@/components/forms/MetadataForm";
import { BoardMembershipList } from "@/components/board/BoardMembershipList";
import { CoverBackdrop } from "@/components/detail/CoverBackdrop";
import { coverView } from "@/components/detail/cover-view-store";
import { CoverViewer } from "@/components/detail/CoverViewer";
import { ReplaceCoverDialog } from "@/components/detail/ReplaceCoverDialog";
import { UpscaleDialog } from "@/components/detail/UpscaleDialog";
import { MAX_UPSCALE_WIDTH } from "@/lib/upscale/types";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Expand,
  ImageIcon,
  Pencil,
  Plus,
  Sparkles,
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
    notes: c.notes ?? "",
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
  const restoreComic = useRestoreComic();
  const updateComic = useUpdateComic();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editing, setEditing] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const [upscaling, setUpscaling] = useState(false);
  // The cover's on-screen box when the full-screen viewer opens, so it can fly
  // from exactly where it was rather than fading in over the top.
  const coverRef = useRef<HTMLImageElement>(null);
  // Seeded from the module store, not initialised to `false`: arrowing to the
  // next cover remounts this component (see `cover-view-store.ts`), and a
  // freshly-initialised `false` is exactly how the viewer used to close itself
  // half way through a navigation.
  const [viewing, setViewingState] = useState(() => coverView.open);
  const setViewing = (open: boolean) => {
    if (open) coverView.openFrom(coverRef.current?.getBoundingClientRect() ?? null);
    else coverView.close();
    setViewingState(open);
  };
  const openViewer = () => setViewing(true);

  /**
   * Drop the viewer state when we leave the comic entirely, keep it when we're
   * only stepping to the next one.
   *
   * Both look identical from in here — this component unmounts either way — so
   * the test is the URL, which the router has already updated by the time this
   * cleanup runs. Still on `/comic/…` means another `ComicDetail` is mounting
   * behind us and the zoom should ride along; anything else means the modal is
   * gone, and a leftover `open` would spring the *next* cover you open straight
   * into full screen. Deliberately not a `popstate` listener: back is only one
   * of the ways out, and this catches all of them.
   */
  useEffect(
    () => () => {
      if (!window.location.pathname.startsWith("/comic/")) coverView.close();
    },
    [],
  );
  const { data: upscaler } = useUpscalerInfo();
  const revertUpscale = useRevertUpscale();
  const [form, setForm] = useState<ComicFormValue | null>(null);
  // Which field to focus once the form mounts — set when the user clicks
  // directly on a display-mode field instead of the global Edit button.
  const [focusField, setFocusField] = useState<keyof ComicFormValue | null>(null);

  // A cold open mounts the <img> before full.webp has decoded, so the shared
  // element measures a zero-size box and the fly-in is skipped. Start from the
  // board's already-decoded thumbnail (same aspect ratio) and swap to the full
  // image only once it has decoded.
  const imageUrl = comic?.imageUrl;
  const [decodedUrl, setDecodedUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!imageUrl) return;
    let cancelled = false;
    const img = new window.Image();
    img.src = imageUrl;
    img
      .decode()
      .catch(() => {}) // on decode failure, swap anyway — same as loading it directly
      .then(() => {
        if (!cancelled) setDecodedUrl(imageUrl);
      });
    return () => {
      cancelled = true;
    };
  }, [imageUrl]);

  const startEdit = (field?: keyof ComicFormValue) => {
    if (comic) {
      setForm(toForm(comic));
      setFocusField(field ?? null);
      setEditing(true);
    }
  };
  const cancelEdit = () => {
    setEditing(false);
    setForm(null);
  };

  const close = useCallback(() => {
    // Leaving the comic entirely: drop the viewer state, or the next cover you
    // open springs straight into full screen at the zoom you left behind.
    // (Can't be done on unmount — this component unmounts on every step
    // between covers, which is the state the store exists to survive.)
    coverView.close();
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

  // Touch swipe → prev/next. The floating side arrows are hidden on small
  // screens (they overlap the panel and there's no keyboard there), so a
  // horizontal swipe on the panel is how touch users move between covers.
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    touchStart.current = { x: t.clientX, y: t.clientY };
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touchStart.current;
    touchStart.current = null;
    if (!start || editing) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    // Require a clearly horizontal swipe so it doesn't hijack vertical scroll.
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      goto(dx < 0 ? next : prev);
    }
  };

  // Lock background scroll while the modal is open so the board underneath
  // stays put instead of scrolling behind the backdrop.
  useEffect(() => {
    if (!asModal) return;
    lockScroll();
    return () => {
      unlockScroll();
    };
  }, [asModal]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // A dialog on top owns the keyboard. Without this, Left/Right on the
      // upscale comparison's range slider ALSO navigated to another comic —
      // which remounted the keyed dialog and started a fresh upscale on the new
      // cover, orphaning the candidate you were looking at. Escape likewise
      // closed the dialog and this modal together.
      if (replacing || upscaling || viewing) return;
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
  }, [close, goto, prev, next, editing, replacing, upscaling, viewing]);

  const onDelete = async () => {
    try {
      await deleteComic.mutateAsync(id);
      const label = comic ? `${comic.series}${comic.issueNumber ? ` #${comic.issueNumber}` : ""}` : "Cover";
      toast(`${label} deleted`, "success", {
        duration: 6000,
        action: {
          label: "Undo",
          onClick: () => {
            restoreComic.mutate(id, { onError: (e) => toast((e as Error).message, "error") });
          },
        },
      });
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
          notes: form.notes.trim() || null,
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
      <div
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        className="relative flex max-h-full w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-surface shadow-2xl ring-1 ring-border md:flex-row"
      >
        {/* Cover — shared element with the board card. */}
        <div className="relative flex items-center justify-center overflow-hidden bg-black/40 p-4 md:w-[55%]">
          {comic && (
            <CoverBackdrop blurDataUrl={comic.blurDataUrl} thumbUrl={comic.thumbUrl} />
          )}
          {comic ? (
            <motion.img
              ref={coverRef}
              layoutId={`cover-${id}`}
              src={decodedUrl === comic.imageUrl ? comic.imageUrl : comic.thumbUrl}
              alt={comic.series}
              // `relative` is load-bearing, not cosmetic: the blurred backdrop
              // and its scrim above are `absolute`, and a statically-positioned
              // image paints *below* positioned siblings in the same stacking
              // context — so the cover sat behind both and read as not rendering
              // at all. It looked fine while opening only because Motion applies
              // a transform during the layout animation, which promotes the
              // image; once the animation settled the transform went back to
              // `none` and the cover dropped behind the scrim.
              onClick={openViewer}
              className="relative z-10 max-h-[45vh] w-auto cursor-zoom-in rounded-lg object-contain shadow-xl md:max-h-[80vh]"
              layoutCrossfade={false}
              transition={{ type: "spring", stiffness: 320, damping: 34 }}
            />
          ) : (
            // Reserve the cover space while loading (cold deep-link) so the panel
            // opens full-size instead of a small box that grows.
            <div className="aspect-[2/3] h-[45vh] max-w-full animate-pulse rounded-lg bg-surface-2 md:h-[76vh]" />
          )}
          {comic && (
            // Above the cover's own z-10: these overlay the image on purpose,
            // and without an explicit layer they sit under the (now positioned)
            // cover and stop being clickable at all.
            <div className="absolute bottom-6 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1.5">
              {/* Actions only. The dimensions used to sit up here too, which
                  meant three things overlaying the artwork — they've moved to
                  the file-info line in the metadata panel, next to the revert
                  they belong with. */}
              {/* The cover itself opens the viewer too, but an <img> with an
                  onClick isn't reachable by keyboard — this is the affordance
                  that is. */}
              <button
                onClick={openViewer}
                className="inline-flex items-center gap-1.5 rounded-lg bg-surface/40 px-3 py-1.5 text-sm font-medium whitespace-nowrap text-fg/80 shadow-lg ring-1 ring-border/50 backdrop-blur-sm transition hover:bg-surface/95 hover:text-fg hover:ring-border"
              >
                <Expand className="h-4 w-4" /> Full screen
              </button>
              <button
                onClick={() => setReplacing(true)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-surface/40 px-3 py-1.5 text-sm font-medium whitespace-nowrap text-fg/80 shadow-lg ring-1 ring-border/50 backdrop-blur-sm transition hover:bg-surface/95 hover:text-fg hover:ring-border"
              >
                <ImageIcon className="h-4 w-4" /> Replace cover
              </button>
              {/* Hidden at the ceiling as well as when unconfigured: the server
                  refuses a no-op upscale, so offering it would just produce an
                  error a few seconds later. */}
              {upscaler?.available && comic.width < MAX_UPSCALE_WIDTH && (
                <button
                  onClick={() => setUpscaling(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-surface/40 px-3 py-1.5 text-sm font-medium whitespace-nowrap text-fg/80 shadow-lg ring-1 ring-border/50 backdrop-blur-sm transition hover:bg-surface/95 hover:text-fg hover:ring-border"
                >
                  <Sparkles className="h-4 w-4" /> Upscale
                </button>
              )}
            </div>
          )}
        </div>

        {/* Metadata */}
        <div className="flex min-h-0 flex-1 flex-col md:w-[45%]">
          <div className="flex items-start justify-between gap-2 border-b border-border p-5">
            <div className="min-w-0">
              {isLoading && <div className="h-6 w-40 animate-pulse rounded bg-surface-2" />}
              {comic && (
                <>
                  <button
                    type="button"
                    onClick={() => startEdit("series")}
                    className="-mx-1 block rounded-md px-1 text-left transition hover:bg-surface-2"
                  >
                    <h2 className="text-xl font-bold leading-tight">{comic.series}</h2>
                  </button>
                  {comic.issueNumber && (
                    <button
                      type="button"
                      onClick={() => startEdit("issueNumber")}
                      className="-mx-1 mt-0.5 block rounded-md px-1 text-left transition hover:bg-surface-2"
                    >
                      <p className="text-sm font-medium text-muted">#{comic.issueNumber}</p>
                    </button>
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
              <MetadataForm value={form} onChange={setForm} focusField={focusField} />
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

              <div className="flex flex-wrap gap-x-6 gap-y-3">
                  {comic.publisher && (
                    <button
                      type="button"
                      onClick={() => startEdit("publisher")}
                      className="-mx-1 rounded-md px-1 text-left transition hover:bg-surface-2"
                    >
                      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">
                        Publisher
                      </p>
                      <span className="text-sm text-fg">{comic.publisher}</span>
                    </button>
                  )}
                  {comic.coverDate && (
                    <button
                      type="button"
                      onClick={() => startEdit("coverDate")}
                      className="-mx-1 rounded-md px-1 text-left transition hover:bg-surface-2"
                    >
                      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">
                        Cover date
                      </p>
                      <span className="text-sm">{formatDate(comic.coverDate)}</span>
                    </button>
                  )}
                  {/* Same shape as its neighbours, but a plain div rather than a
                      button: they click through to edit that field, and there's
                      nothing here to edit — it's a property of the image file. */}
                  <div className="px-1">
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">
                      Image
                    </p>
                    <span className="text-sm text-fg">
                      {comic.width} × {comic.height}px
                    </span>
                  </div>
                </div>

              {comic.authors.length > 0 && (
                <Field label="Author" onClick={() => startEdit("authors")}>
                  <ChipRow values={comic.authors} />
                </Field>
              )}
              {comic.artists.length > 0 && (
                <Field label="Cover Artists" onClick={() => startEdit("artists")}>
                  <ChipRow values={comic.artists} />
                </Field>
              )}
              {comic.characters.length > 0 && (
                <Field label="Characters on cover" onClick={() => startEdit("characters")}>
                  <ChipRow values={comic.characters} />
                </Field>
              )}
              {comic.tags.length > 0 && (
                <Field label="Tags" onClick={() => startEdit("tags")}>
                  <ChipRow values={comic.tags} />
                </Field>
              )}
              {comic.notes && (
                <Field label="Notes" onClick={() => startEdit("notes")}>
                  <p className="whitespace-pre-wrap text-sm text-fg">{comic.notes}</p>
                </Field>
              )}
              <Field label="Boards">
                <BoardsField comicId={id} boardIds={comic.boardIds} onOpenBoard={close} />
              </Field>

              {/* Only when there's actually a kept pre-upscale cover. No Field
                  label: the pill already says what this is, and labelling it
                  "Upscaled" above a pill reading "Upscaled" would be the same
                  redundancy as the caption this replaced. The size itself moved
                  up to sit with Publisher / Cover date — same kind of short
                  scalar fact — so an ordinary cover shows none of this. */}
              {comic.upscaled && (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  {/* Same treatment as the board chips, so "this image was
                      altered" carries weight without needing a sentence. */}
                  <span className="inline-flex items-center gap-1 rounded-full bg-accent/15 px-2.5 py-1 text-xs text-fg ring-1 ring-accent/30">
                    <Sparkles className="h-3 w-3" /> Upscaled
                  </span>
                  <button
                    type="button"
                    disabled={revertUpscale.isPending}
                    onClick={async () => {
                      try {
                        await revertUpscale.mutateAsync(id);
                        toast("Reverted to the original cover", "success");
                      } catch (e) {
                        toast((e as Error).message, "error");
                      }
                    }}
                    className="text-xs text-muted underline underline-offset-2 transition hover:text-fg disabled:opacity-50"
                  >
                    {/* Just "Revert": the pill beside it already says what
                        happened, so naming the object again adds nothing. */}
                    {revertUpscale.isPending ? "Reverting…" : "Revert"}
                  </button>
                </div>
              )}
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
                  onClick={() => startEdit()}
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

      {comic && (
        <ReplaceCoverDialog comic={comic} open={replacing} onClose={() => setReplacing(false)} />
      )}
      {comic && (
        // Keyed so arrowing to another cover gets a fresh dialog rather than
        // one holding the previous comic's candidate.
        <UpscaleDialog
          key={comic.id}
          comic={comic}
          open={upscaling}
          onClose={() => setUpscaling(false)}
        />
      )}

      {/* SPIKE: full-screen cover viewer. Rendered over this modal rather than
          replacing it, so closing lands back on the metadata you came from. */}
      <AnimatePresence>
        {comic && viewing && (
          <CoverViewer
            comic={comic}
            prev={prev}
            next={next}
            onNavigate={goto}
            onClose={() => setViewing(false)}
          />
        )}
      </AnimatePresence>
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
      aria-label={side === "left" ? "Previous cover" : "Next cover"}
      className={`absolute top-1/2 z-10 hidden h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-surface/80 text-fg shadow-lg ring-1 ring-border backdrop-blur transition hover:bg-surface sm:grid ${
        side === "left" ? "left-4" : "right-4"
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
  const router = useRouter();
  const memberOf = (boards ?? []).filter((b) => boardIds.includes(b.id));

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
        {() => <BoardMembershipList comicId={comicId} boardIds={boardIds} />}
      </Menu>
    </div>
  );
}

function Field({
  label,
  children,
  onClick,
}: {
  label: string;
  children: React.ReactNode;
  /** When set, the whole field becomes a click target that enters edit mode.
   *  Only pass this for fields whose children are non-interactive (e.g.
   *  ChipRow) — wrapping a field with real buttons in it (e.g. Boards) would
   *  nest <button> inside <button>. */
  onClick?: () => void;
}) {
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="-mx-1 block w-full rounded-md px-1 text-left transition hover:bg-surface-2"
      >
        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
        {children}
      </button>
    );
  }
  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
      {children}
    </div>
  );
}

// Plain display chips. These deliberately don't filter on click — filtering
// lives in the board's FilterBar facets, and the list view uses identical-
// looking chips to *edit*. Keeping the modal chips non-interactive avoids two
// look-alike chips doing two different things (see TODO item 15 / DR#3a).
function ChipRow({ values }: { values: string[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {values.map((v) => (
        <span
          key={v}
          className="rounded-full bg-surface-2 px-2.5 py-1 text-sm text-fg ring-1 ring-border"
        >
          {v}
        </span>
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
