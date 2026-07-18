import { handle, notFound, ok } from "@/lib/api";
import { boardUpdateSchema } from "@/lib/schemas";
import { deleteBoard, updateBoard } from "@/db/queries";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Params) {
  return handle(async () => {
    const { id } = await params;
    const body = boardUpdateSchema.parse(await req.json());
    const done = updateBoard(id, body);
    return done ? ok({ ok: true }) : notFound("Board not found");
  });
}

export async function DELETE(_req: Request, { params }: Params) {
  return handle(async () => {
    const { id } = await params;
    const done = deleteBoard(id);
    return done ? ok({ ok: true }) : notFound("Board not found");
  });
}
