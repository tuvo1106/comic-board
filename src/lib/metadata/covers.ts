import { MetadataError } from "./types";

// SSRF guard: the cover proxy will only fetch from this exact host — the image
// origin Metron returns (see PROVIDERS.md). A URL from anywhere else is rejected
// before any network call.
const ALLOWED_COVER_HOSTS = new Set(["static.metron.cloud"]);

// Sanity cap on a fetched cover. Provider covers are well under this; the app
// re-encodes to webp anyway, but this bounds a hostile/oversized response.
const MAX_COVER_BYTES = 25 * 1024 * 1024;

const USER_AGENT = "comic-board/1.0 (metadata autofill)";
const TIMEOUT_MS = 15_000;

/** Validate a cover URL against the host allowlist, returning the parsed URL. */
export function assertAllowedCover(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new MetadataError("Invalid cover URL", 400);
  }
  if (url.protocol !== "https:" || !ALLOWED_COVER_HOSTS.has(url.hostname)) {
    throw new MetadataError("Cover URL host is not allowed", 400);
  }
  return url;
}

export interface FetchedCover {
  bytes: ArrayBuffer;
  contentType: string;
}

/** Fetch a provider cover (host-validated) with a timeout and size/type checks. */
export async function fetchCover(raw: string): Promise<FetchedCover> {
  const url = assertAllowedCover(raw);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      signal: controller.signal,
    });
  } catch (err) {
    const timedOut = err instanceof Error && err.name === "AbortError";
    throw new MetadataError(timedOut ? "Cover fetch timed out" : "Cover is unreachable");
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) throw new MetadataError(`Cover fetch failed (${res.status})`);
  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.startsWith("image/")) {
    throw new MetadataError("Cover URL did not return an image", 400);
  }

  const buf = await res.arrayBuffer();
  if (buf.byteLength > MAX_COVER_BYTES) {
    throw new MetadataError("Cover image is too large", 400);
  }
  return { bytes: buf, contentType };
}
