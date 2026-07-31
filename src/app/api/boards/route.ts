import { authed, ok } from "@/lib/api";
import { boardCreateSchema } from "@/lib/schemas";
import { createBoard, listBoards } from "@/db/queries";

export const runtime = "nodejs";

/** GET /api/boards — every board owned by the caller. */
export async function GET(req: Request) {
  return authed(req, async (userId) => {
    return ok(listBoards(userId));
  });
}

/** POST /api/boards — { name, comicIds? } (comicIds = save-view-as-board). */
export async function POST(req: Request) {
  return authed(req, async (userId) => {
    const { name, comicIds } = boardCreateSchema.parse(await req.json());
    return ok(createBoard(userId, name, comicIds), { status: 201 });
  });
}
