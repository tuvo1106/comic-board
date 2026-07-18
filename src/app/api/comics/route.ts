import { handle, badRequest, ok } from "@/lib/api";
import { comicMetaSchema } from "@/lib/schemas";
import { processUpload } from "@/lib/images";
import { createComic, listComics } from "@/db/queries";

export const runtime = "nodejs";

/** GET /api/comics?board=<id> — list comics, optionally scoped to a board. */
export async function GET(req: Request) {
  return handle(() => {
    const url = new URL(req.url);
    const board = url.searchParams.get("board");
    return ok(listComics(board));
  });
}

/**
 * POST /api/comics — multipart form:
 *   - file: the cover image
 *   - meta: JSON string matching comicMetaSchema
 */
export async function POST(req: Request) {
  return handle(async () => {
    const form = await req.formData();
    const file = form.get("file");
    const metaRaw = form.get("meta");

    if (!(file instanceof File)) {
      return badRequest("Missing image file");
    }
    if (file.size > 15 * 1024 * 1024) {
      return badRequest("Image exceeds 15MB limit");
    }
    if (typeof metaRaw !== "string") {
      return badRequest("Missing metadata");
    }

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(metaRaw);
    } catch {
      return badRequest("Metadata is not valid JSON");
    }
    const meta = comicMetaSchema.parse(parsedJson);

    const buffer = Buffer.from(await file.arrayBuffer());
    const image = await processUpload(buffer);

    const comic = createComic({
      series: meta.series,
      issueNumber: meta.issueNumber ?? null,
      publisher: meta.publisher ?? null,
      coverDate: meta.coverDate ?? null,
      authors: meta.authors,
      artists: meta.artists,
      characters: meta.characters,
      tags: meta.tags,
      boardIds: meta.boardIds,
      image,
    });

    return ok(comic, { status: 201 });
  });
}
