import { handle, notFound, ok, unauthorized } from "@/lib/api";
import { comicUpdateSchema } from "@/lib/schemas";
import { deleteComic, getComic, updateComic } from "@/db/queries";
import { getUserId } from "@/lib/session";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/** GET /api/comics/:id — a single comic. */
export async function GET(req: Request, { params }: Params) {
  return handle(req, async () => {
    const userId = await getUserId(req);
    if (!userId) return unauthorized();
    const { id } = await params;
    const comic = getComic(userId, id);
    return comic ? ok(comic) : notFound("Comic not found");
  });
}

/** PATCH /api/comics/:id — partial update; absent fields are left unchanged. */
export async function PATCH(req: Request, { params }: Params) {
  return handle(req, async () => {
    const userId = await getUserId(req);
    if (!userId) return unauthorized();
    const { id } = await params;
    const body = comicUpdateSchema.parse(await req.json());
    const updated = updateComic(userId, id, body);
    return updated ? ok(updated) : notFound("Comic not found");
  });
}

/** DELETE /api/comics/:id — soft delete; see the undo-delete flow in the UI. */
export async function DELETE(req: Request, { params }: Params) {
  return handle(req, async () => {
    const userId = await getUserId(req);
    if (!userId) return unauthorized();
    const { id } = await params;
    const deleted = deleteComic(userId, id);
    return deleted ? ok({ ok: true }) : notFound("Comic not found");
  });
}
