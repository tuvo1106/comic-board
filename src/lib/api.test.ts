import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { authed, badRequest, handle, ok } from "./api";
import { logger } from "./logger";
import * as session from "./session";
import { MetadataError } from "@/lib/metadata/types";

// `logger.*` would otherwise write real lines to data/logs on every test run —
// spy it out, matching how metron.test.ts does, rather than mocking the whole
// module.
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
    const errSpy = vi.spyOn(logger, "error").mockImplementation(() => logger);
    const res = await handle(req(), () => {
      throw new Error("some internal detail that must not reach the client");
    });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Internal error" });
    // The detail isn't discarded — it goes to the server-side log, which is the
    // whole point of not putting it in the response.
    const logged = (errSpy.mock.calls[0] as unknown as [string, Record<string, unknown>])[1];
    expect(logged).toMatchObject({
      tag: "api.error",
      error: "some internal detail that must not reach the client",
    });
    expect(typeof logged.stack).toBe("string");
    // `message` is winston's own field; a meta key of that name gets folded
    // into the log line's message instead of staying separately greppable.
    // Spying the logger can't see that (it inspects the meta pre-format), so
    // assert the shape here — it was wrong in the real file output once.
    expect(logged).not.toHaveProperty("message");
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

describe("authed", () => {
  afterEach(() => vi.restoreAllMocks());

  const signedInAs = (id: string | null) =>
    vi.spyOn(session, "getUserId").mockResolvedValue(id);

  it("hands the resolved user id to the handler", async () => {
    signedInAs("user_123");
    const res = await authed(req(), (userId) => ok({ userId }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ userId: "user_123" });
  });

  it("short-circuits with a 401 and never runs the handler when signed out", async () => {
    signedInAs(null);
    const body = vi.fn(() => ok({ reached: true }));
    const res = await authed(req(), body);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Not signed in" });
    expect(body).not.toHaveBeenCalled();
  });

  it("resolves the session exactly once — the log line reuses it", async () => {
    // The whole point of authed() over handle(): the pre-refactor pairing of an
    // in-handler getUserId with a second lookup inside logRequest meant two
    // session reads on every authenticated request.
    const getUserId = signedInAs("user_123");
    const info = vi.spyOn(logger, "info").mockImplementation(() => logger);
    await authed(req(), () => ok({}));
    expect(getUserId).toHaveBeenCalledTimes(1);
    expect(loggedMeta(info)).toMatchObject({ userId: "user_123" });
  });

  it("applies the same error mapping as handle (ZodError -> 400 + fields)", async () => {
    signedInAs("user_123");
    const schema = z.object({ name: z.string() });
    const res = await authed(req(), (): Response => {
      schema.parse({});
      throw new Error("unreachable");
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Validation failed");
    expect(body.fields).toHaveProperty("name");
  });

  it("reduces an unexpected handler throw to a bare 500", async () => {
    signedInAs("user_123");
    const errSpy = vi.spyOn(logger, "error").mockImplementation(() => logger);
    const res = await authed(req(), () => {
      throw new Error("internal detail that must not reach the client");
    });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Internal error" });
    errSpy.mockRestore();
  });

  it("500s rather than leaking when the session lookup itself throws", async () => {
    vi.spyOn(session, "getUserId").mockRejectedValue(new Error("db is down"));
    const errSpy = vi.spyOn(logger, "error").mockImplementation(() => logger);
    const res = await authed(req(), () => ok({ reached: true }));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Internal error" });
    errSpy.mockRestore();
  });

  it("logs the 401 with userId: null", async () => {
    signedInAs(null);
    const info = vi.spyOn(logger, "info").mockImplementation(() => logger);
    await authed(req(), () => ok({}));
    expect(loggedMeta(info)).toMatchObject({ status: 401, userId: null });
  });
});
