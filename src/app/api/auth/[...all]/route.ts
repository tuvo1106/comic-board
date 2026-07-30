import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/lib/auth";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";

const handlers = toNextJsHandler(auth);

/**
 * The one route that doesn't go through `src/lib/api.ts`'s `handle()` —
 * better-auth owns this entire request/response cycle itself (cookies,
 * validation, everything), so wrapping it the same way the other routes are
 * wrapped isn't an option; this is a thin equivalent just for the log line.
 *
 * POST only. Every meaningful auth action here (sign-in, sign-up, sign-out,
 * change-email, change-password) is a POST — this app has no OAuth, so GET
 * traffic on this route is exclusively `get-session`, polled by `useSession()`
 * on close to every page load. Logging that would drown every real event in
 * noise for zero diagnostic value. If an OAuth or other GET-driven auth flow
 * is ever added, this method-based filter needs revisiting.
 */
export const GET = handlers.GET;

export async function POST(req: Request): Promise<Response> {
  const start = Date.now();
  const res = await handlers.POST(req);
  logger.info("auth", {
    tag: "auth",
    method: req.method,
    path: new URL(req.url).pathname,
    status: res.status,
    ms: Date.now() - start,
  });
  return res;
}
