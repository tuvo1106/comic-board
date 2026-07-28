"use client";

import { useEffect, useState } from "react";
import { useMetadataConfig, useMetadataDetail, useMetadataSearch } from "@/lib/client-api";
import { useToast } from "@/components/ui/toast";
import { Sparkles, ImageIcon, ChevronLeft } from "@/components/ui/icons";
import type { CoverOption, MetadataCandidate, MetadataDetail, ProviderId } from "@/lib/metadata/types";
import type { ComicFormValue } from "@/components/forms/MetadataForm";

const PROVIDER_LABELS: Record<ProviderId, string> = {
  metron: "Metron",
};

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
export function MetadataSearch({ value, onApply, onUseCover }: Props) {
  const { data: config } = useMetadataConfig();
  const { toast } = useToast();
  const detail = useMetadataDetail();

  const [seriesInput, setSeriesInput] = useState(value.series);
  const [issueInput, setIssueInput] = useState(value.issueNumber);
  const [query, setQuery] = useState<{ series: string; issue: string } | null>(null);

  const [picked, setPicked] = useState<MetadataDetail | null>(null);
  const [coverIdx, setCoverIdx] = useState(0);
  const [cover, setCover] = useState<LoadedCover | null>(null);
  const [coverLoading, setCoverLoading] = useState(false);

  const active = config?.default ?? null;

  const search = useMetadataSearch({
    provider: active,
    series: query?.series ?? "",
    issue: query?.issue ?? "",
    enabled: query != null,
  });

  // Load the selected cover (fetch bytes + read dimensions) whenever the picked
  // record or the chosen cover index changes. Revokes the previous object URL.
  useEffect(() => {
    if (!picked || picked.covers.length === 0) {
      setCover(null);
      return;
    }
    const opt = picked.covers[coverIdx] ?? picked.covers[0];
    let cancelled = false;
    let created: string | null = null;
    setCover(null);
    setCoverLoading(true);
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
        if (!cancelled) toast((e as Error).message, "error");
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
    if (!seriesInput.trim()) return;
    setPicked(null);
    setQuery({ series: seriesInput.trim(), issue: issueInput.trim() });
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
      <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
        <Sparkles className="h-3.5 w-3.5 text-accent" />
        Find metadata
      </div>

      <form onSubmit={submit} className="mt-3.5 flex gap-2">
        <input
          value={seriesInput}
          onChange={(e) => setSeriesInput(e.target.value)}
          placeholder="Series to search"
          className="min-w-0 flex-1 rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-sm outline-none focus:border-accent placeholder:text-muted"
        />
        <input
          value={issueInput}
          onChange={(e) => setIssueInput(e.target.value)}
          placeholder="#"
          className="w-16 rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-sm outline-none focus:border-accent placeholder:text-muted"
        />
        <button
          type="submit"
          disabled={!seriesInput.trim() || search.isFetching}
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
          onSelect={setCoverIdx}
          onBack={() => setPicked(null)}
          onUse={() => cover && onUseCover(cover.file)}
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
  onSelect,
  onBack,
  onUse,
}: {
  detail: MetadataDetail;
  coverIdx: number;
  cover: LoadedCover | null;
  coverLoading: boolean;
  onSelect: (idx: number) => void;
  onBack: () => void;
  onUse: () => void;
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
    </div>
  );
}
