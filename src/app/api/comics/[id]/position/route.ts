import { authed, notFound, ok } from "@/lib/api";
import { positionUpdateSchema } from "@/lib/schemas";
import { updateComicPosition } from "@/db/queries";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/** PATCH /api/comics/:id/position — { position, boardId? } */
export async function PATCH(req: Request, { params }: Params) {
  return authed(req, async (userId) => {
    const { id } = await params;
    const { position, boardId } = positionUpdateSchema.parse(await req.json());
    const done = updateComicPosition(userId, id, position, boardId ?? null);
    return done ? ok({ ok: true }) : notFound("Comic not on that board");
  });
}
