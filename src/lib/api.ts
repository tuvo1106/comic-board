import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { logger } from "@/lib/logger";
import { getUserId } from "@/lib/session";
import { MetadataError } from "@/lib/metadata/types";

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function badRequest(message: string, fields?: Record<string, string[]>) {
  return NextResponse.json({ error: message, fields }, { status: 400 });
}

export function notFound(message = "Not found") {
  return NextResponse.json({ error: message }, { status: 404 });
}

export function unauthorized(message = "Not signed in") {
  return NextResponse.json({ error: message }, { status: 401 });
}

/**
 * Turn a thrown error into the right client-safe response: Zod validation
 * errors become 400s with field detail, `MetadataError` passes its status and
 * message through (an upstream provider's own message, never the API key), and
 * anything else is logged server-side and reduced to a bare 500 — no internal
 * message or stack hint reaches the client.
 */
function toErrorResponse(err: unknown): Response {
  if (err instanceof ZodError) {
    return badRequest("Validation failed", err.flatten().fieldErrors as Record<string, string[]>);
  }
  if (err instanceof MetadataError) {
    // Client-safe message from an upstream metadata provider (never the key).
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  // Persisted, not printed: an unexpected 500 is exactly the thing you want to
  // still be able to read tomorrow. The detail stays server-side — the client
  // gets a bare message with no stack hint.
  logger.error("unhandled api error", {
    tag: "api.error",
    // Deliberately `error`, not `message`: winston reserves `message` and folds
    // a meta field of that name into the log line's own message, so the error
    // text stopped being a separate greppable field.
    error: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
  });
  return NextResponse.json({ error: "Internal error" }, { status: 500 });
}

/**
 * Wraps a route handler body with the error mapping above, and logs one
 * `tag: "api"` line per request (method, path, status, duration, user) to the
 * daily-rotating file log (`src/lib/logger.ts`) — every route that uses this
 * gets it for free, present and future, rather than each handler instrumenting
 * itself.
 *
 * Use `authed()` instead for any route that requires a signed-in user; this
 * plain form is for routes that genuinely serve anonymous requests, and it
 * costs a session lookup purely to attach `userId` to the log line.
 */
export async function handle(
  req: Request,
  fn: () => Promise<Response> | Response,
): Promise<Response> {
  const start = Date.now();
  let res: Response;
  try {
    res = await fn();
  } catch (err) {
    res = toErrorResponse(err);
  }
  await logRequest(req, res, start, await getUserId(req).catch(() => null));
  return res;
}

/**
 * `handle()` for the common case: a route that requires a signed-in user.
 * Resolves the session once and either hands the id to `fn` or short-circuits
 * with a 401, replacing the `getUserId`/`if (!userId) return unauthorized()`
 * pair that opened every authenticated handler.
 *
 * Resolving it here rather than inside each handler is also what lets the log
 * line reuse the id — the plain `handle()` path has to look the session up a
 * second time to report `userId`, which is a real duplicate read on every
 * authenticated request.
 */
export async function authed(
  req: Request,
  fn: (userId: string) => Promise<Response> | Response,
): Promise<Response> {
  const start = Date.now();
  let userId: string | null = null;
  let res: Response;
  try {
    userId = await getUserId(req);
    res = userId ? await fn(userId) : unauthorized();
  } catch (err) {
    res = toErrorResponse(err);
  }
  await logRequest(req, res, start, userId);
  return res;
}

/** Never lets a logging failure break the real response. */
async function logRequest(
  req: Request,
  res: Response,
  start: number,
  userId: string | null,
): Promise<void> {
  try {
    logger.info("api", {
      tag: "api",
      method: req.method,
      path: new URL(req.url).pathname,
      status: res.status,
      ms: Date.now() - start,
      userId,
    });
  } catch {
    /* logging must never be why a request fails */
  }
}
