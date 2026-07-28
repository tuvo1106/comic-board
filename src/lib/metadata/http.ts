import { MetadataError } from "./types";

// A cap so a hung upstream can't stall the request forever.
const TIMEOUT_MS = 12_000;

export interface JsonResponse {
  res: Response;
  data: unknown;
}

/**
 * Fetch JSON from a provider with a timeout, mapping every failure to a
 * client-safe `MetadataError`. Returns the raw `Response` too so callers can
 * read provider-specific headers (e.g. Metron's rate-limit budget).
 */
export async function fetchJson(url: string, init?: RequestInit): Promise<JsonResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    // Abort (timeout) or network failure — never leak the URL (it holds the key).
    const timedOut = err instanceof Error && err.name === "AbortError";
    throw new MetadataError(
      timedOut ? "Metadata provider timed out" : "Metadata provider is unreachable",
    );
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 429) {
    const retry = res.headers.get("retry-after");
    throw new MetadataError(
      `Rate limited by the metadata provider${retry ? ` — retry in ${retry}s` : ""}`,
      429,
    );
  }
  if (!res.ok) {
    throw new MetadataError(`Metadata provider error (${res.status})`);
  }

  try {
    return { res, data: await res.json() };
  } catch {
    throw new MetadataError("Metadata provider returned invalid JSON");
  }
}

/** Read Metron's rate-limit headers if present. Returned for logging/backoff. */
export function readRateLimit(res: Response): { burstRemaining: number | null } {
  const raw = res.headers.get("x-ratelimit-burst-remaining");
  return { burstRemaining: raw == null ? null : Number(raw) };
}
