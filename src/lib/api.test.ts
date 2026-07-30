import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { badRequest, handle, ok } from "./api";
import { logger } from "./logger";
import { MetadataError } from "@/lib/metadata/types";

// `logger.info` would otherwise write a real line to data/logs on every test
// run — spy it out, matching how metron.test.ts spies console.log/warn rather
// than mocking the whole module.
const req = (url = "http://localhost/api/comics", init?: RequestInit) => new Request(url, init);

// winston's `.info()` is overloaded (message+meta, or a single info object),
// which makes vi.spyOn's inferred call-args type too narrow for how `handle`
// actually calls it. Cast once here rather than fighting the overload at each
// call site.
function loggedMeta(info: ReturnType<typeof vi.spyOn>, call = 0): Record<string, unknown> {
  return (info.mock.calls[call] as unknown as [string, Record<string, unknown>])[1];
}

describe("handle", () => {
  afterEach(() => vi.restoreAllMocks());

  it("returns the wrapped response unchanged on success", async () => {
    const res = await handle(req(), () => ok({ hello: "world" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ hello: "world" });
  });

  it("maps a thrown ZodError to a 400 with field detail", async () => {
    const schema = z.object({ name: z.string() });
    // `handle` needs a body typed as returning Response — parse() always
    // throws for {}, so this path never actually returns, but the function
    // still has to type-check as one that could.
    const res = await handle(req(), (): Response => {
      schema.parse({});
      throw new Error("unreachable");
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Validation failed");
    expect(body.fields).toHaveProperty("name");
  });

  it("passes a thrown MetadataError's status and message through", async () => {
    const res = await handle(req(), () => {
      throw new MetadataError("Rate limited by the metadata provider", 429);
    });
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: "Rate limited by the metadata provider" });
  });

  it("reduces any other thrown error to a bare 500, no internal detail leaked", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await handle(req(), () => {
      throw new Error("some internal detail that must not reach the client");
    });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Internal error" });
    errSpy.mockRestore();
  });

  it("logs one tag:api line with method, path, status and duration", async () => {
    const info = vi.spyOn(logger, "info").mockImplementation(() => logger);
    await handle(req("http://localhost/api/comics?board=abc"), () => ok([]));
    expect(info).toHaveBeenCalledTimes(1);
    const meta = loggedMeta(info);
    expect(meta).toMatchObject({
      tag: "api",
      method: "GET",
      path: "/api/comics", // query string excluded — pathname only
      status: 200,
    });
    expect(typeof meta.ms).toBe("number");
    info.mockRestore();
  });

  it("logs userId: null for a request with no session, rather than throwing", async () => {
    // A bare Request carries no session cookie, so getUserId's real lookup
    // resolves to null — this exercises the actual fallback path, not a mock.
    const info = vi.spyOn(logger, "info").mockImplementation(() => logger);
    await handle(req(), () => ok({}));
    expect(loggedMeta(info)).toMatchObject({ userId: null });
    info.mockRestore();
  });

  it("still returns the real response even if logging itself throws", async () => {
    const info = vi.spyOn(logger, "info").mockImplementation(() => {
      throw new Error("disk full");
    });
    const res = await handle(req(), () => ok({ fine: true }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ fine: true });
    info.mockRestore();
  });

  it("logs the error-path status too (400), not just success", async () => {
    const info = vi.spyOn(logger, "info").mockImplementation(() => logger);
    await handle(req(), () => badRequest("nope"));
    expect(loggedMeta(info)).toMatchObject({ status: 400 });
    info.mockRestore();
  });
});
