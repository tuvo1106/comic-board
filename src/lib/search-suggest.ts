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
 * Fields to suggest from. **Must mirror `applyFilters`' free-text haystack
 * exactly** — drift makes the dropdown suggest terms that match nothing, or
 * miss terms that would. `issueNumber` is absent from both deliberately (see
 * `filters.ts`).
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
 * Which field wins when one value exists in several ("Batman" is both a series
 * and a character, and either row would run the identical search). The order is
 * arbitrary but *stated*, so the outcome can't depend on which field happened
 * to have the higher count. The winner's label and count are what's shown, so a
 * major series that's a minor character ranks by the smaller count — see
 * `CHANGELOG.md` for why that tradeoff was accepted.
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
 * Typeahead suggestions for a search box, built from the cached `/api/meta`
 * payload — no endpoint, no round-trip.
 *
 * Ranked prefix-matches-first, then by how many comics carry the value, then
 * alphabetically so the order is stable rather than following the API's
 * iteration order. Case-insensitive throughout, including the dedupe key.
 * Capped at `opts.total` (default 5); `opts.kinds` narrows which fields are
 * offered at all.
 *
 * @param meta `/api/meta` payload, or undefined before it loads (yields none).
 * @param query raw input text; blank yields none.
 */
export function suggestSearch(
  meta: MetaDTO | undefined,
  query: string,
  opts: { total?: number; kinds?: SuggestionKind[] } = {},
): Suggestion[] {
  const total = opts.total ?? TOTAL;
  const allowed = opts.kinds ? new Set(opts.kinds) : null;
  const q = query.trim().toLowerCase();
  if (!meta || !q) return [];

  // Keyed by lower-cased value: series is a plain column while characters and
  // tags are their own tables, so the same name can differ in case *across*
  // fields even though each field de-dupes internally.
  const groups = new Map<string, Suggestion & { prefix: number }>();
  for (const [key, kind] of SOURCES) {
    if (allowed && !allowed.has(kind)) continue;
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
