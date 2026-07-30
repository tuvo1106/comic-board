"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useComics } from "@/lib/client-api";
import { EMPTY_FILTERS, filtersToParams, type Filters } from "@/lib/filters";
import { computeStats, type CountBucket, type YearPoint } from "@/lib/stats";
import { TopBar } from "@/components/board/TopBar";
import { UploadModal } from "@/components/upload/UploadModal";
import { BarChart as BarChartIcon } from "@/components/ui/icons";
import { BarList, Histogram, Panel, StatCard, YearChart, type BarRow } from "./charts";

/**
 * The stats page: one screen of charts over the whole collection.
 *
 * It reuses `useComics(null)` rather than adding an API route, so arriving from
 * the board is instant (the list is already in the React Query cache) and an
 * upload here refreshes the numbers through the same invalidation everything
 * else uses. See `src/lib/stats.ts` for why the maths is client-side.
 *
 * Bars drill through to the board: clicking a publisher, decade or leaderboard
 * row lands on the filtered collection. Those links are built through
 * `filtersToParams`, so they can't drift from the URL contract the board reads.
 */
export function StatsView() {
  const router = useRouter();
  const { data: comics, isLoading, isError, error } = useComics(null);
  const [addOpen, setAddOpen] = useState(false);
  const [search, setSearch] = useState("");

  const stats = useMemo(() => computeStats(comics ?? []), [comics]);

  // Searching from here means "go find these" — there's nothing on this page to
  // filter, so a committed search hands off to the board.
  const goSearch = (value: string) => {
    const q = value.trim();
    router.push(q ? `/?q=${encodeURIComponent(q)}` : "/");
  };

  return (
    <div className="min-h-screen">
      <TopBar
        search={search}
        onSearch={setSearch}
        onSearchCommit={goSearch}
        onSearchSubmit={goSearch}
        onAdd={() => setAddOpen(true)}
      />
      <UploadModal open={addOpen} onClose={() => setAddOpen(false)} />

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
                title="By decade"
                subtitle={
                  stats.totals.undated > 0
                    ? `${stats.totals.undated} with no cover date`
                    : "From cover dates"
                }
              >
                <BarList
                  rows={stats.decades.map((d) => ({
                    key: d.label,
                    label: d.label,
                    count: d.count,
                    muted: d.from === null,
                    href:
                      d.from && d.to ? boardHref({ dateFrom: d.from, dateTo: d.to }) : undefined,
                  }))}
                />
              </Panel>

              <Panel
                title="Ratings"
                // No rating filter exists on the board, so unlike every other
                // chart here these bars aren't links — hence the plain histogram.
                subtitle={`${stats.totals.rated} of ${stats.totals.comics} rated`}
              >
                <Histogram
                  columns={stats.ratings.map((r) => ({
                    key: r.label,
                    label: r.label,
                    count: r.count,
                    muted: r.rating === null,
                  }))}
                />
              </Panel>

              <Panel title="By release year" subtitle={peakYearLabel(stats.releaseYears)}>
                <YearChart points={stats.releaseYears} />
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
    </div>
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
