import { badRequest, handle, ok, unauthorized } from "@/lib/api";
import { getUserId } from "@/lib/session";
import { getProvider, resolveProvider } from "@/lib/metadata";
import { cached } from "@/lib/metadata/cache";

export const runtime = "nodejs";

/**
 * GET /api/metadata/search?series=&issue=&provider= — candidate matches for the
 * upload form. Auth-gated; keys stay server-side. Results are cached to respect
 * provider rate limits.
 */
export async function GET(req: Request) {
  return handle(async () => {
    const userId = await getUserId(req);
    if (!userId) return unauthorized();

    const url = new URL(req.url);
    const series = (url.searchParams.get("series") ?? "").trim();
    if (!series) return badRequest("A series name is required");
    if (series.length > 200) return badRequest("Series query is too long");
    const issue = (url.searchParams.get("issue") ?? "").trim() || undefined;

    const provider = resolveProvider(url.searchParams.get("provider"));
    const key = `search:${provider}:${series.toLowerCase()}:${issue ?? ""}`;
    const candidates = await cached(key, () => getProvider(provider).search({ series, issue }));
    return ok({ provider, candidates });
  });
}
