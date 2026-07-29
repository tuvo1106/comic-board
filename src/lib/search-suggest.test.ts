import { describe, expect, it } from "vitest";
import type { MetaDTO } from "./types";
import { suggestSearch } from "./search-suggest";

const meta = (over: Partial<MetaDTO> = {}): MetaDTO => ({
  series: [],
  publishers: [],
  authors: [],
  artists: [],
  characters: [],
  tags: [],
  ...over,
});

const v = (s: Suggestion[]) => s.map((x) => `${x.kind}:${x.value}`);
type Suggestion = ReturnType<typeof suggestSearch>[number];

describe("suggestSearch", () => {
  it("returns nothing for an empty or whitespace-only query", () => {
    const m = meta({ series: [{ value: "Batman", count: 3 }] });
    expect(suggestSearch(m, "")).toEqual([]);
    expect(suggestSearch(m, "   ")).toEqual([]);
  });

  it("returns nothing before /api/meta has loaded", () => {
    expect(suggestSearch(undefined, "bat")).toEqual([]);
  });

  it("matches case-insensitively on a substring", () => {
    const m = meta({ series: [{ value: "Absolute Batman", count: 2 }] });
    expect(v(suggestSearch(m, "BATM"))).toEqual(["series:Absolute Batman"]);
  });

  it("labels each suggestion with its field", () => {
    const m = meta({ artists: [{ value: "Nick Dragotta", count: 2 }] });
    expect(suggestSearch(m, "nick")[0]).toMatchObject({
      value: "Nick Dragotta",
      kind: "artist",
      label: "Cover artist",
      count: 2,
    });
  });

  it("ranks prefix matches above mid-string matches, regardless of count", () => {
    const m = meta({
      series: [
        { value: "Absolute Batman", count: 9 }, // higher count, but not a prefix
        { value: "Batman", count: 1 },
      ],
    });
    expect(v(suggestSearch(m, "bat"))).toEqual(["series:Batman", "series:Absolute Batman"]);
  });

  it("breaks a prefix tie by count, descending", () => {
    const m = meta({
      characters: [
        { value: "Batgirl", count: 1 },
        { value: "Batman", count: 7 },
      ],
    });
    expect(v(suggestSearch(m, "bat"))).toEqual(["character:Batman", "character:Batgirl"]);
  });

  it("breaks a count tie alphabetically, so ordering is stable", () => {
    const m = meta({
      tags: [
        { value: "Batzarro", count: 2 },
        { value: "Batgirl", count: 2 },
      ],
    });
    expect(v(suggestSearch(m, "bat"))).toEqual(["tag:Batgirl", "tag:Batzarro"]);
  });

  it("omits a value the user has already typed in full, keeping longer matches", () => {
    const m = meta({
      series: [
        { value: "Batman", count: 3 }, // typed in full -> dropped
        { value: "Absolute Batman", count: 1 }, // still a substring match -> kept
      ],
    });
    expect(v(suggestSearch(m, "batman"))).toEqual(["series:Absolute Batman"]);
  });

  it("collapses one value appearing in several fields into a single row", () => {
    const m = meta({
      series: [{ value: "Batman", count: 3 }],
      characters: [{ value: "Batman", count: 5 }],
    });
    // Both rows would run the identical free-text search, so only one shows.
    expect(v(suggestSearch(m, "bat"))).toEqual(["character:Batman"]);
  });

  it("prefers the character reading over the series one, even on a lower count", () => {
    const m = meta({
      series: [{ value: "Batman", count: 9 }],
      characters: [{ value: "Batman", count: 1 }],
    });
    const got = suggestSearch(m, "bat");
    expect(got).toHaveLength(1);
    expect(got[0]).toMatchObject({ kind: "character", label: "Character", count: 1 });
  });

  it("collapses across fields regardless of case, and is order-independent", () => {
    const seriesFirst = meta({
      series: [{ value: "Batman", count: 3 }],
      characters: [{ value: "batman", count: 2 }],
    });
    // Same data, but the character entry is the one with the "nicer" casing.
    const characterFirst = meta({
      series: [{ value: "batman", count: 3 }],
      characters: [{ value: "Batman", count: 2 }],
    });
    expect(suggestSearch(seriesFirst, "bat")).toHaveLength(1);
    expect(suggestSearch(seriesFirst, "bat")[0].kind).toBe("character");
    expect(suggestSearch(characterFirst, "bat")).toHaveLength(1);
    expect(suggestSearch(characterFirst, "bat")[0].kind).toBe("character");
  });

  it("falls back through the priority order when the preferred fields are absent", () => {
    const m = meta({
      authors: [{ value: "Batson", count: 1 }],
      tags: [{ value: "Batson", count: 4 }],
    });
    // Author outranks tag, despite the tag's higher count.
    expect(v(suggestSearch(m, "bat"))).toEqual(["author:Batson"]);
  });

  it("caps the total number of suggestions", () => {
    const many = (prefix: string) =>
      Array.from({ length: 5 }, (_, i) => ({ value: `${prefix} ${i}`, count: 1 }));
    const m = meta({
      series: many("Bat s"),
      publishers: many("Bat p"),
      characters: many("Bat c"),
    });
    expect(suggestSearch(m, "bat")).toHaveLength(5);
  });

  it("honours an explicit total", () => {
    const m = meta({
      series: [
        { value: "Batman", count: 3 },
        { value: "Batwoman", count: 2 },
        { value: "Batgirl", count: 1 },
      ],
    });
    expect(suggestSearch(m, "bat", { total: 2 })).toHaveLength(2);
  });

  it("restricts to the requested kinds (the provider box wants series only)", () => {
    const m = meta({
      series: [{ value: "Batman", count: 1 }],
      characters: [{ value: "Batman", count: 5 }],
      tags: [{ value: "Bat-signal", count: 2 }],
    });
    const got = suggestSearch(m, "bat", { kinds: ["series"] });
    // Character normally wins the "Batman" collapse; excluded here, so the
    // series row survives instead of the value vanishing altogether.
    expect(v(got)).toEqual(["series:Batman"]);
  });

  it("still collapses duplicates within a restricted set", () => {
    const m = meta({
      series: [
        { value: "Batman", count: 1 },
        { value: "batman", count: 1 }, // same name, different case
      ],
    });
    expect(suggestSearch(m, "bat", { kinds: ["series"] })).toHaveLength(1);
  });

  it("returns nothing when the query matches no known value", () => {
    const m = meta({ series: [{ value: "Batman", count: 3 }] });
    expect(suggestSearch(m, "zzz")).toEqual([]);
  });
});
