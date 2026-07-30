import { badRequest, handle, ok, unauthorized } from "@/lib/api";
import { getUserId } from "@/lib/session";
import { getProvider, resolveProvider } from "@/lib/metadata";
import { cached } from "@/lib/metadata/cache";
import { parseSearchQuery } from "@/lib/metadata/query";

export const runtime = "nodejs";

/**
 * GET /api/metadata/search?q=&provider= — candidate matches for the upload form.
 * `q` is a single free-text box ("black cat 4"); a trailing number is parsed as
 * the issue. Auth-gated; keys stay server-side; results are cached.
 */
export async function GET(req: Request) {
  return handle(req, async () => {
    const userId = await getUserId(req);
    if (!userId) return unauthorized();

    const url = new URL(req.url);
    const q = (url.searchParams.get("q") ?? "").trim();
    if (!q) return badRequest("A search term is required");
    if (q.length > 200) return badRequest("Search term is too long");

    const provider = resolveProvider(url.searchParams.get("provider"));
    const client = getProvider(provider);
    const { series, issue } = parseSearchQuery(q);

    const search = (s: string, i?: string) =>
      cached(`search:${provider}:${s.toLowerCase()}:${i ?? ""}`, () =>
        client.search({ series: s, issue: i }),
      );

    let candidates = await search(series, issue);
    // A trailing number might belong to the title (e.g. "Spider-Man 2099"), not
    // an issue. If the parsed-issue search finds nothing, retry the whole string
    // as the series name.
    if (candidates.length === 0 && issue) {
      candidates = await search(q);
    }

    return ok({ provider, candidates });
  });
}
