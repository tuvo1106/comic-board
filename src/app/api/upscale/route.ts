import { authed, ok } from "@/lib/api";
import { upscalerInfo } from "@/lib/upscale";

export const runtime = "nodejs";

/**
 * GET /api/upscale — whether an upscaler is configured, and what it is. Gates
 * the UI so the action is absent rather than present-and-broken when the binary
 * isn't installed, matching how `/api/metadata` gates the autofill panel.
 */
export async function GET(req: Request) {
  return authed(req, async () => ok(upscalerInfo()));
}
