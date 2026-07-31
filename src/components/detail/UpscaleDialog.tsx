"use client";

import { useState } from "react";
import {
  useAcceptUpscale,
  useDiscardUpscale,
  usePreviewUpscale,
  useUpscalerInfo,
  type UpscaleCandidate,
} from "@/lib/client-api";
import { useToast } from "@/components/ui/toast";
import { Dialog } from "@/components/ui/Dialog";
import type { ComicDTO } from "@/lib/types";
import { Check, Sparkles } from "@/components/ui/icons";

const SCALES = [2, 4] as const;

interface Props {
  comic: ComicDTO;
  open: boolean;
  onClose: () => void;
}

/**
 * Generate an upscaled cover, compare it against the current one, then keep or
 * discard it. Nothing is committed until "Keep it" — the preview is a real
 * stored image, but no comic points at it, so declining just deletes a folder.
 */
export function UpscaleDialog({ comic, open, onClose }: Props) {
  const { toast } = useToast();
  const { data: info } = useUpscalerInfo();
  const preview = usePreviewUpscale();
  const accept = useAcceptUpscale();
  const discard = useDiscardUpscale();

  const [scale, setScale] = useState<number>(2);
  const [candidate, setCandidate] = useState<UpscaleCandidate | null>(null);
  const [split, setSplit] = useState(50);

  // Closing with an unaccepted candidate would leave it orphaned on disk, and
  // the sweep only ever looks at soft-deleted comics — nothing else would
  // collect it. Fire-and-forget: the dialog is already gone, and a failed
  // cleanup shouldn't produce a toast about something the user didn't ask for.
  const dismiss = () => {
    if (candidate) discard.mutate({ id: comic.id, imagePath: candidate.imagePath });
    setCandidate(null);
    setSplit(50);
    onClose();
  };

  // Reset on a different comic (a previous run's result must never be shown
  // against the wrong cover) and on each open. Adjusted during render keyed on
  // a `prev` value rather than in an effect — the repo's pattern for this, and
  // what `react-hooks/set-state-in-effect` is pointing at: an effect would
  // render once with the stale split before correcting it.
  const [prevId, setPrevId] = useState(comic.id);
  if (comic.id !== prevId) {
    setPrevId(comic.id);
    setCandidate(null);
    setSplit(50);
  }
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (!open) setSplit(50);
  }

  const run = async () => {
    try {
      const c = await preview.mutateAsync({ id: comic.id, scale });
      setCandidate(c);
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };

  const keep = async () => {
    if (!candidate) return;
    try {
      await accept.mutateAsync({ id: comic.id, imagePath: candidate.imagePath });
      toast("Upscaled cover saved", "success");
      setCandidate(null);
      onClose();
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };

  return (
    <Dialog open={open} onClose={dismiss} title="Upscale cover" widthClass="max-w-2xl">
      <div className="space-y-4 p-5">
        {!info?.available ? (
          <p className="text-sm text-muted">
            No upscaler is configured. Set <code className="text-fg">UPSCALER_BIN</code> to a
            Real-ESRGAN binary and restart the server — see <code className="text-fg">.env.example</code>.
          </p>
        ) : !candidate ? (
          <>
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium">Current size</p>
                <p className="text-sm text-muted">
                  {comic.width} × {comic.height}px
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                {SCALES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setScale(s)}
                    className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                      scale === s
                        ? "bg-accent text-accent-fg"
                        : "bg-surface-2 text-muted ring-1 ring-border hover:text-fg"
                    }`}
                  >
                    {s}×
                  </button>
                ))}
              </div>
            </div>
            <p className="text-xs text-muted">
              → {comic.width * scale} × {comic.height * scale}px using {info.label}. The model
              invents detail rather than recovering it; 2× usually holds up on comic art, 4× can
              look synthetic. Your current cover is kept, so this is reversible.
            </p>
            <button
              type="button"
              onClick={run}
              disabled={preview.isPending}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-fg transition hover:brightness-110 disabled:opacity-50"
            >
              <Sparkles className="h-4 w-4" />
              {preview.isPending ? "Upscaling — this can take a few seconds…" : `Upscale ${scale}×`}
            </button>
          </>
        ) : (
          <>
            <Compare comic={comic} candidate={candidate} split={split} onSplit={setSplit} />
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-muted">
                {candidate.from.width} × {candidate.from.height} → {candidate.width} ×{" "}
                {candidate.height}px · {candidate.label}
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    discard.mutate({ id: comic.id, imagePath: candidate.imagePath });
                    setCandidate(null);
                  }}
                  className="rounded-lg px-3 py-1.5 text-sm text-muted transition hover:text-fg"
                >
                  Discard
                </button>
                <button
                  type="button"
                  onClick={keep}
                  disabled={accept.isPending}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-1.5 text-sm font-semibold text-accent-fg transition hover:brightness-110 disabled:opacity-50"
                >
                  <Check className="h-4 w-4" />
                  {accept.isPending ? "Saving…" : "Keep it"}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </Dialog>
  );
}

/**
 * Before/after with a draggable divider. Both images are rendered at the same
 * box size and the upscaled one is clipped to the split — comparing them at
 * identical display dimensions is the only way to see what the model actually
 * did, since side-by-side at native size just shows one bigger picture.
 *
 * The range input is the real control (keyboard-accessible, no pointer maths);
 * the visible divider is decoration positioned from the same value.
 */
function Compare({
  comic,
  candidate,
  split,
  onSplit,
}: {
  comic: ComicDTO;
  candidate: UpscaleCandidate;
  split: number;
  onSplit: (v: number) => void;
}) {
  return (
    <div className="space-y-2">
      <div
        className="relative mx-auto overflow-hidden rounded-lg bg-surface-2 ring-1 ring-border"
        style={{ aspectRatio: `${comic.width} / ${comic.height}`, maxHeight: "52vh" }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={comic.imageUrl}
          alt="Current cover"
          className="absolute inset-0 h-full w-full object-contain"
        />
        <div className="absolute inset-0 overflow-hidden" style={{ width: `${split}%` }}>
          {/* Sized to the *container*, not the clip, so the two images stay in
              register as the divider moves rather than squashing. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={candidate.imageUrl}
            alt="Upscaled cover"
            className="absolute inset-y-0 left-0 h-full max-w-none object-contain"
            style={{ width: `${(100 / split) * 100}%` }}
          />
        </div>
        <div
          aria-hidden
          className="absolute inset-y-0 w-0.5 bg-accent/80"
          style={{ left: `${split}%` }}
        />
        <span className="absolute bottom-2 left-2 rounded bg-black/60 px-1.5 py-0.5 text-[11px] text-white">
          Upscaled
        </span>
        <span className="absolute bottom-2 right-2 rounded bg-black/60 px-1.5 py-0.5 text-[11px] text-white">
          Current
        </span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        value={split}
        onChange={(e) => onSplit(Number(e.target.value))}
        aria-label="Compare upscaled against current"
        className="w-full accent-[var(--accent)]"
      />
    </div>
  );
}
