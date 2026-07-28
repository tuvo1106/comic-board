import { afterEach, describe, expect, it, vi } from "vitest";
import { assertAllowedCover, fetchCover, readCapped } from "./covers";
import { MetadataError } from "./types";

afterEach(() => vi.unstubAllGlobals());

describe("assertAllowedCover (SSRF guard)", () => {
  it("accepts the allowlisted Metron host over https", () => {
    expect(assertAllowedCover("https://static.metron.cloud/a.jpg").hostname).toBe(
      "static.metron.cloud",
    );
  });

  it("rejects a non-allowlisted host", () => {
    expect(() => assertAllowedCover("https://evil.example.com/a.jpg")).toThrow(MetadataError);
    expect(() => assertAllowedCover("https://static.metron.cloud.evil.com/a.jpg")).toThrow();
  });

  it("rejects non-https and garbage URLs", () => {
    expect(() => assertAllowedCover("http://static.metron.cloud/a.jpg")).toThrow(MetadataError);
    expect(() => assertAllowedCover("not a url")).toThrow(MetadataError);
  });
});

describe("readCapped", () => {
  it("returns the full body when under the cap", async () => {
    const res = new Response(new Uint8Array([1, 2, 3, 4]));
    const buf = await readCapped(res, 10);
    expect(buf.byteLength).toBe(4);
  });

  it("aborts once the streamed body exceeds the cap", async () => {
    const res = new Response(new Uint8Array(20));
    await expect(readCapped(res, 10)).rejects.toThrow(/too large/);
  });
});

function stubFetch(impl: () => Promise<Response> | Response) {
  vi.stubGlobal("fetch", vi.fn(impl));
}
const URL_OK = "https://static.metron.cloud/a.jpg";

describe("fetchCover", () => {
  it("returns bytes + content-type on success", async () => {
    stubFetch(() => new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "image/jpeg" } }));
    const { bytes, contentType } = await fetchCover(URL_OK);
    expect(bytes.byteLength).toBe(3);
    expect(contentType).toBe("image/jpeg");
  });

  it("refuses to follow a redirect (SSRF guard)", async () => {
    stubFetch(() => new Response(null, { status: 302, headers: { location: "http://169.254.169.254/" } }));
    await expect(fetchCover(URL_OK)).rejects.toThrow(/redirect/i);
  });

  it("rejects an oversize Content-Length up front", async () => {
    stubFetch(
      () =>
        new Response(new Uint8Array([1]), {
          headers: { "content-type": "image/jpeg", "content-length": String(999 * 1024 * 1024) },
        }),
    );
    await expect(fetchCover(URL_OK)).rejects.toThrow(/too large/);
  });

  it("rejects a non-image response", async () => {
    stubFetch(() => new Response("<html>", { headers: { "content-type": "text/html" } }));
    await expect(fetchCover(URL_OK)).rejects.toThrow(/did not return an image/);
  });

  it("maps a non-ok status and network errors to clean errors", async () => {
    stubFetch(() => new Response(null, { status: 404 }));
    await expect(fetchCover(URL_OK)).rejects.toThrow(/failed \(404\)/);

    stubFetch(() => {
      const e = new Error("aborted");
      e.name = "AbortError";
      return Promise.reject(e);
    });
    await expect(fetchCover(URL_OK)).rejects.toThrow(/timed out/);

    stubFetch(() => Promise.reject(new Error("boom")));
    await expect(fetchCover(URL_OK)).rejects.toThrow(/unreachable/);
  });

  it("never fetches a disallowed host", async () => {
    const spy = vi.fn(() => new Response(new Uint8Array([1])));
    vi.stubGlobal("fetch", spy);
    await expect(fetchCover("https://evil.example.com/a.jpg")).rejects.toThrow(MetadataError);
    expect(spy).not.toHaveBeenCalled();
  });
});
