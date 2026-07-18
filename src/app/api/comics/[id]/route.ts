import { handle, notFound, ok } from "@/lib/api";
import { comicUpdateSchema } from "@/lib/schemas";
import { deleteComic, getComic, updateComic } from "@/db/queries";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  return handle(async () => {
    const { id } = await params;
    const comic = getComic(id);
    return comic ? ok(comic) : notFound("Comic not found");
  });
}

export async function PATCH(req: Request, { params }: Params) {
  return handle(async () => {
    const { id } = await params;
    const body = comicUpdateSchema.parse(await req.json());
    const updated = updateComic(id, body);
    return updated ? ok(updated) : notFound("Comic not found");
  });
}

export async function DELETE(_req: Request, { params }: Params) {
  return handle(async () => {
    const { id } = await params;
    const deleted = await deleteComic(id);
    return deleted ? ok({ ok: true }) : notFound("Comic not found");
  });
}
