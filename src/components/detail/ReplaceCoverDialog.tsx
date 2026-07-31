"use client";

import { useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { MetadataSearch } from "@/components/upload/MetadataSearch";
import { EMPTY_FORM } from "@/components/forms/MetadataForm";
import { useReplaceCover } from "@/lib/client-api";
import { useToast } from "@/components/ui/toast";
import { Search, Upload } from "@/components/ui/icons";
import type { ComicDTO } from "@/lib/types";

type Mode = "upload" | "search";

const ACCEPT = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 15 * 1024 * 1024;

interface Props {
  comic: ComicDTO;
  open: boolean;
  onClose: () => void;
}

/**
 * Replace a comic's cover from a new file or a Metron cover/variant. Only the
 * image changes — metadata and board memberships are kept.
 */
export function ReplaceCoverDialog({ comic, open, onClose }: Props) {
  const replace = useReplaceCover();
  const { toast } = useToast();
  const [mode, setMode] = useState<Mode>("upload");
  const [dragOver, setDragOver] = useState(false);

  // Single sink for both entry points (upload + Metron cover), so validation and
  // the in-flight guard apply consistently.
  const doReplace = async (file: File) => {
    if (replace.isPending) return; // ignore rapid re-clicks (e.g. "Use cover" ×2)
    if (!ACCEPT.includes(file.type)) return toast(`${file.name}: unsupported type`, "error");
    if (file.size > MAX_BYTES) return toast(`${file.name}: exceeds 15MB`, "error");
    try {
      await replace.mutateAsync({ id: comic.id, file });
      toast("Cover replaced", "success");
      onClose();
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };

  const addFile = (list: FileList | File[]) => {
    const f = Array.from(list)[0];
    if (f) doReplace(f);
  };

  // Seed the Metron search from the comic; only series/issue are read.
  const seed = { ...EMPTY_FORM, series: comic.series, issueNumber: comic.issueNumber ?? "" };

  return (
    <Dialog open={open} onClose={onClose} title="Replace cover" widthClass="max-w-2xl">
      <div className="space-y-4 p-5">
        <ModeToggle mode={mode} onChange={setMode} />

        {mode === "upload" ? (
          <label
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              addFile(e.dataTransfer.files);
            }}
            className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed py-14 text-center transition ${
              dragOver ? "border-accent bg-accent/10" : "border-border hover:border-muted"
            } ${replace.isPending ? "pointer-events-none opacity-60" : ""}`}
          >
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-surface-2 text-muted">
              <Upload className="h-6 w-6" />
            </div>
            <div>
              <p className="font-medium">Drop a new cover here</p>
              <p className="mt-1 text-sm text-muted">or click to browse — JPG, PNG, WebP up to 15MB</p>
            </div>
            <input
              type="file"
              accept={ACCEPT.join(",")}
              className="hidden"
              onChange={(e) => {
                if (e.target.files) addFile(e.target.files);
                e.target.value = ""; // allow re-selecting the same file after a failure
              }}
            />
          </label>
        ) : (
          // Mounts only when the user explicitly switches to this tab, so the
          // caret belongs in the query box — same reasoning as the Add modal,
          // where search is the landing mode.
          <MetadataSearch value={seed} onApply={() => {}} onUseCover={doReplace} autoFocus />
        )}

        {replace.isPending && <p className="text-center text-sm text-muted">Replacing cover…</p>}
      </div>
    </Dialog>
  );
}

function ModeToggle({ mode, onChange }: { mode: Mode; onChange: (m: Mode) => void }) {
  const tabs: { id: Mode; label: string; Icon: typeof Upload }[] = [
    { id: "upload", label: "Upload image", Icon: Upload },
    { id: "search", label: "Search Metron", Icon: Search },
  ];
  return (
    <div className="flex items-center gap-1 border-b border-border">
      {tabs.map(({ id, label, Icon }) => {
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
              <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-accent" />
            )}
          </button>
        );
      })}
    </div>
  );
}
