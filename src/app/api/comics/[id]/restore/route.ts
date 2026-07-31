import { handle, notFound, ok, unauthorized } from "@/lib/api";
import { restoreComic } from "@/db/queries";
import { getUserId } from "@/lib/session";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/comics/:id/restore — undo a soft delete (clears `deletedAt`).
 * 404 if the comic isn't owned, doesn't exist, or was already restored — the
 * ~24h window before the sweep hard-deletes it (see `sweepDeletedComics`).
 */
export async function POST(req: Request, { params }: Params) {
  return handle(req, async () => {
    const userId = await getUserId(req);
    if (!userId) return unauthorized();
    const { id } = await params;
    const restored = restoreComic(userId, id);
    return restored ? ok({ ok: true }) : notFound("Comic not found");
  });
}
