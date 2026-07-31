import path from "node:path";
import { describe, expect, it } from "vitest";
import { COVERS_ROOT, coverDir, storage } from "./storage";

describe("coverDir", () => {
  it("strips the filename to leave the folder key", () => {
    expect(coverDir("covers/abc123/full.webp")).toBe("covers/abc123");
    expect(coverDir("covers/abc123/thumb.webp")).toBe("covers/abc123");
  });

  it("is what makes a replaced cover deletable at all", () => {
    // A comic's id equals its *original* image id, so the two agree until the
    // first replace — after which only the stored imagePath points at the live
    // folder. Deleting by comic id is the bug this function exists to prevent
    // (see wipeUser in db/import.ts and sweepDeletedComics in db/queries.ts).
    const comicId = "comic_original";
    const afterReplace = "covers/img_replacement/full.webp";
    expect(coverDir(afterReplace)).toBe("covers/img_replacement");
    expect(coverDir(afterReplace)).not.toBe(`covers/${comicId}`);
  });
});

describe("getUrl / keyFromUrl", () => {
  it("maps a storage key to its served url and back", () => {
    const key = "covers/abc123/full.webp";
    const url = storage.getUrl(key);
    expect(url).toBe("/images/abc123/full.webp");
    expect(storage.keyFromUrl(url)).toBe(key);
  });

  it("round-trips every cover url the DTO layer produces", () => {
    for (const key of ["covers/a/full.webp", "covers/b/thumb.webp"]) {
      expect(storage.keyFromUrl(storage.getUrl(key))).toBe(key);
    }
  });

  it("leaves a url it doesn't own alone", () => {
    expect(storage.keyFromUrl("/other/thing.webp")).toBe("/other/thing.webp");
  });
});

describe("resolve", () => {
  it("resolves a key under the covers root", () => {
    expect(storage.resolve("covers/abc123/full.webp")).toBe(
      path.join(COVERS_ROOT, "abc123/full.webp"),
    );
  });

  it("accepts a key with or without the covers/ prefix", () => {
    expect(storage.resolve("abc123/full.webp")).toBe(storage.resolve("covers/abc123/full.webp"));
  });

  // This route serves files straight off disk from a user-supplied path
  // (`/images/[...path]`), so traversal has to be rejected at the key layer.
  it("rejects path traversal that would escape the covers root", () => {
    for (const evil of [
      "covers/../../../etc/passwd",
      "../../etc/passwd",
      "covers/abc/../../../../secrets.env",
    ]) {
      expect(() => storage.resolve(evil)).toThrow(/Invalid storage key/);
    }
  });

  it("allows traversal that stays inside the root", () => {
    expect(storage.resolve("covers/abc/../abc/full.webp")).toBe(
      path.join(COVERS_ROOT, "abc/full.webp"),
    );
  });
});
