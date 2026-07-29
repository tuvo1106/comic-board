// Shared, provider-agnostic shapes for metadata autofill. The external comics
// database (Metron) is wrapped in a `MetadataProvider` so the rest of the app
// never sees provider-specific JSON — only these normalized types. The
// abstraction stays general so another source could be added later.

export type ProviderId = "metron";

export const PROVIDER_IDS: ProviderId[] = ["metron"];

/** A search hit, shown in the results list before the user commits. */
export interface MetadataCandidate {
  provider: ProviderId;
  /** Opaque provider id passed back to `detail()` to fetch the full record. */
  ref: string;
  series: string;
  /** The issue number this candidate represents (Metron searches issue-grain). */
  issueNumber: string | null;
  coverDate: string | null; // yyyy-mm-dd
  publisher: string | null;
  coverThumbUrl: string | null;
  /** Series start year — disambiguates series sharing a name. */
  year: number | null;
  /** Issues in the series when known (null for issue-grain search). */
  issueCount: number | null;
}

/** One selectable cover for an issue (primary edition or a variant). */
export interface CoverOption {
  url: string; // full-res image; fetched via the host-allowlisted cover proxy
  label: string; // e.g. "Main cover", "Second Printing Variant"
}

/** The full record used to prefill the upload form — maps ~1:1 to ComicFormValue. */
export interface MetadataDetail {
  series: string;
  issueNumber: string | null;
  publisher: string | null;
  coverDate: string | null; // yyyy-mm-dd
  authors: string[]; // writer credits
  artists: string[]; // cover-artist credits; not autofilled (see providers)
  /** Available covers, primary first, then any variants. Empty if none. */
  covers: CoverOption[];
}

export interface MetadataProvider {
  id: ProviderId;
  search(input: { series: string; issue?: string }): Promise<MetadataCandidate[]>;
  detail(ref: string, issue?: string): Promise<MetadataDetail>;
}

/** Thrown by providers for a clean, client-safe failure (never leaks the key). */
export class MetadataError extends Error {
  constructor(
    message: string,
    /** HTTP status to surface to the client (defaults to 502 Bad Gateway). */
    readonly status = 502,
  ) {
    super(message);
    this.name = "MetadataError";
  }
}
