"use client";

import { useMemo } from "react";
import { useComics } from "@/lib/client-api";
import { EMPTY_FILTERS, filtersToParams, type Filters } from "@/lib/filters";
import {
  computeStats,
  ratingBucket,
  MIN_RATED_COVERS,
  type CountBucket,
  type YearPoint,
} from "@/lib/stats";
import { BarChart as BarChartIcon } from "@/components/ui/icons";
import { BarList, Histogram, Panel, StatCard, YearChart, type BarRow } from "./charts";

/**
 * The stats page: one screen of charts over the whole collection.
 *
 * Reuses `useComics(null)` rather than adding an API route, so arriving from
 * the board is instant and an upload here refreshes the numbers through the
 * existing invalidation. Bars drill through to the filtered board via
 * `filtersToParams`, so they can't drift from the URL contract it parses.
 */
export function StatsView() {
  const { data: comics, isLoading, isError, error } = useComics(null);

  const stats = useMemo(() => computeStats(comics ?? []), [comics]);

  return (
    <>
      {/* Header, tab strip and upload modal are the group layout's
          (CollectionChrome) — including the search box, which hands off to the
          board when committed from here. */}
      <main className="mx-auto max-w-[1800px] px-5 py-6">
        <h1 className="text-xl font-bold tracking-tight">Stats</h1>
        <p className="mt-0.5 text-sm text-muted">
          Your whole collection at a glance. Click any bar to see those covers.
        </p>

        {isLoading && <StatsSkeleton />}
        {isError && (
          <p className="py-20 text-center text-danger">
            {(error as Error)?.message ?? "Failed to load comics"}
          </p>
        )}
        {comics && comics.length === 0 && <EmptyStats />}

        {comics && comics.length > 0 && (
          <div className="mt-5 space-y-4">
            <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              <StatCard value={String(stats.totals.comics)} label="Covers" />
              <StatCard value={String(stats.totals.series)} label="Series" />
              <StatCard value={String(stats.totals.publishers)} label="Publishers" />
              <StatCard
                value={
                  stats.totals.averageRating === null
                    ? "—"
                    : `${stats.totals.averageRating.toFixed(1)}★`
                }
                label="Average rating"
                hint={`${stats.totals.rated} of ${stats.totals.comics} rated`}
              />
              <StatCard value={String(stats.totals.artists)} label="Cover artists" />
            </section>

            <div className="grid gap-4 lg:grid-cols-2">
              <Panel
                title="By publisher"
                subtitle={
                  stats.totals.publishers === 1
                    ? "1 publisher"
                    : `${stats.totals.publishers} publishers`
                }
              >
                <BarList
                  rows={stats.publishers.map((b) => ({
                    key: b.label,
                    label: b.label,
                    count: b.count,
                    muted: b.value === null,
                    href: b.value ? boardHref({ publishers: [b.value] }) : undefined,
                  }))}
                />
              </Panel>

              <Panel
                title="Ratings"
                subtitle={`${stats.totals.rated} of ${stats.totals.comics} rated`}
              >
                <Histogram
                  columns={stats.ratings.map((r) => ({
                    key: r.label,
                    label: r.label,
                    count: r.count,
                    // Unrated links too — "11 unrated" is only useful if you can
                    // get to the 11. `ratingBucket` is the same function the
                    // counts came from, so the bar and the board agree.
                    href:
                      r.count > 0
                        ? boardHref({ ratings: [ratingBucket(r.rating)] })
                        : undefined,
                    muted: r.rating === null,
                  }))}
                />
              </Panel>

              {/* Carries the undated count now that the decade panel is gone —
                  it was the only place surfacing how many comics have no cover
                  date, which is the caveat on any of this being complete. */}
              <Panel
                title="By release year"
                subtitle={
                  stats.totals.undated > 0
                    ? `${peakYearLabel(stats.releaseYears)} · ${stats.totals.undated} undated`
                    : peakYearLabel(stats.releaseYears)
                }
              >
                <YearChart points={stats.releaseYears} />
              </Panel>

              {/* Fills the slot the release-year panel leaves in this 2-up grid,
                  and it's the one question the other charts can't answer: they
                  all rank by volume, this one by how much you liked the work. */}
              <Panel
                title="Best-rated cover artists"
                subtitle={`Average rating · ${MIN_RATED_COVERS}+ rated covers`}
              >
                <BarList
                  // Fixed 0–5 scale: these bars are the score, not a share of
                  // the leader's score.
                  max={5}
                  rows={stats.bestArtists.map((a) => ({
                    key: a.value,
                    label: a.label,
                    count: a.average,
                    value: a.average.toFixed(1),
                    href: boardHref({ artists: [a.value] }),
                  }))}
                  empty={`No artist has ${MIN_RATED_COVERS} rated covers yet.`}
                />
              </Panel>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <Leaderboard title="Top series" rows={stats.topSeries} filter="series" />
              <Leaderboard title="Top cover artists" rows={stats.topArtists} filter="artists" />
              <Leaderboard title="Top authors" rows={stats.topAuthors} filter="authors" />
              <Leaderboard title="Top characters" rows={stats.topCharacters} filter="characters" />
            </div>
          </div>
        )}
      </main>
    </>
  );
}

/** A board URL for one filter — routed through the same serializer the board parses. */
function boardHref(patch: Partial<Filters>): string {
  const qs = filtersToParams({ ...EMPTY_FILTERS, ...patch }).toString();
  return qs ? `/?${qs}` : "/";
}

function Leaderboard({
  title,
  rows,
  filter,
}: {
  title: string;
  rows: CountBucket[];
  filter: "series" | "artists" | "authors" | "characters";
}) {
  const bars: BarRow[] = rows.map((r) => ({
    key: r.label,
    label: r.label,
    count: r.count,
    href: r.value ? boardHref({ [filter]: [r.value] }) : undefined,
  }));
  return (
    <Panel title={title}>
      <BarList rows={bars} empty="None recorded yet." />
    </Panel>
  );
}

function peakYearLabel(points: YearPoint[]): string {
  const peak = points.reduce<YearPoint | null>(
    (best, p) => (best === null || p.count > best.count ? p : best),
    null,
  );
  if (!peak || peak.count === 0) return "From cover dates";
  return `Peak: ${peak.label} (${peak.count})`;
}

function StatsSkeleton() {
  return (
    <div className="mt-5 space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 5 }, (_, i) => (
          <div
            key={i}
            className="h-[70px] animate-pulse rounded-[var(--radius-card)] bg-surface-2"
          />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {Array.from({ length: 4 }, (_, i) => (
          <div
            key={i}
            className="h-56 animate-pulse rounded-[var(--radius-card)] bg-surface-2"
          />
        ))}
      </div>
    </div>
  );
}

function EmptyStats() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-32 text-center">
      <div className="grid h-16 w-16 place-items-center rounded-2xl bg-surface-2 text-muted">
        <BarChartIcon className="h-8 w-8" />
      </div>
      <div>
        <p className="text-lg font-semibold">No stats yet</p>
        <p className="mt-1 text-sm text-muted">
          Add a few covers and this page will fill in.
        </p>
      </div>
    </div>
  );
}
