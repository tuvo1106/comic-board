import type { ComicDTO } from "./types";

export type SortField =
  | "manual"
  | "series"
  | "issue"
  | "publisher"
  | "coverDate"
  | "added"
  | "rating"
  | "size";

export type SortDir = "asc" | "desc";

export const DEFAULT_FIELD: SortField = "manual";

/** The "natural" direction picked when you first choose a field. */
export const NATURAL_DIR: Record<SortField, SortDir> = {
  manual: "asc",
  series: "asc",
  issue: "asc",
  publisher: "asc",
  coverDate: "desc",
  added: "desc",
  rating: "desc",
  // Ascending: the point of sorting by size is finding the *small* covers,
  // which are the ones worth upscaling.
  size: "asc",
};

export const SORT_LABELS: Record<SortField, string> = {
  manual: "Manual order",
  coverDate: "Cover date",
  added: "Date added",
  rating: "Rating",
  series: "Series",
  issue: "Issue #",
  publisher: "Publisher",
  size: "Image size",
};

/** Fields offered in the Sort dropdown, in order. */
export const SORT_MENU_FIELDS: SortField[] = [
  "manual",
  "coverDate",
  "added",
  "rating",
  "series",
  "size",
];

export function isSortField(v: string | null): v is SortField {
  return (
    v === "manual" ||
    v === "series" ||
    v === "issue" ||
    v === "publisher" ||
    v === "coverDate" ||
    v === "added" ||
    v === "rating" ||
    v === "size"
  );
}

export function isSortDir(v: string | null): v is SortDir {
  return v === "asc" || v === "desc";
}

/** Leading integer of an issue string ("Annual 1" -> 1, "300" -> 300). */
function issueNumber(s: string | null): number | null {
  if (!s) return null;
  const m = s.match(/\d+/);
  return m ? parseInt(m[0], 10) : null;
}

type Val = string | number | null;
const FIELD_VALUE: Record<Exclude<SortField, "manual">, (c: ComicDTO) => Val> = {
  series: (c) => c.series.toLowerCase(),
  issue: (c) => issueNumber(c.issueNumber),
  publisher: (c) => c.publisher?.toLowerCase() || null,
  coverDate: (c) => c.coverDate,
  added: (c) => c.createdAt,
  rating: (c) => c.rating,
  // Total pixels, not width: it ranks a wide-but-short scan below a properly
  // large one, which is what "how much detail is actually here" means.
  size: (c) => c.width * c.height,
};

const isEmpty = (v: Val) => v == null || v === "";

/** Stable tie-break so equal rows keep a deterministic order. */
function tieBreak(a: ComicDTO, b: ComicDTO): number {
  return (
    a.series.localeCompare(b.series) ||
    (issueNumber(a.issueNumber) ?? Infinity) - (issueNumber(b.issueNumber) ?? Infinity) ||
    a.id.localeCompare(b.id)
  );
}

/**
 * Return a new, sorted array. `manual` uses the drag-defined board position and
 * ignores direction. For every other field, empty values (undated, unrated,
 * no publisher/issue) always sink to the bottom regardless of direction.
 */
export function sortComics(comics: ComicDTO[], field: SortField, dir: SortDir): ComicDTO[] {
  const out = [...comics];
  if (field === "manual") return out.sort((a, b) => a.position - b.position);

  const value = FIELD_VALUE[field];
  const sign = dir === "asc" ? 1 : -1;
  return out.sort((a, b) => {
    const va = value(a);
    const vb = value(b);
    const ea = isEmpty(va);
    const eb = isEmpty(vb);
    if (ea && eb) return tieBreak(a, b);
    if (ea) return 1; // empties last, both directions
    if (eb) return -1;
    const cmp =
      typeof va === "number" && typeof vb === "number"
        ? va - vb
        : String(va).localeCompare(String(vb));
    return cmp === 0 ? tieBreak(a, b) : cmp * sign;
  });
}
