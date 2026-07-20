import { NextResponse } from "next/server";
import { ZodError } from "zod";

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
export async function handle(fn: () => Promise<Response> | Response): Promise<Response> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof ZodError) {
      return badRequest("Validation failed", err.flatten().fieldErrors as Record<string, string[]>);
    }
    console.error("API error:", err);
    // Don't leak internal error details (messages, stack hints) to clients.
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
