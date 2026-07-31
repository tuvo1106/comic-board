import { describe, expect, it } from "vitest";
import { NATURAL_DIR, isSortDir, isSortField, sortComics } from "./sort";
import { makeComic } from "./test-fixtures";

const ids = (list: { id: string }[]) => list.map((c) => c.id);

describe("sortComics", () => {
  it("manual = ascending board position, ignores direction", () => {
    const comics = [
      makeComic({ id: "a", position: 3 }),
      makeComic({ id: "b", position: 1 }),
      makeComic({ id: "c", position: 2 }),
    ];
    expect(ids(sortComics(comics, "manual", "asc"))).toEqual(["b", "c", "a"]);
    expect(ids(sortComics(comics, "manual", "desc"))).toEqual(["b", "c", "a"]);
  });

  it("added desc = most recently added first; asc flips it", () => {
    const comics = [
      makeComic({ id: "old", createdAt: 100 }),
      makeComic({ id: "new", createdAt: 300 }),
      makeComic({ id: "mid", createdAt: 200 }),
    ];
    expect(ids(sortComics(comics, "added", "desc"))).toEqual(["new", "mid", "old"]);
    expect(ids(sortComics(comics, "added", "asc"))).toEqual(["old", "mid", "new"]);
  });

  it("coverDate desc = newest first, undated always sink to the bottom", () => {
    const comics = [
      makeComic({ id: "old", coverDate: "1963-06-01" }),
      makeComic({ id: "undated", coverDate: null }),
      makeComic({ id: "new", coverDate: "2025-11-05" }),
    ];
    expect(ids(sortComics(comics, "coverDate", "desc"))).toEqual(["new", "old", "undated"]);
  });

  it("empties sink to the bottom in ascending direction too", () => {
    const comics = [
      makeComic({ id: "old", coverDate: "1963-06-01" }),
      makeComic({ id: "undated", coverDate: null }),
      makeComic({ id: "new", coverDate: "2025-11-05" }),
    ];
    // asc puts oldest first, but the undated row still lands last.
    expect(ids(sortComics(comics, "coverDate", "asc"))).toEqual(["old", "new", "undated"]);
  });

  it("series asc = A–Z, then ascending issue within a series", () => {
    const comics = [
      makeComic({ id: "asm300", series: "Amazing Spider-Man", issueNumber: "300" }),
      makeComic({ id: "bat1", series: "Batman", issueNumber: "1" }),
      makeComic({ id: "asm14", series: "Amazing Spider-Man", issueNumber: "14" }),
    ];
    expect(ids(sortComics(comics, "series", "asc"))).toEqual(["asm14", "asm300", "bat1"]);
    // desc flips the series order; the issue tie-break stays ascending within a series.
    expect(ids(sortComics(comics, "series", "desc"))).toEqual(["bat1", "asm14", "asm300"]);
  });

  it("issue = numeric order (300 after 14), non-numeric sink last", () => {
    const comics = [
      makeComic({ id: "i300", issueNumber: "300" }),
      makeComic({ id: "i14", issueNumber: "14" }),
      makeComic({ id: "none", issueNumber: null }),
    ];
    expect(ids(sortComics(comics, "issue", "asc"))).toEqual(["i14", "i300", "none"]);
  });

  it("rating desc = highest first, unrated last, supports 0.5 steps", () => {
    const comics = [
      makeComic({ id: "three", rating: 3 }),
      makeComic({ id: "unrated", rating: null }),
      makeComic({ id: "four-half", rating: 4.5 }),
      makeComic({ id: "half", rating: 0.5 }),
    ];
    expect(ids(sortComics(comics, "rating", "desc"))).toEqual([
      "four-half",
      "three",
      "half",
      "unrated",
    ]);
  });

  it("size sorts by total pixels, smallest first — the upscale candidates", () => {
    const small = makeComic({ width: 600, height: 923 });
    const big = makeComic({ width: 1600, height: 2461 });
    // Wider than `small` but far fewer pixels overall: ranking on width alone
    // would put this above a properly large scan, which isn't what "how much
    // detail is here" means.
    const wideThin = makeComic({ width: 700, height: 300 });

    const asc = sortComics([big, small, wideThin], "size", "asc");
    expect(asc.map((c) => c.width)).toEqual([700, 600, 1600]);

    const desc = sortComics([wideThin, small, big], "size", "desc");
    expect(desc.map((c) => c.width)).toEqual([1600, 600, 700]);
  });

  it("does not mutate the input array", () => {
    const comics = [makeComic({ position: 2 }), makeComic({ position: 1 })];
    const snapshot = ids(comics);
    sortComics(comics, "manual", "asc");
    expect(ids(comics)).toEqual(snapshot);
  });
});

describe("isSortField", () => {
  it("accepts valid fields and rejects others", () => {
    expect(isSortField("coverDate")).toBe(true);
    expect(isSortField("manual")).toBe(true);
    expect(isSortField("issue")).toBe(true);
    expect(isSortField("nope")).toBe(false);
    expect(isSortField(null)).toBe(false);
  });
});

describe("isSortDir", () => {
  it("accepts asc/desc and rejects others", () => {
    expect(isSortDir("asc")).toBe(true);
    expect(isSortDir("desc")).toBe(true);
    expect(isSortDir("up")).toBe(false);
    expect(isSortDir(null)).toBe(false);
  });
});

describe("NATURAL_DIR", () => {
  it("dates and rating default to descending, text to ascending", () => {
    expect(NATURAL_DIR.coverDate).toBe("desc");
    expect(NATURAL_DIR.added).toBe("desc");
    expect(NATURAL_DIR.rating).toBe("desc");
    expect(NATURAL_DIR.series).toBe("asc");
    expect(NATURAL_DIR.manual).toBe("asc");
  });
});
