"use client";

import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useBoards, useUploadComic } from "@/lib/client-api";
import { useToast } from "@/components/ui/toast";
import { Dialog } from "@/components/ui/Dialog";
import { MetadataForm, EMPTY_FORM, type ComicFormValue } from "@/components/forms/MetadataForm";
import { MetadataSearch } from "@/components/upload/MetadataSearch";
import type { MetadataDetail } from "@/lib/metadata/types";
import { Check, Search, Upload } from "@/components/ui/icons";

interface Props {
  open: boolean;
  onClose: () => void;
  /** Board currently being viewed — pre-checked in the board picker. */
  defaultBoardId?: string;
}

type Mode = "search" | "upload";
/**
 * Which half of the modal is showing. Previously derived from `files.length > 0`
 * — which worked only while "has an image" and "past the picking step" were the
 * same question. They aren't: importing a record's details without its cover
 * lands on the details step with no file yet.
 */
type Step = "choose" | "details";

const ACCEPT = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 15 * 1024 * 1024;

export function UploadModal({ open, onClose, defaultBoardId }: Props) {
  const { data: boards } = useBoards();
  const upload = useUploadComic();
  const { toast } = useToast();

  const [mode, setMode] = useState<Mode>("search");
  const [step, setStep] = useState<Step>("choose");
  const [files, setFiles] = useState<File[]>([]);
  const [index, setIndex] = useState(0);
  const [form, setForm] = useState<ComicFormValue>(EMPTY_FORM);
  // Whether a provider record has been applied to the form. Guards the reset in
  // `addFiles` — see there for why.
  const [fromProvider, setFromProvider] = useState(false);
  // Whether the currently-held image came from a provider rather than the user.
  // Only a provider cover may be discarded by "I'll add my own image"; a file
  // the user chose themselves must survive it. See `useDetailsOnly`.
  const [coverFromProvider, setCoverFromProvider] = useState(false);
  const [selectedBoards, setSelectedBoards] = useState<string[]>([]);
  const [dragOver, setDragOver] = useState(false);

  const reset = useCallback(() => {
    setMode("search");
    setStep("choose");
    setFiles([]);
    setIndex(0);
    setForm(EMPTY_FORM);
    setFromProvider(false);
    setCoverFromProvider(false);
    setSelectedBoards(defaultBoardId ? [defaultBoardId] : []);
  }, [defaultBoardId]);

  // Initialize board selection when the modal transitions to open. Adjusting
  // state during render (keyed on the open transition) avoids a wasted render
  // pass compared with doing it in an effect.
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setSelectedBoards(defaultBoardId ? [defaultBoardId] : []);
  }

  // Derive the object-URL preview for the current file during render, and
  // revoke it when it changes or the component unmounts. `previewSrc` is a pure
  // function of the selected file, so it needs no separate state.
  const previewSrc = useMemo(
    () => (files[index] ? URL.createObjectURL(files[index]) : null),
    [files, index],
  );
  useEffect(() => {
    if (!previewSrc) return;
    return () => URL.revokeObjectURL(previewSrc);
  }, [previewSrc]);

  /** Drop anything unsupported, toasting why. Shared by add and replace. */
  const accepted = (list: FileList | File[]) =>
    Array.from(list).filter((f) => {
      if (!ACCEPT.includes(f.type)) {
        toast(`${f.name}: unsupported type`, "error");
        return false;
      }
      if (f.size > MAX_BYTES) {
        toast(`${f.name}: exceeds 15MB`, "error");
        return false;
      }
      return true;
    });

  /**
   * Swap the image for the entry being edited, leaving the rest of the queue
   * alone — unlike `addFiles`, which starts a fresh batch.
   *
   * Picking the wrong file had no way back: the dropzone renders only when
   * there's no preview, so the first image you chose was the one you were stuck
   * with short of closing the modal and losing the metadata with it.
   */
  const replaceCurrentFile = (list: FileList | File[]) => {
    const [next] = accepted(list);
    if (!next) return;
    setFiles((fs) => (fs.length === 0 ? [next] : fs.map((f, i) => (i === index ? next : f))));
    setCoverFromProvider(false); // the user's own file now, not the provider's
  };

  const addFiles = (list: FileList | File[]) => {
    const incoming = accepted(list);
    if (incoming.length === 0) return;
    setFiles(incoming);
    setIndex(0);
    setCoverFromProvider(false); // the user's own file now, not the provider's
    // Only clear the form for a genuinely fresh batch. This used to reset
    // unconditionally, which silently destroyed everything a provider record had
    // just filled in — so "pick the right record, then supply my own scan" threw
    // the metadata away and left the fields blank, exactly the manual re-entry
    // this feature exists to remove.
    if (!fromProvider) setForm(EMPTY_FORM);
    setStep("details");
  };

  const close = () => {
    reset();
    onClose();
  };

  // Merge a chosen metadata record into the form. Overwrites the fields the
  // provider supplies; keeps tags + characters (not autofilled) and untouched
  // values when a field is absent.
  const applyMetadata = (d: MetadataDetail) => {
    setFromProvider(true);
    setForm((f) => ({
      ...f,
      series: d.series || f.series,
      issueNumber: d.issueNumber ?? f.issueNumber,
      publisher: d.publisher ?? f.publisher,
      coverDate: d.coverDate ?? f.coverDate,
      authors: d.authors.length ? d.authors : f.authors,
      artists: d.artists.length ? d.artists : f.artists,
    }));
  };

  // Commit a provider cover as the image. When starting from search (no file
  // yet) it becomes the sole upload; in the details step it replaces the current
  // one. Moves the modal into the details step.
  const applyCover = (file: File) => {
    setFiles((fs) => (fs.length === 0 ? [file] : fs.map((f, i) => (i === index ? file : f))));
    setCoverFromProvider(true);
    setStep("details");
  };

  /**
   * Take the record's details and go on without its image — the user supplies
   * their own in the details step's dropzone.
   *
   * Dropping the held cover is the part that makes this work a second time
   * round. The details step hosts its own copy of the search panel, so the
   * common flow is: import a provider cover, realise it's the wrong variant,
   * search again, and pick "I'll add my own image". Before, this only set a step
   * we were already on, so the first cover stayed — and since the dropzone
   * renders only when there's no preview, there was no way to supply the
   * replacement. A dead end that looked like the button doing nothing.
   *
   * Guarded twice on purpose: a file the *user* chose is never discarded (the
   * provider only filled in fields for it), and neither is a multi-file batch,
   * where dropping one entry would renumber the rest mid-queue.
   */
  const useDetailsOnly = () => {
    if (coverFromProvider && files.length === 1) {
      setFiles([]);
      setCoverFromProvider(false);
    }
    setStep("details");
  };

  const saveCurrent = async () => {
    const file = files[index];
    if (!file || !form.series.trim()) return;
    try {
      await upload.mutateAsync({
        file,
        meta: {
          series: form.series.trim(),
          issueNumber: form.issueNumber.trim() || null,
          publisher: form.publisher.trim() || null,
          coverDate: form.coverDate || null,
          authors: form.authors,
          artists: form.artists,
          characters: form.characters,
          tags: form.tags,
          notes: form.notes.trim() || null,
          boardIds: selectedBoards,
        },
      });
      const isLast = index >= files.length - 1;
      if (isLast) {
        toast(files.length > 1 ? `Uploaded ${files.length} covers` : "Cover uploaded", "success");
        close();
      } else {
        // Advance, carrying series / publisher / authors / artists / boards
        // forward as defaults (batches are usually the same series).
        setIndex((i) => i + 1);
        setForm({
          ...EMPTY_FORM,
          series: form.series,
          publisher: form.publisher,
          authors: form.authors,
          artists: form.artists,
        });
      }
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };

  const file = files[index] ?? null;

  const dropzoneProps = {
    dragOver,
    setDragOver,
    onFiles: addFiles,
  };

  return (
    <Dialog
      open={open}
      onClose={close}
      title={step === "details" ? "Add cover details" : "Add a comic"}
      widthClass="max-w-3xl"
    >
      {step === "choose" ? (
        <div className="p-5">
          <ModeToggle mode={mode} onChange={setMode} />
          {mode === "search" ? (
            <div className="mt-4">
              {/* Search is the default mode and the first thing you do here, so
                  land the caret in the query box — opening Add and typing
                  should just work, without a click first. */}
              <MetadataSearch
                value={form}
                onApply={applyMetadata}
                onUseCover={applyCover}
                onUseDetails={useDetailsOnly}
                autoFocus
              />
            </div>
          ) : (
            <Dropzone {...dropzoneProps} className="mt-4" />
          )}
        </div>
      ) : (
        <div className="flex max-h-[80vh] flex-col">
          <div className="grid flex-1 gap-5 overflow-y-auto p-5 sm:grid-cols-[240px_1fr]">
            {/* Preview — or the dropzone, when details arrived without an image */}
            <div className="space-y-3">
              {previewSrc ? (
                <>
                <div className="overflow-hidden rounded-lg bg-surface-2 ring-1 ring-border">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={previewSrc} alt="Preview" className="h-auto w-full object-contain" />
                </div>
                <ReplaceImageButton onFile={replaceCurrentFile} />
                </>
              ) : (
                <Dropzone {...dropzoneProps} compact />
              )}
              {files.length > 1 && (
                <p className="text-center text-sm text-muted">
                  {index + 1} of {files.length}
                </p>
              )}
            </div>

            {/* Form */}
            <div className="space-y-4">
              <MetadataSearch
                value={form}
                onApply={applyMetadata}
                onUseCover={applyCover}
                onUseDetails={useDetailsOnly}
              />
              <MetadataForm value={form} onChange={setForm} />
              {boards && boards.length > 0 && (
                <div>
                  <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
                    Add to boards
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {boards.map((b) => {
                      const on = selectedBoards.includes(b.id);
                      return (
                        <button
                          key={b.id}
                          type="button"
                          onClick={() =>
                            setSelectedBoards((s) =>
                              on ? s.filter((x) => x !== b.id) : [...s, b.id],
                            )
                          }
                          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-sm transition ${
                            on
                              ? "bg-accent/20 text-fg ring-1 ring-accent/40"
                              : "bg-surface-2 text-muted ring-1 ring-border hover:text-fg"
                          }`}
                        >
                          {on && <Check className="h-3.5 w-3.5" />}
                          {b.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between border-t border-border p-4">
            <button
              onClick={close}
              className="rounded-lg px-3 py-2 text-sm text-muted transition hover:text-fg"
            >
              Cancel
            </button>
            <div className="flex items-center gap-2">
              <AnimatePresence>
                {/*
                  An image is now missable — details-only lands here with none —
                  so say which requirement is outstanding rather than leaving a
                  disabled button with no explanation.
                */}
                {(!form.series.trim() || !file) && (
                  <motion.span
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="text-sm text-muted"
                  >
                    {!file ? "Add a cover image" : "Series is required"}
                  </motion.span>
                )}
              </AnimatePresence>
              <button
                onClick={saveCurrent}
                disabled={!form.series.trim() || !file || upload.isPending}
                className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-fg transition hover:brightness-110 disabled:opacity-50"
              >
                {upload.isPending
                  ? "Uploading…"
                  : index >= files.length - 1
                    ? "Save cover"
                    : "Save & next"}
              </button>
            </div>
          </div>
        </div>
      )}
    </Dialog>
  );
}

/**
 * Swap the previewed image for a different one. A plain `label`-wrapped file
 * input rather than a button, so it needs no ref or imperative `.click()`.
 *
 * Single-file by design: this replaces the entry you're editing, so accepting a
 * multi-select here would be ambiguous — starting a fresh batch is what the
 * dropzone on the choose step is for.
 */
function ReplaceImageButton({ onFile }: { onFile: (list: FileList) => void }) {
  return (
    <label className="block cursor-pointer rounded-lg border border-border px-3 py-1.5 text-center text-xs text-muted transition hover:border-muted hover:text-fg">
      Choose a different image
      <input
        type="file"
        accept={ACCEPT.join(",")}
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) onFile(e.target.files);
          // Clearing the value is what lets you re-pick the *same* file after a
          // rejected type/size — without it the input reports no change and the
          // retry silently does nothing. Same guard as ReplaceCoverDialog.
          e.target.value = "";
        }}
      />
    </label>
  );
}

/**
 * File picker + drag target. Two sizes: the full-height panel on the choose
 * step, and a `compact` one that stands in for the preview image in the details
 * step when the details came from a provider without a usable cover.
 */
function Dropzone({
  dragOver,
  setDragOver,
  onFiles,
  compact = false,
  className = "",
}: {
  dragOver: boolean;
  setDragOver: (v: boolean) => void;
  onFiles: (list: FileList | File[]) => void;
  compact?: boolean;
  className?: string;
}) {
  return (
    <label
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        onFiles(e.dataTransfer.files);
      }}
      className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed text-center transition ${
        compact ? "aspect-[2/3] gap-2 px-3" : "py-16"
      } ${dragOver ? "border-accent bg-accent/10" : "border-border hover:border-muted"} ${className}`}
    >
      <div
        className={`grid place-items-center rounded-2xl bg-surface-2 text-muted ${
          compact ? "h-10 w-10" : "h-14 w-14"
        }`}
      >
        <Upload className={compact ? "h-5 w-5" : "h-7 w-7"} />
      </div>
      <div>
        <p className={compact ? "text-sm font-medium" : "font-medium"}>
          {compact ? "Add your cover" : "Drop cover images here"}
        </p>
        <p className={`mt-1 text-muted ${compact ? "text-xs" : "text-sm"}`}>
          {compact ? "Drop an image or click" : "or click to browse — JPG, PNG, WebP up to 15MB"}
        </p>
      </div>
      <input
        type="file"
        accept={ACCEPT.join(",")}
        multiple={!compact}
        className="hidden"
        onChange={(e) => e.target.files && onFiles(e.target.files)}
      />
    </label>
  );
}

const MODE_TABS: { id: Mode; label: string; Icon: typeof Search }[] = [
  { id: "search", label: "Search database", Icon: Search },
  { id: "upload", label: "Upload image", Icon: Upload },
];

function ModeToggle({ mode, onChange }: { mode: Mode; onChange: (m: Mode) => void }) {
  // Underlined tab strip matching the board tabs (BoardTabs) so it reads as two
  // switchable options, not a standalone button.
  return (
    <div className="flex items-center gap-1 border-b border-border">
      {MODE_TABS.map(({ id, label, Icon }) => {
        const active = mode === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onChange(id)}
            className={`relative flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition ${
              active ? "text-fg" : "text-muted hover:text-fg"
            }`}
          >
            <Icon className="h-4 w-4" /> {label}
            {active && (
              <motion.span
                layoutId="mode-tab"
                className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-accent"
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
