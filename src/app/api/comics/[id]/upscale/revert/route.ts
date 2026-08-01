import { authed, notFound, ok } from "@/lib/api";
import { describeStored } from "@/lib/images";
import { revertUpscale } from "@/db/queries";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/comics/:id/upscale/revert — restore the cover an accepted upscale
 * replaced, and delete the generated one. 404s if the comic was never upscaled,
 * which is also what makes this safe to call speculatively from the UI.
 */
export async function POST(req: Request, { params }: Params) {
  return authed(req, async (userId) => {
    const { id } = await params;
    const reverted = await revertUpscale(userId, id, describeStored);
    if (!reverted) return notFound("This cover has no upscale to revert");
    logger.info("upscale reverted", { tag: "upscale", comicId: id });
    return ok(reverted);
  });
}
