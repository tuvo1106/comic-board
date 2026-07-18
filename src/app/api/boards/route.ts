import { handle, ok } from "@/lib/api";
import { boardCreateSchema } from "@/lib/schemas";
import { createBoard, listBoards } from "@/db/queries";

export const runtime = "nodejs";

export async function GET() {
  return handle(() => ok(listBoards()));
}

/** POST /api/boards — { name, comicIds? } (comicIds = save-view-as-board). */
export async function POST(req: Request) {
  return handle(async () => {
    const { name, comicIds } = boardCreateSchema.parse(await req.json());
    return ok(createBoard(name, comicIds), { status: 201 });
  });
}
