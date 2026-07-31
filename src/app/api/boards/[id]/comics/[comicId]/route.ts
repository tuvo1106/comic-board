import { handle, notFound, ok, unauthorized } from "@/lib/api";
import { addComicToBoard, removeComicFromBoard } from "@/db/queries";
import { getUserId } from "@/lib/session";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string; comicId: string }> };

/** PUT /api/boards/:id/comics/:comicId — add comic to board. */
export async function PUT(req: Request, { params }: Params) {
  return handle(req, async () => {
    const userId = await getUserId(req);
    if (!userId) return unauthorized();
    const { id, comicId } = await params;
    const done = addComicToBoard(userId, id, comicId);
    return done ? ok({ ok: true }) : notFound("Board or comic not found");
  });
}

/** DELETE /api/boards/:id/comics/:comicId — remove comic from board. */
export async function DELETE(req: Request, { params }: Params) {
  return handle(req, async () => {
    const userId = await getUserId(req);
    if (!userId) return unauthorized();
    const { id, comicId } = await params;
    const done = removeComicFromBoard(userId, id, comicId);
    return done ? ok({ ok: true }) : notFound("Comic not on that board");
  });
}
