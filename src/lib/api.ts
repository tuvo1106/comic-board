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
 * Wraps a route handler body, turning thrown errors into the right client-safe
 * response: Zod validation errors become 400s with field detail, `MetadataError`
 * passes its status and message through (an upstream provider's own message,
 * never the API key), and anything else is logged server-side and reduced to a
 * bare 500 — no internal message or stack hint reaches the client.
 *
 * Also logs one `tag: "api"` line per request (method, path, status, duration,
 * user) to the daily-rotating file log (`src/lib/logger.ts`) — every route
 * that uses `handle()` gets this for free, present and future, rather than
 * each handler instrumenting itself. `req` is only needed for that log line;
 * routes that don't care about it still just call `handle(req, async () => …)`.
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
    if (err instanceof ZodError) {
      res = badRequest("Validation failed", err.flatten().fieldErrors as Record<string, string[]>);
    } else if (err instanceof MetadataError) {
      // Client-safe message from an upstream metadata provider (never the key).
      res = NextResponse.json({ error: err.message }, { status: err.status });
    } else {
      console.error("API error:", err);
      // Don't leak internal error details (messages, stack hints) to clients.
      res = NextResponse.json({ error: "Internal error" }, { status: 500 });
    }
  }
  await logRequest(req, res, start);
  return res;
}

/**
 * A second `getUserId` lookup (most handlers already call it once for
 * authorization) rather than threading the value out of every route body —
 * a duplicate indexed session read is negligible at this app's scale, and it
 * keeps every route's diff to "pass `req` in" instead of restructuring what
 * each handler returns. Never lets a logging failure break the real response.
 */
async function logRequest(req: Request, res: Response, start: number): Promise<void> {
  try {
    const userId = await getUserId(req).catch(() => null);
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
