import type { MetaDTO } from "./types";

export type SuggestionKind =
  | "series"
  | "publisher"
  | "author"
  | "artist"
  | "character"
  | "tag";

export interface Suggestion {
  value: string;
  kind: SuggestionKind;
  /** How many comics carry this value in this field (straight from `getMeta`). */
  count: number;
  /** Human-readable kind, shown dimmed on the right of the row. */
  label: string;
}

const KIND_LABEL: Record<SuggestionKind, string> = {
  series: "Series",
  publisher: "Publisher",
  author: "Author",
  artist: "Cover artist",
  character: "Character",
  tag: "Tag",
};

/**
 * The six `MetaDTO` lists, in the order they're preferred on a tie.
 *
 * These deliberately mirror `applyFilters`' free-text haystack exactly (series,
 * publisher, authors, artists, characters, tags) — if the two drift apart the
 * dropdown starts either suggesting terms that match nothing or missing terms
 * that would. Note `issueNumber` is absent from both on purpose: it's a short
 * numeric token, so substring-matching "3" would hit "13", "23", "30" (see the
 * comment in `filters.ts`).
 */
const SOURCES: [keyof MetaDTO, SuggestionKind][] = [
  ["series", "series"],
  ["publishers", "publisher"],
  ["authors", "author"],
  ["artists", "artist"],
  ["characters", "character"],
  ["tags", "tag"],
];

/**
 * Which field wins when the *same* value exists in more than one of them —
 * "Batman" is both a series and a character, and under free-text search both
 * rows would run the identical query, so only one is shown.
 *
 * Character first, deliberately: in a comic collection the character reading is
 * the more natural one for a name that's also a series title. The rest is a
 * fixed (if somewhat arbitrary) order — the point is that it's *stated*, so the
 * outcome is predictable rather than depending on which field happened to have
 * a higher count that day.
 *
 * Consequence worth knowing: the surviving row shows the preferred field's
 * label and count, and is ranked by that count — so a term that's a major
 * series but a minor character ranks by the smaller character count. Predictable
 * beats clever here.
 */
const KIND_PRIORITY: SuggestionKind[] = [
  "character",
  "series",
  "publisher",
  "author",
  "artist",
  "tag",
];

const TOTAL = 5;

/**
 * Typeahead suggestions for the collection search box, built entirely from the
 * already-cached `/api/meta` payload — no new endpoint, no server round-trip.
 *
 * Ranking: prefix matches first (typing "bat" should surface "Batman" above
 * "Absolute Batman"), then by how many comics carry the value, then
 * alphabetically so the order is stable rather than dependent on the API's
 * iteration order.
 *
 * Everything is case-insensitive: matching, the "already typed it in full"
 * check, de-duplication, and the alphabetical tie-break.
 *
 * Values appearing in several fields collapse to a single row (see
 * `KIND_PRIORITY`) — picking either would run the identical free-text search,
 * so two rows for one outcome is just noise.
 */
export function suggestSearch(
  meta: MetaDTO | undefined,
  query: string,
  opts: { total?: number } = {},
): Suggestion[] {
  const total = opts.total ?? TOTAL;
  const q = query.trim().toLowerCase();
  if (!meta || !q) return [];

  // Keyed by lower-cased value: series is a plain column while characters, tags
  // etc. are their own tables, so the same name can differ in case *across*
  // fields even though each field de-dupes internally.
  const groups = new Map<string, Suggestion & { prefix: number }>();
  for (const [key, kind] of SOURCES) {
    for (const { value, count } of meta[key] ?? []) {
      const lower = value.toLowerCase();
      if (!lower.includes(q)) continue;
      // Already typed in full — suggesting it back is a no-op row.
      if (lower === q) continue;
      const existing = groups.get(lower);
      if (existing && KIND_PRIORITY.indexOf(existing.kind) <= KIND_PRIORITY.indexOf(kind)) {
        continue;
      }
      groups.set(lower, {
        value,
        kind,
        count,
        label: KIND_LABEL[kind],
        prefix: lower.startsWith(q) ? 0 : 1,
      });
    }
  }

  return [...groups.values()]
    .sort(
      (a, b) =>
        a.prefix - b.prefix ||
        b.count - a.count ||
        a.value.toLowerCase().localeCompare(b.value.toLowerCase()),
    )
    .slice(0, total)
    .map(({ value, kind, count, label }) => ({ value, kind, count, label }));
}
