import { handle, notFound, ok, unauthorized } from "@/lib/api";
import { positionUpdateSchema } from "@/lib/schemas";
import { updateComicPosition } from "@/db/queries";
import { getUserId } from "@/lib/session";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/** PATCH /api/comics/:id/position — { position, boardId? } */
export async function PATCH(req: Request, { params }: Params) {
  return handle(async () => {
    const userId = await getUserId(req);
    if (!userId) return unauthorized();
    const { id } = await params;
    const { position, boardId } = positionUpdateSchema.parse(await req.json());
    const done = updateComicPosition(userId, id, position, boardId ?? null);
    return done ? ok({ ok: true }) : notFound("Comic not on that board");
  });
}
