import { badRequest, handle, unauthorized } from "@/lib/api";
import { getUserId } from "@/lib/session";
import { fetchCover } from "@/lib/metadata/covers";

export const runtime = "nodejs";

/**
 * GET /api/metadata/cover?url= — proxy a provider cover image so the client can
 * preview/import it without CORS issues, and so the fetch is host-allowlisted
 * server-side (SSRF guard in `fetchCover`). Streams the raw image bytes.
 */
export async function GET(req: Request) {
  return handle(async () => {
    const userId = await getUserId(req);
    if (!userId) return unauthorized();

    const raw = new URL(req.url).searchParams.get("url");
    if (!raw) return badRequest("A cover url is required");

    const { bytes, contentType } = await fetchCover(raw);
    return new Response(bytes, {
      status: 200,
      headers: {
        "content-type": contentType,
        "content-length": String(bytes.byteLength),
        // Immutable provider assets — let the browser cache the preview/import.
        "cache-control": "private, max-age=86400",
      },
    });
  });
}
