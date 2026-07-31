import { authed, ok } from "@/lib/api";
import { configuredProviders, defaultProvider } from "@/lib/metadata";

export const runtime = "nodejs";

/**
 * GET /api/metadata — which providers are configured + the default. Lets the
 * upload UI show the autofill panel (and provider toggle) only when usable.
 */
export async function GET(req: Request) {
  return authed(req, async () => {
    return ok({ providers: configuredProviders(), default: defaultProvider() });
  });
}
