import { authed, badRequest, notFound, ok } from "@/lib/api";
import { processUpload } from "@/lib/images";
import { getComic, replaceComicCover } from "@/db/queries";
import { coverDir, storage } from "@/lib/storage";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/**
 * PUT /api/comics/:id/cover — replace the cover image (multipart: `file`).
 * Metadata and board memberships are untouched. Processes into a new folder and
 * repoints the comic, deleting the old image (see `replaceComicCover`).
 */
export async function PUT(req: Request, { params }: Params) {
  return authed(req, async (userId) => {
    const { id } = await params;

    // Ownership check first, so a non-image or non-owned request never processes
    // and stores an orphaned file.
    if (!getComic(userId, id)) return notFound("Comic not found");

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return badRequest("Missing image file");
    if (file.size > 15 * 1024 * 1024) return badRequest("Image exceeds 15MB limit");

    const buffer = Buffer.from(await file.arrayBuffer());
    let image;
    try {
      image = await processUpload(buffer);
    } catch {
      return badRequest("Not a valid image");
    }

    const updated = await replaceComicCover(userId, id, image);
    if (!updated) {
      // The comic was removed between the ownership check and the swap — clean
      // up the image we just wrote so it isn't orphaned on disk.
      await storage.deletePrefix(coverDir(image.imagePath)).catch(() => {});
      return notFound("Comic not found");
    }
    return ok(updated);
  });
}
