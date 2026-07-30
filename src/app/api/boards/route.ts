import { handle, ok, unauthorized } from "@/lib/api";
import { boardCreateSchema } from "@/lib/schemas";
import { createBoard, listBoards } from "@/db/queries";
import { getUserId } from "@/lib/session";

export const runtime = "nodejs";

/** GET /api/boards — every board owned by the caller. */
export async function GET(req: Request) {
  return handle(async () => {
    const userId = await getUserId(req);
    if (!userId) return unauthorized();
    return ok(listBoards(userId));
  });
}

/** POST /api/boards — { name, comicIds? } (comicIds = save-view-as-board). */
export async function POST(req: Request) {
  return handle(async () => {
    const userId = await getUserId(req);
    if (!userId) return unauthorized();
    const { name, comicIds } = boardCreateSchema.parse(await req.json());
    return ok(createBoard(userId, name, comicIds), { status: 201 });
  });
}
