import { z } from "zod";
import { handle, notFound, ok, unauthorized } from "@/lib/api";
import { renamePublisher } from "@/db/queries";
import { getUserId } from "@/lib/session";

export const runtime = "nodejs";

const renameSchema = z.object({
  from: z.string().trim().min(1).max(120),
  to: z.string().trim().min(1).max(120),
});

/** Rename a publisher; the new name applies to every comic that uses it. */
export async function PATCH(req: Request) {
  return handle(async () => {
    const userId = await getUserId(req);
    if (!userId) return unauthorized();
    const { from, to } = renameSchema.parse(await req.json());
    const renamed = renamePublisher(userId, from, to);
    return renamed ? ok({ ok: true }) : notFound("Publisher not found");
  });
}
