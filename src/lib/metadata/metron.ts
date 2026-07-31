import { fetchJson, readRateLimit } from "./http";
import { cleanNames, isWriterRole, normalizeCoverDate, toYear } from "./normalize";
import {
  type CoverOption,
  type MetadataCandidate,
  type MetadataDetail,
  type MetadataProvider,
} from "./types";

const BASE = "https://metron.cloud/api";

// --- raw response shapes (only the fields we read; see DESIGN.md §4.1) --------

interface MetronSeriesRef {
  name: string;
  year_began?: number | null;
}
interface MetronIssueLite {
  id: number;
  series: MetronSeriesRef;
  number?: string | null;
  cover_date?: string | null; // date printed on the cover
  store_date?: string | null; // actual release date — preferred for our date field
  image?: string | null;
}
interface MetronCredit {
  creator: string;
  role?: { name: string }[] | null;
}
interface MetronIssueDetail {
  series: MetronSeriesRef;
  number?: string | null;
  publisher?: { name?: string } | null;
  cover_date?: string | null;
  store_date?: string | null;
  credits?: MetronCredit[] | null;
  image?: string | null;
  variants?: { name?: string | null; image?: string | null }[] | null;
}

// We surface the *release* date (store_date) — the day it hit shelves — since
// the printed cover date runs ~2 months ahead. Fall back to cover_date when a
// store date is missing (common on older issues).
function releaseDate(storeDate?: string | null, coverDate?: string | null): string | null {
  return normalizeCoverDate(storeDate) ?? normalizeCoverDate(coverDate);
}
interface MetronPage<T> {
  results: T[];
}

// --- pure mappers (unit-tested against fixtures) ------------------------------

export function mapMetronIssue(issue: MetronIssueLite): MetadataCandidate {
  return {
    provider: "metron",
    ref: String(issue.id),
    series: issue.series.name,
    issueNumber: issue.number?.trim() || null,
    coverDate: releaseDate(issue.store_date, issue.cover_date),
    publisher: null, // Metron omits publisher from search results; filled at detail
    coverThumbUrl: issue.image || null,
    year: toYear(issue.series.year_began),
    issueCount: null, // issue-grain search has no series total
  };
}

export function mapMetronIssueDetail(issue: MetronIssueDetail): MetadataDetail {
  const credits = issue.credits ?? [];
  const roleNames = (c: MetronCredit) => (c.role ?? []).map((r) => r.name);
  const authors = cleanNames(
    credits.filter((c) => isWriterRole(roleNames(c))).map((c) => c.creator),
  );
  return {
    series: issue.series.name,
    issueNumber: issue.number?.trim() || null,
    publisher: issue.publisher?.name?.trim() || null,
    coverDate: releaseDate(issue.store_date, issue.cover_date),
    authors,
    // Artists and characters are intentionally NOT autofilled: Metron doesn't
    // attribute covers to specific variants, so a "Cover"-role credit could
    // belong to any variant, not the one the user is adding.
    artists: [],
    covers: metronCovers(issue.image, issue.variants),
  };
}

/** Primary cover first, then Metron's (well-labeled) variant covers. */
export function metronCovers(
  image?: string | null,
  variants?: MetronIssueDetail["variants"],
): CoverOption[] {
  const covers: CoverOption[] = [];
  if (image) covers.push({ url: image, label: "Main cover" });
  (variants ?? []).forEach((v, i) => {
    if (!v.image || covers.some((c) => c.url === v.image)) return;
    covers.push({ url: v.image, label: v.name?.trim() || `Variant ${i + 1}` });
  });
  return covers;
}

// --- provider -----------------------------------------------------------------

/**
 * Metron reports remaining budget on every response — warn once the short
 * burst bucket (20) is close to empty, so a caller sees it in logs before
 * hitting a 429. Shared by `search()` and `detail()` rather than duplicated,
 * since they draw on the same bucket.
 */
function warnIfBudgetLow(burstRemaining: number | null): void {
  if (burstRemaining != null && burstRemaining <= 3) {
    console.warn(`Metron burst budget low: ${burstRemaining} remaining`);
  }
}

export function metronProvider(token: string): MetadataProvider {
  const headers = { Authorization: `Bearer ${token}` };

  return {
    id: "metron",

    async search({ series, issue }) {
      const u = new URL(`${BASE}/issue/`);
      u.searchParams.set("series_name", series);
      if (issue?.trim()) u.searchParams.set("number", issue.trim());
      const { res, data } = await fetchJson(u.toString(), { headers });
      warnIfBudgetLow(readRateLimit(res).burstRemaining);
      const page = data as MetronPage<MetronIssueLite>;
      // Newest series first — "batman 2" returns many issues across decades and
      // the recent run is usually what's wanted. Unknown years sort last.
      return (page.results ?? [])
        .map(mapMetronIssue)
        .sort((a, b) => (b.year ?? 0) - (a.year ?? 0));
    },

    async detail(ref) {
      const { res, data } = await fetchJson(`${BASE}/issue/${encodeURIComponent(ref)}/`, { headers });
      const { burstRemaining } = readRateLimit(res);
      warnIfBudgetLow(burstRemaining);
      const issue = data as MetronIssueDetail;
      // What "why didn't variants come back" needs to answer (roadmap 4h): the
      // record's own cover/variant counts, not just that the call succeeded.
      // One JSON line — no logging library, matching every other console.*
      // call in this repo — so it's both `grep '"tag":"metron.detail"'`-able
      // and `jq`-able once it's ever piped anywhere. Server-side only: the
      // request URL carries the API key, and fetchJson already keeps it out
      // of thrown errors.
      console.log(
        JSON.stringify({
          tag: "metron.detail",
          ref,
          hasMain: !!issue.image,
          variantCount: (issue.variants ?? []).length,
          burstRemaining,
        }),
      );
      return mapMetronIssueDetail(issue);
    },
  };
}
