import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchJson, readRateLimit } from "./http";
import { MetadataError } from "./types";

afterEach(() => vi.unstubAllGlobals());

function resWith(headers?: Record<string, string>) {
  return new Response(null, { headers });
}

describe("readRateLimit", () => {
  it("parses the burst-remaining header, guarding blank/invalid values", () => {
    expect(readRateLimit(resWith()).burstRemaining).toBeNull();
    expect(readRateLimit(resWith({ "x-ratelimit-burst-remaining": "" })).burstRemaining).toBeNull();
    expect(readRateLimit(resWith({ "x-ratelimit-burst-remaining": "abc" })).burstRemaining).toBeNull();
    expect(readRateLimit(resWith({ "x-ratelimit-burst-remaining": "0" })).burstRemaining).toBe(0);
    expect(readRateLimit(resWith({ "x-ratelimit-burst-remaining": "5" })).burstRemaining).toBe(5);
  });
});

function stubFetch(impl: () => Promise<Response> | Response) {
  vi.stubGlobal("fetch", vi.fn(impl));
}

describe("fetchJson", () => {
  it("returns the response + parsed data on success", async () => {
    stubFetch(
      () => new Response(JSON.stringify({ a: 1 }), { headers: { "content-type": "application/json" } }),
    );
    const { data } = await fetchJson("https://x.test");
    expect(data).toEqual({ a: 1 });
  });

  it("maps 429 to a rate-limit error carrying Retry-After", async () => {
    stubFetch(() => new Response(null, { status: 429, headers: { "retry-after": "30" } }));
    await expect(fetchJson("https://x.test")).rejects.toThrow(/rate limited.*30/i);
    await expect(fetchJson("https://x.test")).rejects.toBeInstanceOf(MetadataError);
  });

  it("maps a non-ok status to a clean error", async () => {
    stubFetch(() => new Response(null, { status: 500 }));
    await expect(fetchJson("https://x.test")).rejects.toThrow(/error \(500\)/);
  });

  it("rejects invalid JSON", async () => {
    stubFetch(() => new Response("not json", { headers: { "content-type": "application/json" } }));
    await expect(fetchJson("https://x.test")).rejects.toThrow(/invalid JSON/);
  });

  it("maps abort/network failures to timeout/unreachable", async () => {
    stubFetch(() => {
      const e = new Error("aborted");
      e.name = "AbortError";
      return Promise.reject(e);
    });
    await expect(fetchJson("https://x.test")).rejects.toThrow(/timed out/);

    stubFetch(() => Promise.reject(new Error("boom")));
    await expect(fetchJson("https://x.test")).rejects.toThrow(/unreachable/);
  });
});
