import type { ComicDTO, MetaDTO } from "./types";

export interface Filters {
  q: string;
  series: string[];
  publishers: string[];
  authors: string[];
  artists: string[]; // cover artists
  characters: string[];
  tags: string[];
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
  dateFrom: null,
  dateTo: null,
};

export function filtersActive(f: Filters): boolean {
  return (
    f.q.trim().length > 0 ||
    f.series.length > 0 ||
    f.publishers.length > 0 ||
    f.authors.length > 0 ||
    f.artists.length > 0 ||
    f.characters.length > 0 ||
    f.tags.length > 0 ||
    f.dateFrom !== null ||
    f.dateTo !== null
  );
}

export function countActive(f: Filters): number {
  return (
    f.series.length +
    f.publishers.length +
    f.authors.length +
    f.artists.length +
    f.characters.length +
    f.tags.length +
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
export function computeFacets(comics: ComicDTO[], filters?: Filters): MetaDTO {
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
  return {
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
      const haystack = [
        c.series,
        c.publisher ?? "",
        ...c.authors,
        ...c.artists,
        ...c.characters,
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
    dateFrom: params.get("from"),
    dateTo: params.get("to"),
  };
}

/** Serialize into a query string, preserving any extra params passed in `base`. */
export function filtersToParams(f: Filters, base?: URLSearchParams): URLSearchParams {
  const p = new URLSearchParams(base);
  ["q", "series", "publisher", "author", "artist", "character", "tag", "from", "to"].forEach(
    (k) => p.delete(k),
  );
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
  if (f.dateFrom) p.set("from", f.dateFrom);
  if (f.dateTo) p.set("to", f.dateTo);
  return p;
}
