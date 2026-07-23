"use client";

import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useBoards, useUploadComic } from "@/lib/client-api";
import { useToast } from "@/components/ui/toast";
import { Dialog } from "@/components/ui/Dialog";
import { MetadataForm, EMPTY_FORM, type ComicFormValue } from "@/components/forms/MetadataForm";
import { Check, ImageIcon, Upload } from "@/components/ui/icons";

interface Props {
  open: boolean;
  onClose: () => void;
  /** Board currently being viewed — pre-checked in the board picker. */
  defaultBoardId?: string;
}

const ACCEPT = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 15 * 1024 * 1024;

export function UploadModal({ open, onClose, defaultBoardId }: Props) {
  const { data: boards } = useBoards();
  const upload = useUploadComic();
  const { toast } = useToast();

  const [files, setFiles] = useState<File[]>([]);
  const [index, setIndex] = useState(0);
  const [form, setForm] = useState<ComicFormValue>(EMPTY_FORM);
  const [selectedBoards, setSelectedBoards] = useState<string[]>([]);
  const [dragOver, setDragOver] = useState(false);

  const reset = useCallback(() => {
    setFiles([]);
    setIndex(0);
    setForm(EMPTY_FORM);
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

  const addFiles = (list: FileList | File[]) => {
    const incoming = Array.from(list).filter((f) => {
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
    if (incoming.length === 0) return;
    setFiles(incoming);
    setIndex(0);
    setForm(EMPTY_FORM);
  };

  const close = () => {
    reset();
    onClose();
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

  const hasFiles = files.length > 0;

  return (
    <Dialog
      open={open}
      onClose={close}
      title={hasFiles ? "Add cover details" : "Upload covers"}
      widthClass="max-w-3xl"
    >
      {!hasFiles ? (
        <div className="p-5">
          <label
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              addFiles(e.dataTransfer.files);
            }}
            className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed py-16 text-center transition ${
              dragOver ? "border-accent bg-accent/10" : "border-border hover:border-muted"
            }`}
          >
            <div className="grid h-14 w-14 place-items-center rounded-2xl bg-surface-2 text-muted">
              <Upload className="h-7 w-7" />
            </div>
            <div>
              <p className="font-medium">Drop cover images here</p>
              <p className="mt-1 text-sm text-muted">or click to browse — JPG, PNG, WebP up to 15MB</p>
            </div>
            <input
              type="file"
              accept={ACCEPT.join(",")}
              multiple
              className="hidden"
              onChange={(e) => e.target.files && addFiles(e.target.files)}
            />
          </label>
        </div>
      ) : (
        <div className="flex max-h-[80vh] flex-col">
          <div className="grid flex-1 gap-5 overflow-y-auto p-5 sm:grid-cols-[240px_1fr]">
            {/* Preview */}
            <div className="space-y-3">
              <div className="overflow-hidden rounded-lg bg-surface-2 ring-1 ring-border">
                {previewSrc ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={previewSrc} alt="Preview" className="h-auto w-full object-contain" />
                ) : (
                  <div className="grid aspect-[2/3] place-items-center text-muted">
                    <ImageIcon className="h-8 w-8" />
                  </div>
                )}
              </div>
              {files.length > 1 && (
                <p className="text-center text-sm text-muted">
                  {index + 1} of {files.length}
                </p>
              )}
            </div>

            {/* Form */}
            <div className="space-y-4">
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
                {!form.series.trim() && (
                  <motion.span
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="text-sm text-muted"
                  >
                    Series is required
                  </motion.span>
                )}
              </AnimatePresence>
              <button
                onClick={saveCurrent}
                disabled={!form.series.trim() || upload.isPending}
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
