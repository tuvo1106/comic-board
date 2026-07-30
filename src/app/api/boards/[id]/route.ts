import { handle, notFound, ok, unauthorized } from "@/lib/api";
import { boardUpdateSchema } from "@/lib/schemas";
import { deleteBoard, updateBoard } from "@/db/queries";
import { getUserId } from "@/lib/session";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/** PATCH /api/boards/:id — { name?, tabPosition? }. */
export async function PATCH(req: Request, { params }: Params) {
  return handle(async () => {
    const userId = await getUserId(req);
    if (!userId) return unauthorized();
    const { id } = await params;
    const body = boardUpdateSchema.parse(await req.json());
    const done = updateBoard(userId, id, body);
    return done ? ok({ ok: true }) : notFound("Board not found");
  });
}

/** DELETE /api/boards/:id — deletes the board; its comics are untouched. */
export async function DELETE(req: Request, { params }: Params) {
  return handle(async () => {
    const userId = await getUserId(req);
    if (!userId) return unauthorized();
    const { id } = await params;
    const done = deleteBoard(userId, id);
    return done ? ok({ ok: true }) : notFound("Board not found");
  });
}
