/**
 * Collection statistics, computed client-side over the full comics list.
 *
 * No new SQL: the board already fetches the whole collection unpaginated, and
 * every other derived view (filters, sort, `computeFacets`) reduces over that
 * same in-memory list.
 *
 * **Invariant: every breakdown's buckets sum to the comic count.** Anything
 * without a publisher, cover date or rating lands in its own bucket, and a
 * truncated top-N carries the rest in "Other" — bars that don't add up can't
 * distinguish a small collection from missing metadata.
 */
import type { ComicDTO } from "./types";

/** A labelled count. `value` is the raw facet value for filter links; null = synthetic bucket. */
export interface CountBucket {
  value: string | null;
  label: string;
  count: number;
}

export interface DecadeBucket {
  label: string; // "1990s", or "Unknown"
  count: number;
  /** Inclusive yyyy-mm-dd range for a date-filter link; null on the Unknown bucket. */
  from: string | null;
  to: string | null;
}

export interface RatingBucket {
  rating: number | null; // null = unrated
  label: string; // "0.5" … "5", or "Unrated"
  count: number;
}

export interface YearPoint {
  year: number;
  label: string; // "1994"
  count: number;
}

export interface Totals {
  comics: number;
  series: number;
  publishers: number;
  artists: number;
  rated: number;
  /** Mean of the rated comics only, or null when nothing is rated. */
  averageRating: number | null;
  /** Comics carrying no cover date — the honest caveat on both date charts. */
  undated: number;
}

export interface Stats {
  totals: Totals;
  publishers: CountBucket[];
  decades: DecadeBucket[];
  ratings: RatingBucket[];
  releaseYears: YearPoint[];
  topSeries: CountBucket[];
  topArtists: CountBucket[];
  topAuthors: CountBucket[];
  topCharacters: CountBucket[];
}

/** Bars in the publisher breakdown before the tail collapses into "Other". */
const PUBLISHER_LIMIT = 8;
/** Rows in each leaderboard (series / artists / authors / characters). */
const LEADERBOARD_LIMIT = 10;

function tally(comics: ComicDTO[], pick: (c: ComicDTO) => string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const c of comics) {
    for (const v of pick(c)) {
      if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
    }
  }
  return counts;
}

/**
 * Highest count first, ties broken by label — so equal counts render in a
 * stable order instead of depending on insertion order (which would shuffle as
 * comics are added).
 */
function rank(counts: Map<string, number>, limit: number): CountBucket[] {
  return [...counts.entries()]
    .map(([value, count]) => ({ value, label: value, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, limit);
}

/** The four-digit year from a yyyy-mm-dd string, or null if absent/malformed. */
function yearOf(coverDate: string | null): number | null {
  if (!coverDate) return null;
  const year = Number(coverDate.slice(0, 4));
  // String-sliced rather than parsed through `Date`, matching how the rest of
  // the app treats coverDate — it's a calendar date, not an instant, and
  // `new Date("1994-05-01")` would shift it a day in negative-offset zones.
  return Number.isInteger(year) && year > 0 ? year : null;
}

function publisherBreakdown(comics: ComicDTO[]): CountBucket[] {
  const counts = tally(comics, (c) => (c.publisher ? [c.publisher] : []));
  const top = rank(counts, PUBLISHER_LIMIT);
  const buckets = [...top];

  const shown = new Set(top.map((b) => b.value));
  let other = 0;
  for (const [value, count] of counts) {
    if (!shown.has(value)) other += count;
  }
  if (other > 0) {
    buckets.push({ value: null, label: `Other (${counts.size - top.length})`, count: other });
  }

  const unattributed = comics.filter((c) => !c.publisher).length;
  if (unattributed > 0) {
    buckets.push({ value: null, label: "No publisher", count: unattributed });
  }
  return buckets;
}

/**
 * Decades spanned by cover dates, with empty decades in the middle kept as
 * zero-count buckets — a gap in a collection is information, and dropping it
 * would make 1970s-then-2010s read as if they were adjacent.
 */
function decadeBreakdown(comics: ComicDTO[]): DecadeBucket[] {
  const counts = new Map<number, number>();
  let unknown = 0;
  for (const c of comics) {
    const year = yearOf(c.coverDate);
    if (year === null) {
      unknown += 1;
      continue;
    }
    const decade = Math.floor(year / 10) * 10;
    counts.set(decade, (counts.get(decade) ?? 0) + 1);
  }

  const buckets: DecadeBucket[] = [];
  if (counts.size > 0) {
    const decades = [...counts.keys()];
    const first = Math.min(...decades);
    const last = Math.max(...decades);
    for (let d = first; d <= last; d += 10) {
      buckets.push({
        label: `${d}s`,
        count: counts.get(d) ?? 0,
        from: `${d}-01-01`,
        to: `${d + 9}-12-31`,
      });
    }
  }
  if (unknown > 0) {
    buckets.push({ label: "Unknown", count: unknown, from: null, to: null });
  }
  return buckets;
}

/**
 * Every half-star bucket, always all ten, plus unrated. Holes in a histogram
 * are the shape of the data, so empty buckets are kept rather than filtered.
 */
function ratingBreakdown(comics: ComicDTO[]): RatingBucket[] {
  const counts = new Map<number, number>();
  let unrated = 0;
  for (const c of comics) {
    // Validation pins ratings to 0.5 steps in [0.5, 5], but imports and rows
    // predating that constraint shouldn't silently vanish from the histogram —
    // snap into range instead of dropping.
    if (c.rating === null || !Number.isFinite(c.rating) || c.rating <= 0) {
      unrated += 1;
      continue;
    }
    const snapped = Math.min(5, Math.max(0.5, Math.round(c.rating * 2) / 2));
    counts.set(snapped, (counts.get(snapped) ?? 0) + 1);
  }

  const buckets: RatingBucket[] = [];
  for (let half = 1; half <= 10; half += 1) {
    const rating = half / 2;
    buckets.push({ rating, label: String(rating), count: counts.get(rating) ?? 0 });
  }
  buckets.push({ rating: null, label: "Unrated", count: unrated });
  return buckets;
}

/**
 * Covers per release year, gap-filled across the whole span.
 *
 * Keyed off `coverDate`, not `createdAt`: when you uploaded a scan is an
 * artifact of data entry. Not cumulative either — a running total of release
 * years would only restate the collection size.
 */
function releaseYears(comics: ComicDTO[]): YearPoint[] {
  const counts = new Map<number, number>();
  for (const c of comics) {
    const year = yearOf(c.coverDate);
    if (year === null) continue; // surfaced as totals.undated instead
    counts.set(year, (counts.get(year) ?? 0) + 1);
  }
  if (counts.size === 0) return [];

  const years = [...counts.keys()];
  const points: YearPoint[] = [];
  // Every year in between, including the empty ones — the quiet stretches are
  // as much a part of a collection's shape as the spikes.
  for (let y = Math.min(...years); y <= Math.max(...years); y += 1) {
    points.push({ year: y, label: String(y), count: counts.get(y) ?? 0 });
  }
  return points;
}

function totals(comics: ComicDTO[]): Totals {
  const rated = comics.filter((c) => c.rating !== null && Number.isFinite(c.rating));
  const sum = rated.reduce((acc, c) => acc + (c.rating ?? 0), 0);
  return {
    comics: comics.length,
    series: new Set(comics.map((c) => c.series).filter(Boolean)).size,
    publishers: new Set(comics.map((c) => c.publisher).filter(Boolean)).size,
    artists: new Set(comics.flatMap((c) => c.artists).filter(Boolean)).size,
    rated: rated.length,
    averageRating: rated.length > 0 ? sum / rated.length : null,
    undated: comics.filter((c) => yearOf(c.coverDate) === null).length,
  };
}

/** Entry point: every stats-page breakdown from one pass over `comics`. */
export function computeStats(comics: ComicDTO[]): Stats {
  return {
    totals: totals(comics),
    publishers: publisherBreakdown(comics),
    decades: decadeBreakdown(comics),
    ratings: ratingBreakdown(comics),
    releaseYears: releaseYears(comics),
    topSeries: rank(
      tally(comics, (c) => [c.series]),
      LEADERBOARD_LIMIT,
    ),
    topArtists: rank(
      tally(comics, (c) => c.artists),
      LEADERBOARD_LIMIT,
    ),
    topAuthors: rank(
      tally(comics, (c) => c.authors),
      LEADERBOARD_LIMIT,
    ),
    topCharacters: rank(
      tally(comics, (c) => c.characters),
      LEADERBOARD_LIMIT,
    ),
  };
}
