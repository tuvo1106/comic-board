"use client";

import { useEffect, useState } from "react";
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
import { upscaleTarget } from "@/lib/upscale/types";

// The model is 4x-native, and 4x is the only factor offered: anything smaller
// meant resampling its output back down, and in practice that option went
// unused. The API still accepts 2 — see `isUpscaleScale` — so reintroducing a
// selector is a UI change, not a server one.
const SCALE = 4;

interface Props {
  comic: ComicDTO;
  open: boolean;
  onClose: () => void;
}

/**
 * Runs an upscale on open, shows it against the current cover, and keeps or
 * discards it. Nothing is committed until "Keep it" — the candidate is a real
 * stored image that no comic points at, so declining just deletes a folder.
 *
 * Mounted with `key={comic.id}` by the caller, so switching comics gets a fresh
 * instance rather than needing reset logic here — a previous run's result must
 * never be shown against the wrong cover.
 */
export function UpscaleDialog({ comic, open, onClose }: Props) {
  const { toast } = useToast();
  const { data: info } = useUpscalerInfo();
  const preview = usePreviewUpscale();
  const accept = useAcceptUpscale();
  const discard = useDiscardUpscale();

  const [split, setSplit] = useState(50);

  // Capped, so this matches what the server will actually store.
  const target = upscaleTarget(comic.width, comic.height, SCALE);

  // The candidate lives in the mutation's own cache rather than local state.
  // Mirroring it into `useState` meant the auto-run effect below set state,
  // which `react-hooks/set-state-in-effect` flags — correctly: the mirror could
  // drift from the mutation's status, and there was nothing it could express
  // that `preview.data` couldn't.
  const candidate: UpscaleCandidate | null = preview.data ?? null;

  // Closing with an unaccepted candidate would leave it orphaned on disk, and
  // the sweep only ever looks at soft-deleted comics — nothing else would
  // collect it. Fire-and-forget: the dialog is already gone, and a failed
  // cleanup shouldn't produce a toast about something the user didn't ask for.
  const dismiss = () => {
    if (candidate) discard.mutate({ id: comic.id, imagePath: candidate.imagePath });
    // Reset, or the mutation keeps serving the candidate we just deleted:
    // reopening would show a comparison against files that no longer exist and
    // "Keep it" would try to adopt a dead path. It also puts the mutation back
    // to idle, which is what the auto-run effect keys on.
    preview.reset();
    setSplit(50);
    onClose();
  };

  // With a single scale there was nothing to decide on an opening step — it was
  // a button that said "yes really" — so opening the dialog starts the upscale
  // and you land on the comparison. An accidental open costs a few seconds of
  // GPU and a discarded folder; nothing is committed either way.
  useEffect(() => {
    if (open && preview.isIdle) preview.mutate({ id: comic.id, scale: SCALE });
    // Keyed on `open` alone: re-running on every status change would restart the
    // upscale the moment one finished.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const keep = async () => {
    if (!candidate) return;
    try {
      await accept.mutateAsync({ id: comic.id, imagePath: candidate.imagePath });
      toast("Upscaled cover saved", "success");
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
            Real-ESRGAN binary and restart the server — see{" "}
            <code className="text-fg">.env.example</code>.
          </p>
        ) : preview.isError ? (
          <div className="space-y-3">
            <p className="text-sm text-red-400">
              {(preview.error as Error)?.message ?? "The upscaler failed on this cover."}
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={dismiss}
                className="rounded-lg px-3 py-1.5 text-sm text-muted transition hover:text-fg"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => preview.mutate({ id: comic.id, scale: SCALE })}
                className="rounded-lg bg-accent px-3.5 py-1.5 text-sm font-semibold text-accent-fg transition hover:brightness-110"
              >
                Try again
              </button>
            </div>
          </div>
        ) : !candidate ? (
          // Running. Names the target size so the wait is legible rather than a
          // bare spinner.
          <div className="space-y-3 py-8 text-center">
            <Sparkles className="mx-auto h-6 w-6 animate-pulse text-accent" />
            <p className="text-sm font-medium">
              Upscaling to {target.width} × {target.height}px…
            </p>
            <p
              className="text-xs text-muted"
              title="Upscaling invents plausible detail rather than recovering what was lost. Your current cover is kept, so you can revert."
            >
              {info.label} · this can take a few seconds · revertible
            </p>
          </div>
        ) : (
          <>
            <Compare comic={comic} candidate={candidate} split={split} onSplit={setSplit} />
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-muted">
                {candidate.from.width} × {candidate.from.height} → {candidate.width} ×{" "}
                {candidate.height}px · {candidate.label}
              </p>
              <div className="flex items-center gap-2">
                {/* Closes rather than clearing the candidate: with no opening
                    step there's nothing to go back to, and the auto-run effect
                    is keyed on `open`, so staying put would sit on the running
                    state forever. */}
                <button
                  type="button"
                  onClick={dismiss}
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
        className="relative mx-auto overflow-hidden rounded-lg bg-black/40 ring-1 ring-border"
        style={{ aspectRatio: `${comic.width} / ${comic.height}`, maxHeight: "52vh" }}
      >
        {/* Same two-layer blurred backdrop as the detail modal: `blurDataUrl`
            paints instantly with no request but is too small to show detail,
            and the thumbnail on top carries real artwork and is already loaded.
            Scaled up so the blur's soft edges don't reveal the container edge. */}
        <div
          aria-hidden
          className="absolute inset-0 scale-110 bg-cover bg-center blur-2xl"
          style={{ backgroundImage: `url(${comic.blurDataUrl})` }}
        />
        <div
          aria-hidden
          className="absolute inset-0 scale-110 bg-cover bg-center blur-lg"
          style={{ backgroundImage: `url(${comic.thumbUrl})` }}
        />
        <div aria-hidden className="absolute inset-0 bg-black/30" />
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
