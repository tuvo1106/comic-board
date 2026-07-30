import { NextResponse } from "next/server";
import { ZodError } from "zod";
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

/** Wrap a route body so thrown ZodErrors become 400s and others become 500s. */
/**
 * Wraps a route handler body, turning thrown errors into the right client-safe
 * response: Zod validation errors become 400s with field detail, `MetadataError`
 * passes its status and message through (an upstream provider's own message,
 * never the API key), and anything else is logged server-side and reduced to a
 * bare 500 — no internal message or stack hint reaches the client.
 */
export async function handle(fn: () => Promise<Response> | Response): Promise<Response> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof ZodError) {
      return badRequest("Validation failed", err.flatten().fieldErrors as Record<string, string[]>);
    }
    if (err instanceof MetadataError) {
      // Client-safe message from an upstream metadata provider (never the key).
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("API error:", err);
    // Don't leak internal error details (messages, stack hints) to clients.
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
