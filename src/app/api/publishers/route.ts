import { z } from "zod";
import { authed, notFound, ok } from "@/lib/api";
import { renamePublisher } from "@/db/queries";

export const runtime = "nodejs";

const renameSchema = z.object({
  from: z.string().trim().min(1).max(120),
  to: z.string().trim().min(1).max(120),
});

/** Rename a publisher; the new name applies to every comic that uses it. */
export async function PATCH(req: Request) {
  return authed(req, async (userId) => {
    const { from, to } = renameSchema.parse(await req.json());
    const renamed = renamePublisher(userId, from, to);
    return renamed ? ok({ ok: true }) : notFound("Publisher not found");
  });
}
