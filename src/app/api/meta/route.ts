import { authed, ok } from "@/lib/api";
import { getMeta } from "@/db/queries";

export const runtime = "nodejs";

/** GET /api/meta — distinct field values + counts, scoped to the caller; powers form autocomplete. */
export async function GET(req: Request) {
  return authed(req, async (userId) => {
    return ok(getMeta(userId));
  });
}
