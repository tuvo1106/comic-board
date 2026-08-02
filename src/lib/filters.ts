import { RATING_UNRATED, ratingBucket } from "./stats";
import type { ComicDTO, MetaDTO } from "./types";

export interface Filters {
  q: string;
  series: string[];
  publishers: string[];
  authors: string[];
  artists: string[]; // cover artists
  characters: string[];
  tags: string[];
  /** Half-star buckets as strings ("0.5"…"5"), plus "unrated". See `ratingBucket`. */
  ratings: string[];
  dateFrom: string | null; // yyyy-mm-dd (inclusive)
  dateTo: string | null; // yyyy-mm-dd (inclusive)
}

export const EMPTY_FILTERS: Filters = {
  q: "",
  series: [],
  publishers: [],
  authors: [],
  artists: [],
  characters: [],
  tags: [],
  ratings: [],
  dateFrom: null,
  dateTo: null,
};

/** Display form for a rating filter value — the URL keeps the raw bucket. */
export function ratingLabel(value: string): string {
  return value === RATING_UNRATED ? "Unrated" : `${value}★`;
}

export function filtersActive(f: Filters): boolean {
  return (
    f.q.trim().length > 0 ||
    f.series.length > 0 ||
    f.publishers.length > 0 ||
    f.authors.length > 0 ||
    f.artists.length > 0 ||
    f.characters.length > 0 ||
    f.tags.length > 0 ||
    f.ratings.length > 0 ||
    f.dateFrom !== null ||
    f.dateTo !== null
  );
}

/** How to clear a single active chip — a discriminated action the UI dispatches. */
export type ChipRemoval =
  | {
      type: "toggle";
      key: "publishers" | "authors" | "artists" | "characters" | "tags" | "ratings";
      value: string;
    }
  | { type: "date"; field: "dateFrom" | "dateTo" };

/** A single active-filter chip, carrying its facet so shared values read unambiguously. */
export interface ActiveChip {
  key: string;
  facet: string;
  label: string;
  remove: ChipRemoval;
}

// Facet → its display prefix and the array key `toggle` acts on, in chip order.
const FACET_CHIPS: {
  key: "publishers" | "authors" | "artists" | "characters" | "tags" | "ratings";
  facet: string;
  prefix: string;
  /** Chips show the display form; the filter value stays URL-shaped. */
  format?: (value: string) => string;
}[] = [
  { key: "publishers", facet: "Publisher", prefix: "p" },
  { key: "authors", facet: "Author", prefix: "au" },
  { key: "artists", facet: "Cover Artist", prefix: "a" },
  { key: "characters", facet: "Character", prefix: "c" },
  { key: "tags", facet: "Tag", prefix: "t" },
  { key: "ratings", facet: "Rating", prefix: "r", format: ratingLabel },
];

/**
 * Derive the active-filter chips (facet + value + removal action) from filters.
 * Each chip names its facet so a value shared across facets — e.g. "Jim Lee" as
 * both Author and Cover Artist — is unambiguous. Note: `q` has its own search UI
 * and is intentionally excluded here.
 */
export function activeChips(f: Filters): ActiveChip[] {
  const chips: ActiveChip[] = [];
  for (const { key, facet, prefix, format } of FACET_CHIPS) {
    for (const value of f[key]) {
      chips.push({
        key: `${prefix}-${value}`,
        facet,
        label: format ? format(value) : value,
        remove: { type: "toggle", key, value },
      });
    }
  }
  if (f.dateFrom)
    chips.push({ key: "from", facet: "From", label: f.dateFrom, remove: { type: "date", field: "dateFrom" } });
  if (f.dateTo)
    chips.push({ key: "to", facet: "To", label: f.dateTo, remove: { type: "date", field: "dateTo" } });
  return chips;
}

export function countActive(f: Filters): number {
  return (
    f.series.length +
    f.publishers.length +
    f.authors.length +
    f.artists.length +
    f.characters.length +
    f.tags.length +
    f.ratings.length +
    (f.dateFrom ? 1 : 0) +
    (f.dateTo ? 1 : 0) +
    (f.q.trim() ? 1 : 0)
  );
}

function overlaps(a: string[], b: string[]): boolean {
  const set = new Set(b.map((x) => x.toLowerCase()));
  return a.some((x) => set.has(x.toLowerCase()));
}

/**
 * Facet options + counts derived from a set of comics — used for the filter
 * dropdowns so counts reflect the board you're viewing, not the whole library.
 * (Form autocomplete still uses the global /api/meta.)
 *
 * When `filters` is supplied, each facet's counts respect every *other* active
 * filter but ignore that facet's own selections (standard faceted search): with
 * Publisher=DC active, the Author counts reflect only DC comics, yet the
 * Publisher list still shows every publisher so you can widen the selection.
 */
/**
 * `MetaDTO` plus the facets that only exist board-side. Ratings aren't in
 * `MetaDTO` because that type is also the `/api/meta` autocomplete payload,
 * where a rating is not a name you type.
 */
export interface BoardFacets extends MetaDTO {
  ratings: { value: string; label: string; count: number }[];
}

export function computeFacets(comics: ComicDTO[], filters?: Filters): BoardFacets {
  const tally = (source: ComicDTO[], pick: (c: ComicDTO) => string[]) => {
    const m = new Map<string, number>();
    for (const c of source) {
      for (const v of pick(c)) {
        if (v) m.set(v, (m.get(v) ?? 0) + 1);
      }
    }
    return [...m.entries()]
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => a.value.localeCompare(b.value));
  };
  // For a facet, the comics to count over: everything matching the other
  // filters, with this facet's own selections cleared. With no filters this is
  // just the full list, so behavior is unchanged.
  const scoped = (facet: keyof Filters) =>
    filters ? applyFilters(comics, { ...filters, [facet]: [] }) : comics;

  // Highest first, with Unrated last — a rating scale has an order, so the
  // alphabetical sort the name facets use would read as noise ("0.5, 1, 1.5,
  // 2, 2.5, 3, 3.5, 4, 4.5, 5" sorts as "0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5,
  // 5" by luck, but "10" would land between "1" and "1.5" if the scale grew).
  // Only buckets that actually hold something, like every other facet.
  const ratingCounts = new Map<string, number>();
  for (const c of scoped("ratings")) {
    const key = ratingBucket(c.rating);
    ratingCounts.set(key, (ratingCounts.get(key) ?? 0) + 1);
  }
  const ratings = [...ratingCounts.entries()]
    .sort(([a], [b]) => {
      if (a === RATING_UNRATED) return 1;
      if (b === RATING_UNRATED) return -1;
      return Number(b) - Number(a);
    })
    .map(([value, count]) => ({ value, label: ratingLabel(value), count }));

  return {
    ratings,
    series: tally(scoped("series"), (c) => [c.series]),
    publishers: tally(scoped("publishers"), (c) => (c.publisher ? [c.publisher] : [])),
    authors: tally(scoped("authors"), (c) => c.authors),
    artists: tally(scoped("artists"), (c) => c.artists),
    characters: tally(scoped("characters"), (c) => c.characters),
    tags: tally(scoped("tags"), (c) => c.tags),
  };
}

export function applyFilters(comics: ComicDTO[], f: Filters): ComicDTO[] {
  const q = f.q.trim().toLowerCase();
  return comics.filter((c) => {
    if (q) {
      // issueNumber is intentionally excluded: it's a short numeric token, so a
      // substring match ("3") would spuriously hit "23", "13", "30", etc. Use
      // the exact issue-number field/facet if you need to find a specific issue.
      const haystack = [
        c.series,
        c.publisher ?? "",
        ...c.authors,
        ...c.artists,
        ...c.characters,
        ...c.tags,
      ]
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    if (f.series.length && !f.series.includes(c.series)) return false;
    if (f.publishers.length && !(c.publisher && f.publishers.includes(c.publisher))) return false;
    if (f.authors.length && !overlaps(c.authors, f.authors)) return false;
    if (f.artists.length && !overlaps(c.artists, f.artists)) return false;
    if (f.characters.length && !overlaps(c.characters, f.characters)) return false;
    if (f.tags.length && !overlaps(c.tags, f.tags)) return false;
    // Bucketed, not compared numerically: the histogram's "4.5" bar means the
    // 4.5 bucket, and this has to select exactly the covers it counted.
    if (f.ratings.length && !f.ratings.includes(ratingBucket(c.rating))) return false;

    if (f.dateFrom && (!c.coverDate || c.coverDate < f.dateFrom)) return false;
    if (f.dateTo && (!c.coverDate || c.coverDate > f.dateTo)) return false;
    return true;
  });
}

// ---------------------------------------------------------------------------
// URL <-> Filters serialization
// ---------------------------------------------------------------------------

export function filtersFromParams(params: URLSearchParams): Filters {
  // Multi-valued facets use repeated params (?author=A&author=B), not a single
  // delimited value — a raw delimiter would break on any value that contained
  // it (e.g. a "~" or "," in an author name). URLSearchParams handles encoding.
  const getAll = (key: string) => params.getAll(key).filter(Boolean);
  return {
    q: params.get("q") ?? "",
    series: getAll("series"),
    publishers: getAll("publisher"),
    authors: getAll("author"),
    artists: getAll("artist"),
    characters: getAll("character"),
    tags: getAll("tag"),
    ratings: getAll("rating"),
    dateFrom: params.get("from"),
    dateTo: params.get("to"),
  };
}

/** Serialize into a query string, preserving any extra params passed in `base`. */
export function filtersToParams(f: Filters, base?: URLSearchParams): URLSearchParams {
  const p = new URLSearchParams(base);
  [
    "q",
    "series",
    "publisher",
    "author",
    "artist",
    "character",
    "tag",
    "rating",
    "from",
    "to",
  ].forEach((k) => p.delete(k));
  const appendAll = (key: string, values: string[]) => {
    for (const v of values) p.append(key, v);
  };
  if (f.q.trim()) p.set("q", f.q.trim());
  appendAll("series", f.series);
  appendAll("publisher", f.publishers);
  appendAll("author", f.authors);
  appendAll("artist", f.artists);
  appendAll("character", f.characters);
  appendAll("tag", f.tags);
  appendAll("rating", f.ratings);
  if (f.dateFrom) p.set("from", f.dateFrom);
  if (f.dateTo) p.set("to", f.dateTo);
  return p;
}
