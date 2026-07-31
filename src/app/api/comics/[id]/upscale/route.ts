import { z } from "zod";
import { authed, badRequest, notFound, ok } from "@/lib/api";
import { describeStored, processUpload, readStored } from "@/lib/images";
import { acceptUpscale, discardUpscale, getComic, isCoverReferenced } from "@/db/queries";
import { getUpscaler, isUpscaleScale, upscaleTarget } from "@/lib/upscale";
import { storage } from "@/lib/storage";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/**
 * A candidate produced by POST but not yet accepted. It's a real stored image in
 * its own folder, just not referenced by any comic — which is exactly the
 * property the accept/discard routes below authorize against, since the client
 * hands the path back and we must not let it name an arbitrary file.
 */
const candidateSchema = z.object({
  // Shape-check first: a cover key and nothing else. `storage.resolve` also
  // rejects traversal, but failing here keeps a malformed key out of the FS.
  imagePath: z.string().regex(/^covers\/[A-Za-z0-9_-]+\/full\.webp$/, "Not a cover key"),
});

/** Upscaling can take seconds; the client shows a spinner rather than optimistic UI. */
export const maxDuration = 120;

/**
 * POST /api/comics/:id/upscale?scale=2 — produce a candidate and return it for
 * preview. Deliberately does NOT touch the comic: nothing changes until the
 * user accepts, so an upscale they dislike costs only a discarded folder.
 */
export async function POST(req: Request, { params }: Params) {
  return authed(req, async (userId) => {
    const { id } = await params;
    const comic = getComic(userId, id);
    if (!comic) return notFound("Comic not found");

    const raw = Number(new URL(req.url).searchParams.get("scale") ?? "2");
    if (!isUpscaleScale(raw)) return badRequest("Scale must be 2 or 4");

    const upscaler = getUpscaler(); // throws UpscaleError(501) when unconfigured
    const source = await readStored(storage.keyFromUrl(comic.imageUrl));

    const started = Date.now();
    const enlarged = await upscaler.run(source, raw);
    // Store through the normal pipeline so the candidate has a real thumbnail
    // and blur placeholder — accepting it then needs no extra processing. The
    // width ceiling is raised to the upscale's target (otherwise the default
    // 1600px cap would resample the enlargement straight back away) but no
    // further, so every cover converges on a consistent maximum.
    const target = upscaleTarget(comic.width, comic.height, raw);
    const image = await processUpload(enlarged, { maxWidth: target.width });

    logger.info("upscale preview", {
      tag: "upscale",
      comicId: id,
      backend: upscaler.id,
      scale: raw,
      from: `${comic.width}x${comic.height}`,
      to: `${image.width}x${image.height}`,
      ms: Date.now() - started,
    });

    return ok({
      imagePath: image.imagePath,
      imageUrl: storage.getUrl(image.imagePath),
      width: image.width,
      height: image.height,
      scale: raw,
      label: upscaler.label,
      from: { width: comic.width, height: comic.height },
    });
  });
}

/**
 * PUT /api/comics/:id/upscale — accept a candidate. The outgoing cover is kept
 * (see `acceptUpscale`) so this stays reversible.
 */
export async function PUT(req: Request, { params }: Params) {
  return authed(req, async (userId) => {
    const { id } = await params;
    const { imagePath } = candidateSchema.parse(await req.json());
    if (!getComic(userId, id)) return notFound("Comic not found");

    // Authorization for a path the client supplied: a candidate is by
    // definition unreferenced, so anything already in use — a live cover or a
    // kept original, this user's or anyone's — is not a candidate and must not
    // be adoptable. Without this, a crafted path could repoint one comic at
    // another's artwork.
    if (isCoverReferenced(imagePath)) return badRequest("Not an upscale candidate");

    const meta = await describeStored(imagePath).catch(() => null);
    if (!meta) return notFound("That upscale is no longer available");

    const updated = acceptUpscale(userId, id, {
      id: "",
      imagePath,
      thumbPath: imagePath.replace(/[^/]+$/, "thumb.webp"),
      blurDataUrl: meta.blurDataUrl,
      width: meta.width,
      height: meta.height,
    });
    if (!updated) return notFound("Comic not found");
    logger.info("upscale accepted", { tag: "upscale", comicId: id, imagePath });
    return ok(updated);
  });
}

/** DELETE /api/comics/:id/upscale — throw away a candidate the user declined. */
export async function DELETE(req: Request, { params }: Params) {
  return authed(req, async (userId) => {
    const { id } = await params;
    const { imagePath } = candidateSchema.parse(await req.json());
    if (!getComic(userId, id)) return notFound("Comic not found");
    // Same guard as accept, for the same reason — in this direction a crafted
    // path would delete a live cover rather than steal one.
    if (isCoverReferenced(imagePath)) return badRequest("Not an upscale candidate");
    await discardUpscale(imagePath);
    return ok({ ok: true });
  });
}
