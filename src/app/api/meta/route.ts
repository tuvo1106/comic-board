import { handle, ok, unauthorized } from "@/lib/api";
import { getMeta } from "@/db/queries";
import { getUserId } from "@/lib/session";

export const runtime = "nodejs";

/** GET /api/meta — distinct field values + counts, scoped to the caller; powers form autocomplete. */
export async function GET(req: Request) {
  return handle(req, async () => {
    const userId = await getUserId(req);
    if (!userId) return unauthorized();
    return ok(getMeta(userId));
  });
}
