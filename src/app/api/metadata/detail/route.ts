import { badRequest, handle, ok, unauthorized } from "@/lib/api";
import { getUserId } from "@/lib/session";
import { getProvider, resolveProvider } from "@/lib/metadata";
import { cached } from "@/lib/metadata/cache";

export const runtime = "nodejs";

/**
 * GET /api/metadata/detail?provider=&ref=&issue= — the full record for a chosen
 * candidate, used to prefill the form. `ref` is the opaque id from a search
 * candidate; `issue` is optional (unused by the issue-grain Metron provider).
 */
export async function GET(req: Request) {
  return handle(async () => {
    const userId = await getUserId(req);
    if (!userId) return unauthorized();

    const url = new URL(req.url);
    const ref = (url.searchParams.get("ref") ?? "").trim();
    if (!ref) return badRequest("A candidate ref is required");
    const issue = (url.searchParams.get("issue") ?? "").trim() || undefined;

    const provider = resolveProvider(url.searchParams.get("provider"));
    const key = `detail:${provider}:${ref}:${issue ?? ""}`;
    const detail = await cached(key, () => getProvider(provider).detail(ref, issue));
    return ok(detail);
  });
}
