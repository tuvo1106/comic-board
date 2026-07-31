"use client";

import { useEffect, useState } from "react";
import { useMeta, useMetadataConfig, useMetadataDetail, useMetadataSearch } from "@/lib/client-api";
import { suggestSearch } from "@/lib/search-suggest";
import { SuggestionList, useTypeahead } from "@/components/ui/Typeahead";
import { useToast } from "@/components/ui/toast";
import { ImageIcon, ChevronLeft } from "@/components/ui/icons";
import type { CoverOption, MetadataCandidate, MetadataDetail, ProviderId } from "@/lib/metadata/types";
import type { ComicFormValue } from "@/components/forms/MetadataForm";

const PROVIDER_LABELS: Record<ProviderId, string> = {
  metron: "Metron",
};

const PROVIDER_LISTBOX_ID = "provider-series-suggestions";

interface LoadedCover {
  objectUrl: string;
  file: File;
}

interface Props {
  /** Current form — seeds the search inputs. */
  value: ComicFormValue;
  /** Prefill the form fields from a chosen record. */
  onApply: (detail: MetadataDetail) => void;
  /** Commit a provider cover as the comic image. */
  onUseCover: (file: File) => void;
  /**
   * Take the record's details and move on without a provider image, so the user
   * can supply their own. Metron's variant coverage is community-contributed and
   * patchy, so the cover you actually own is often missing even when the record
   * is right — and before this, picking such a record was a dead end.
   *
   * Optional because it's meaningless in `ReplaceCoverDialog`, whose entire job
   * is choosing an image; omitting it hides the action rather than offering one
   * that couldn't do anything.
   */
  onUseDetails?: () => void;
  /**
   * Focus the query box on mount. Opt-in rather than always-on: this panel also
   * renders in the details step and in `ReplaceCoverDialog`, where the user has
   * already moved past searching and stealing focus would fight them.
   *
   * `Dialog` explicitly defers to a child's `autoFocus` before falling back to
   * focusing the panel, so this cooperates with the focus trap rather than
   * racing it.
   */
  autoFocus?: boolean;
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "cover";
}

/** Fetch a cover through the host-allowlisted proxy → an object URL + File. */
async function loadCover(cover: CoverOption, series: string, issue: string | null): Promise<LoadedCover> {
  const res = await fetch(`/api/metadata/cover?url=${encodeURIComponent(cover.url)}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error ?? "Could not load the cover");
  }
  const blob = await res.blob();
  const ext = blob.type === "image/png" ? "png" : blob.type === "image/webp" ? "webp" : "jpg";
  const variant = cover.label && cover.label !== "Main cover" ? `-${slug(cover.label)}` : "";
  const name = `${slug(series)}${issue ? `-${slug(issue)}` : ""}${variant}.${ext}`;
  const file = new File([blob], name, { type: blob.type || "image/jpeg" });
  return { objectUrl: URL.createObjectURL(blob), file };
}

/**
 * Autofill panel: search an external comics DB, pick a match to prefill the
 * fields, then choose among the available covers (primary + variants) to import
 * — each with a size/quality indicator. Self-hides when no provider is
 * configured; a toggle A/Bs providers.
 */
export function MetadataSearch({ value, onApply, onUseCover, onUseDetails, autoFocus }: Props) {
  const { data: config } = useMetadataConfig();
  const { toast } = useToast();
  const detail = useMetadataDetail();

  // Single free-text box seeded from the form ("Black Cat" + issue "4" → "Black Cat 4").
  const [queryInput, setQueryInput] = useState(
    value.series + (value.issueNumber ? ` ${value.issueNumber}` : ""),
  );
  const [query, setQuery] = useState<string | null>(null);

  const [picked, setPicked] = useState<MetadataDetail | null>(null);
  const [coverIdx, setCoverIdx] = useState(0);
  const [cover, setCover] = useState<LoadedCover | null>(null);
  const [coverLoading, setCoverLoading] = useState(false);
  // Tracked separately from `coverLoading`: on failure the load is finished but
  // `cover` stays null, and "still loading" is not a truthful thing to render.
  const [coverError, setCoverError] = useState(false);

  const active = config?.default ?? null;

  const search = useMetadataSearch({ provider: active, q: query ?? "", enabled: query != null });

  // Typeahead over series you already own. Suggestions come from the local
  // collection (`/api/meta`, already cached), never the provider — a remote
  // typeahead would fire a rate-limited third-party call per keystroke. It's the
  // right source anyway: the usual reason to be here is adding the next issue of
  // a run you already collect.
  const { data: meta } = useMeta();
  const seriesSuggestions = suggestSearch(meta, queryInput, { kinds: ["series"] });
  const typeahead = useTypeahead({
    listboxId: PROVIDER_LISTBOX_ID,
    value: queryInput,
    onChange: setQueryInput,
    suggestions: seriesSuggestions,
    // Trailing space: this box takes series *and* issue ("Black Cat 4"), so leave
    // the caret ready for the number. It also self-hides the list, since no
    // series name matches once a digit is appended.
    onPick: (v) => setQueryInput(`${v} `),
  });

  // Clear the previously-loaded cover the moment the selection changes, during
  // render rather than inside the effect below. Doing it in the effect renders
  // once with the stale cover still on screen and then again after clearing it —
  // the cascade `react-hooks/set-state-in-effect` flags. The object URL is still
  // revoked by the effect's cleanup, which is what owns it.
  //
  // This also fixes a stuck spinner: the old code's early-return branch cleared
  // `cover` but not `coverLoading`, so deselecting mid-load left it true forever
  // (the in-flight `.finally` is suppressed by `cancelled`).
  const [prevSelection, setPrevSelection] = useState({ picked, coverIdx });
  if (prevSelection.picked !== picked || prevSelection.coverIdx !== coverIdx) {
    setPrevSelection({ picked, coverIdx });
    setCover(null);
    setCoverError(false);
    setCoverLoading(!!picked && picked.covers.length > 0);
  }

  // Load the selected cover (fetch bytes + read dimensions) whenever the picked
  // record or the chosen cover index changes. Revokes the previous object URL.
  useEffect(() => {
    if (!picked || picked.covers.length === 0) return;
    const opt = picked.covers[coverIdx] ?? picked.covers[0];
    let cancelled = false;
    let created: string | null = null;
    loadCover(opt, picked.series, picked.issueNumber)
      .then((c) => {
        if (cancelled) {
          URL.revokeObjectURL(c.objectUrl);
          return;
        }
        created = c.objectUrl;
        setCover(c);
      })
      .catch((e) => {
        if (cancelled) return;
        setCoverError(true);
        toast((e as Error).message, "error");
      })
      .finally(() => {
        if (!cancelled) setCoverLoading(false);
      });
    return () => {
      cancelled = true;
      if (created) URL.revokeObjectURL(created);
    };
    // toast is stable enough; re-running on picked/coverIdx only is intended.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picked, coverIdx]);

  if (!config || config.providers.length === 0) return null;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!queryInput.trim()) return;
    setPicked(null);
    setQuery(queryInput.trim());
  };

  const pick = async (c: MetadataCandidate) => {
    try {
      const d = await detail.mutateAsync({ provider: c.provider, ref: c.ref, issue: c.issueNumber });
      onApply(d);
      toast(`Filled from ${PROVIDER_LABELS[c.provider]}`, "success");
      setCoverIdx(0);
      // Normalize covers defensively — a stale cache entry from an older server
      // build could omit the field.
      setPicked({ ...d, covers: d.covers ?? [] });
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };

  const candidates = search.data?.candidates ?? [];

  return (
    <div className="rounded-xl border border-border bg-surface-2/40 p-3">
      <form onSubmit={submit} className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          <input
            {...typeahead.inputProps}
            autoFocus={autoFocus}
            placeholder="Series and issue — e.g. Black Cat 4"
            className="w-full rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-sm outline-none focus:border-accent placeholder:text-muted"
          />
          {typeahead.open && (
            <SuggestionList
              id={PROVIDER_LISTBOX_ID}
              anchorRef={typeahead.anchorRef}
              suggestions={seriesSuggestions}
              activeIndex={typeahead.activeIndex}
              onHover={typeahead.setActiveIndex}
              onPick={typeahead.pick}
              // Every row is a series here, so the field label would be noise.
              // The count (issues of that run already owned) still earns its place.
              showKind={false}
            />
          )}
        </div>
        <button
          type="submit"
          disabled={!queryInput.trim() || search.isFetching}
          className="rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-accent-fg transition hover:brightness-110 disabled:opacity-50"
        >
          {search.isFetching ? "…" : "Search"}
        </button>
      </form>

      {picked ? (
        <PickedCard
          detail={picked}
          coverIdx={coverIdx}
          cover={cover}
          coverLoading={coverLoading}
          coverError={coverError}
          onSelect={setCoverIdx}
          onBack={() => setPicked(null)}
          onUse={() => cover && onUseCover(cover.file)}
          onUseDetails={onUseDetails}
        />
      ) : (
        query != null && (
          <div className="mt-2">
            {search.isError ? (
              <p className="px-1 py-2 text-sm text-red-400">{(search.error as Error).message}</p>
            ) : search.isFetching ? (
              <p className="px-1 py-2 text-sm text-muted">Searching {PROVIDER_LABELS[active!]}…</p>
            ) : candidates.length === 0 ? (
              <p className="px-1 py-2 text-sm text-muted">No matches — try a different spelling.</p>
            ) : (
              <ul className="max-h-56 space-y-1 overflow-y-auto">
                {candidates.map((c) => {
                  const meta = [
                    c.publisher,
                    c.issueNumber ? `#${c.issueNumber}` : null,
                    c.issueCount ? `${c.issueCount} issues` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ");
                  return (
                    <li key={`${c.provider}:${c.ref}`}>
                      <button
                        type="button"
                        disabled={detail.isPending}
                        onClick={() => pick(c)}
                        className="flex w-full items-center gap-3 rounded-lg p-1.5 text-left transition hover:bg-surface-2 disabled:opacity-60"
                      >
                        <div className="grid h-14 w-10 shrink-0 place-items-center overflow-hidden rounded bg-surface-2 text-muted ring-1 ring-border">
                          {c.coverThumbUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={c.coverThumbUrl} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <ImageIcon className="h-4 w-4" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">
                            {c.series}
                            {c.year ? <span className="text-muted"> ({c.year})</span> : null}
                          </p>
                          {meta && <p className="truncate text-xs text-muted">{meta}</p>}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )
      )}

      {(picked || candidates.length > 0) && (
        <p className="mt-2 text-[11px] text-muted">Results from {PROVIDER_LABELS[active!]}</p>
      )}
    </div>
  );
}

function PickedCard({
  detail: d,
  coverIdx,
  cover,
  coverLoading,
  coverError,
  onSelect,
  onBack,
  onUse,
  onUseDetails,
}: {
  detail: MetadataDetail;
  coverIdx: number;
  cover: LoadedCover | null;
  coverLoading: boolean;
  coverError: boolean;
  onSelect: (idx: number) => void;
  onBack: () => void;
  onUse: () => void;
  onUseDetails?: () => void;
}) {
  const covers = d.covers ?? [];
  const selected = covers[coverIdx];
  return (
    <div className="mt-2 rounded-lg bg-surface-2/60 p-2 ring-1 ring-border">
      <button
        type="button"
        onClick={onBack}
        className="mb-2 inline-flex items-center gap-1 text-xs text-muted transition hover:text-fg"
      >
        <ChevronLeft className="h-3.5 w-3.5" /> Back to results
      </button>

      <div className="flex gap-3">
        <div className="grid h-24 w-16 shrink-0 place-items-center overflow-hidden rounded bg-surface-2 text-muted ring-1 ring-border">
          {cover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={cover.objectUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <ImageIcon className="h-5 w-5" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">
            {d.series}
            {d.issueNumber ? <span className="text-muted"> #{d.issueNumber}</span> : null}
          </p>
          {selected && <p className="truncate text-xs text-muted">{selected.label}</p>}
          {covers.length === 0 ? (
            <p className="mt-1 text-xs text-muted">No cover available from this provider.</p>
          ) : coverError ? (
            // Must come before the loading branch: on failure the fetch is done
            // but `cover` is still null, and claiming it's loading would be a
            // spinner that never resolves.
            <p className="mt-1 text-xs text-red-400">Couldn&rsquo;t load this cover.</p>
          ) : coverLoading || !cover ? (
            <p className="mt-1 text-xs text-muted">Loading cover…</p>
          ) : null}
        </div>
      </div>

      {covers.length > 1 && (
        <div className="mt-2">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">
            {covers.length} covers
          </p>
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {covers.map((c, i) => (
              <button
                key={`${c.url}:${i}`}
                type="button"
                title={c.label}
                onClick={() => onSelect(i)}
                className={`h-16 w-11 shrink-0 overflow-hidden rounded bg-surface-2 ring-1 transition ${
                  i === coverIdx ? "ring-2 ring-accent" : "ring-border hover:ring-muted"
                }`}
              >
                {/* Direct CDN URL is fine for display; the proxy is only needed
                    for the byte fetch (CORS + host allowlist) on import. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={c.url} alt={c.label} loading="lazy" className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
        </div>
      )}

      {covers.length > 0 && (
        <button
          type="button"
          onClick={onUse}
          disabled={!cover || coverLoading}
          className="mt-2 w-full rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-accent-fg transition hover:brightness-110 disabled:opacity-50"
        >
          Use this cover
        </button>
      )}

      {/*
        Always offered, not just when the provider has no cover. The common case
        isn't "no covers at all" — it's "the record is right, but the variant I
        own isn't among the ones Metron has", where the main cover loads fine and
        is still the wrong image. With covers present this is the quiet
        alternative; with none it's the only way forward, so it takes over as the
        primary action rather than leaving a dead end.
      */}
      {onUseDetails && (
        <button
          type="button"
          onClick={onUseDetails}
          className={
            covers.length > 0
              ? "mt-1.5 w-full rounded-lg px-3 py-1.5 text-xs text-muted transition hover:bg-surface-2 hover:text-fg"
              : "mt-2 w-full rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-accent-fg transition hover:brightness-110"
          }
        >
          {covers.length > 0
            ? "Use details only — I’ll add my own image"
            : "Use details, add my own image"}
        </button>
      )}
    </div>
  );
}
