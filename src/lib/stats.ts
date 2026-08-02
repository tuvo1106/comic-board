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

/** A cover artist ranked by how their rated covers score, not by how many they drew. */
export interface RatedBucket {
  value: string;
  label: string;
  /** Mean rating across `rated` covers. */
  average: number;
  rated: number;
}

export interface Stats {
  totals: Totals;
  publishers: CountBucket[];
  ratings: RatingBucket[];
  releaseYears: YearPoint[];
  topSeries: CountBucket[];
  topArtists: CountBucket[];
  topAuthors: CountBucket[];
  topCharacters: CountBucket[];
  bestArtists: RatedBucket[];
}

/** Bars in the publisher breakdown before the tail collapses into "Other". */
const PUBLISHER_LIMIT = 8;
/** Rows in each leaderboard (series / artists / authors / characters). */
const LEADERBOARD_LIMIT = 10;
/** Rated covers an artist needs before their average means anything. */
export const MIN_RATED_COVERS = 2;

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

/** The rating filter's value for "has no usable rating". */
export const RATING_UNRATED = "unrated";

/**
 * The half-star bucket a rating falls in: `"0.5"` … `"5"`, or `"unrated"`.
 *
 * Shared with the rating filter (`applyFilters`) rather than duplicated there,
 * because the histogram's bars link to the board filtered by this value — if
 * the two ever snapped differently, a bar reading 11 would drill through to a
 * different number of covers, which is worse than not linking at all.
 *
 * Validation pins ratings to 0.5 steps in [0.5, 5], but imports and rows
 * predating that constraint shouldn't silently vanish — snap into range
 * instead of dropping.
 */
export function ratingBucket(rating: number | null): string {
  if (rating === null || !Number.isFinite(rating) || rating <= 0) return RATING_UNRATED;
  return String(Math.min(5, Math.max(0.5, Math.round(rating * 2) / 2)));
}

/**
 * Every half-star bucket, always all ten, plus unrated. Holes in a histogram
 * are the shape of the data, so empty buckets are kept rather than filtered.
 */
function ratingBreakdown(comics: ComicDTO[]): RatingBucket[] {
  const counts = new Map<string, number>();
  for (const c of comics) {
    const key = ratingBucket(c.rating);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const buckets: RatingBucket[] = [];
  for (let half = 1; half <= 10; half += 1) {
    const rating = half / 2;
    const label = String(rating);
    buckets.push({ rating, label, count: counts.get(label) ?? 0 });
  }
  buckets.push({
    rating: null,
    label: "Unrated",
    count: counts.get(RATING_UNRATED) ?? 0,
  });
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

/**
 * Cover artists ranked by mean rating.
 *
 * **Requires `MIN_RATED_COVERS` rated covers to appear at all.** Without a
 * floor this chart is a list of whoever happens to have exactly one 5★ cover —
 * a single rating is not an average, and it would rank a one-off above an
 * artist you've rated a dozen times. That does mean the panel is empty for a
 * collection with no repeat artists, which is the honest answer rather than a
 * misleading one; the panel says so.
 *
 * Unrated covers are ignored, not counted as zero: "not rated yet" and "rated
 * badly" are different statements, and averaging the former in would punish
 * artists for covers you haven't got to.
 */
function bestArtists(comics: ComicDTO[]): RatedBucket[] {
  const sums = new Map<string, { sum: number; rated: number }>();
  for (const c of comics) {
    if (c.rating === null || !Number.isFinite(c.rating) || c.rating <= 0) continue;
    for (const artist of c.artists) {
      if (!artist) continue;
      const entry = sums.get(artist) ?? { sum: 0, rated: 0 };
      entry.sum += c.rating;
      entry.rated += 1;
      sums.set(artist, entry);
    }
  }
  return [...sums.entries()]
    .filter(([, { rated }]) => rated >= MIN_RATED_COVERS)
    .map(([value, { sum, rated }]) => ({ value, label: value, average: sum / rated, rated }))
    // More rated covers breaks a tie: the same 4.5 over five covers is the
    // better-evidenced 4.5.
    .sort((a, b) => b.average - a.average || b.rated - a.rated || a.label.localeCompare(b.label))
    .slice(0, LEADERBOARD_LIMIT);
}

function totals(comics: ComicDTO[]): Totals {
  // Through `ratingBucket`, so "N of M rated" can't disagree with the Unrated
  // bar beside it. They previously differed on `rating === 0`: counted here as
  // rated, bucketed there as unrated. Harmless while the bar was inert; now
  // that it drills through, the two numbers are read against each other.
  const rated = comics.filter((c) => ratingBucket(c.rating) !== RATING_UNRATED);
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
    bestArtists: bestArtists(comics),
  };
}
