import { handle, notFound, ok } from "@/lib/api";
import { addComicToBoard, removeComicFromBoard } from "@/db/queries";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string; comicId: string }> };

/** PUT /api/boards/:id/comics/:comicId — add comic to board. */
export async function PUT(_req: Request, { params }: Params) {
  return handle(async () => {
    const { id, comicId } = await params;
    const done = addComicToBoard(id, comicId);
    return done ? ok({ ok: true }) : notFound("Board or comic not found");
  });
}

/** DELETE /api/boards/:id/comics/:comicId — remove comic from board. */
export async function DELETE(_req: Request, { params }: Params) {
  return handle(async () => {
    const { id, comicId } = await params;
    const done = removeComicFromBoard(id, comicId);
    return done ? ok({ ok: true }) : notFound("Comic not on that board");
  });
}
