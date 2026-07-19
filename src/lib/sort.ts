import type { ComicDTO } from "./types";

export type SortKey = "added" | "coverDate" | "series" | "rating" | "manual";

export const DEFAULT_SORT: SortKey = "manual";

export const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "manual", label: "Manual order" },
  { value: "coverDate", label: "Cover date" },
  { value: "added", label: "Date added" },
  { value: "rating", label: "Rating" },
  { value: "series", label: "Series" },
];

export function isSortKey(v: string | null): v is SortKey {
  return (
    v === "added" || v === "coverDate" || v === "series" || v === "rating" || v === "manual"
  );
}

/** Leading integer of an issue string ("Annual 1" -> 1, "300" -> 300). */
function issueNumber(s: string | null): number {
  if (!s) return Number.POSITIVE_INFINITY;
  const m = s.match(/\d+/);
  return m ? parseInt(m[0], 10) : Number.POSITIVE_INFINITY;
}

/** Return a new, sorted array. `manual` uses the drag-defined board position. */
export function sortComics(comics: ComicDTO[], key: SortKey): ComicDTO[] {
  const out = [...comics];
  switch (key) {
    case "manual":
      return out.sort((a, b) => a.position - b.position);
    case "added":
      // Most recently added first.
      return out.sort((a, b) => b.createdAt - a.createdAt);
    case "coverDate":
      // Newest cover date first; undated covers sink to the bottom.
      return out.sort((a, b) => {
        if (!a.coverDate && !b.coverDate) return 0;
        if (!a.coverDate) return 1;
        if (!b.coverDate) return -1;
        return b.coverDate.localeCompare(a.coverDate);
      });
    case "series":
      // A–Z by series, then ascending issue number within a series.
      return out.sort(
        (a, b) =>
          a.series.localeCompare(b.series) || issueNumber(a.issueNumber) - issueNumber(b.issueNumber),
      );
    case "rating":
      // Highest rating first; unrated sinks to the bottom.
      return out.sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1));
  }
}
