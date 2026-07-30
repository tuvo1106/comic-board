import { handle, ok, unauthorized } from "@/lib/api";
import { getUserId } from "@/lib/session";
import { configuredProviders, defaultProvider } from "@/lib/metadata";

export const runtime = "nodejs";

/**
 * GET /api/metadata — which providers are configured + the default. Lets the
 * upload UI show the autofill panel (and provider toggle) only when usable.
 */
export async function GET(req: Request) {
  return handle(req, async () => {
    const userId = await getUserId(req);
    if (!userId) return unauthorized();
    return ok({ providers: configuredProviders(), default: defaultProvider() });
  });
}
