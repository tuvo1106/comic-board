import { describe, expect, it } from "vitest";
import { comicMetaSchema, comicUpdateSchema } from "./schemas";

describe("comicUpdateSchema (partial patch)", () => {
  // Regression: a partial patch must NOT inject empty arrays for absent fields,
  // or a `{ rating }` update silently wipes authors/artists/characters/tags.
  it("a rating-only patch parses to ONLY rating — no array fields", () => {
    const parsed = comicUpdateSchema.parse({ rating: 4.5 });
    expect(parsed).toEqual({ rating: 4.5 });
    expect("authors" in parsed).toBe(false);
    expect("artists" in parsed).toBe(false);
    expect("characters" in parsed).toBe(false);
    expect("tags" in parsed).toBe(false);
  });

  it("leaves other absent fields absent (undefined = unchanged)", () => {
    expect(comicUpdateSchema.parse({ series: "Batman" })).toEqual({ series: "Batman" });
    expect(comicUpdateSchema.parse({ artists: ["Jim Lee"] })).toEqual({ artists: ["Jim Lee"] });
  });

  it("allows clearing a rating with null", () => {
    expect(comicUpdateSchema.parse({ rating: null })).toEqual({ rating: null });
  });

  it("validates rating range and 0.5 steps", () => {
    expect(() => comicUpdateSchema.parse({ rating: 0 })).toThrow();
    expect(() => comicUpdateSchema.parse({ rating: 5.5 })).toThrow();
    expect(() => comicUpdateSchema.parse({ rating: 3.3 })).toThrow();
    expect(comicUpdateSchema.parse({ rating: 2.5 })).toEqual({ rating: 2.5 });
  });
});

describe("comicMetaSchema (upload)", () => {
  // Upload intentionally defaults arrays so a bare upload has empty associations.
  it("defaults array fields to [] when absent", () => {
    const parsed = comicMetaSchema.parse({ series: "New Series" });
    expect(parsed.authors).toEqual([]);
    expect(parsed.artists).toEqual([]);
    expect(parsed.characters).toEqual([]);
    expect(parsed.tags).toEqual([]);
    expect(parsed.boardIds).toEqual([]);
  });

  it("requires a non-empty series", () => {
    expect(() => comicMetaSchema.parse({ series: "" })).toThrow();
  });
});
