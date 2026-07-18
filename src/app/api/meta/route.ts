import { handle, ok, unauthorized } from "@/lib/api";
import { getMeta } from "@/db/queries";
import { getUserId } from "@/lib/session";

export const runtime = "nodejs";

export async function GET(req: Request) {
  return handle(async () => {
    const userId = await getUserId(req);
    if (!userId) return unauthorized();
    return ok(getMeta(userId));
  });
}
