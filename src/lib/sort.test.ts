import { describe, expect, it } from "vitest";
import { isSortKey, sortComics } from "./sort";
import { makeComic } from "./test-fixtures";

const ids = (list: { id: string }[]) => list.map((c) => c.id);

describe("sortComics", () => {
  it("manual = ascending board position", () => {
    const comics = [
      makeComic({ id: "a", position: 3 }),
      makeComic({ id: "b", position: 1 }),
      makeComic({ id: "c", position: 2 }),
    ];
    expect(ids(sortComics(comics, "manual"))).toEqual(["b", "c", "a"]);
  });

  it("added = most recently added first", () => {
    const comics = [
      makeComic({ id: "old", createdAt: 100 }),
      makeComic({ id: "new", createdAt: 300 }),
      makeComic({ id: "mid", createdAt: 200 }),
    ];
    expect(ids(sortComics(comics, "added"))).toEqual(["new", "mid", "old"]);
  });

  it("coverDate = newest first, undated sink to the bottom", () => {
    const comics = [
      makeComic({ id: "old", coverDate: "1963-06-01" }),
      makeComic({ id: "undated", coverDate: null }),
      makeComic({ id: "new", coverDate: "2025-11-05" }),
    ];
    expect(ids(sortComics(comics, "coverDate"))).toEqual(["new", "old", "undated"]);
  });

  it("series = A–Z, then ascending issue within a series", () => {
    const comics = [
      makeComic({ id: "asm300", series: "Amazing Spider-Man", issueNumber: "300" }),
      makeComic({ id: "bat1", series: "Batman", issueNumber: "1" }),
      makeComic({ id: "asm14", series: "Amazing Spider-Man", issueNumber: "14" }),
    ];
    expect(ids(sortComics(comics, "series"))).toEqual(["asm14", "asm300", "bat1"]);
  });

  it("rating = highest first, unrated last, supports 0.5 steps", () => {
    const comics = [
      makeComic({ id: "three", rating: 3 }),
      makeComic({ id: "unrated", rating: null }),
      makeComic({ id: "four-half", rating: 4.5 }),
      makeComic({ id: "half", rating: 0.5 }),
    ];
    expect(ids(sortComics(comics, "rating"))).toEqual(["four-half", "three", "half", "unrated"]);
  });

  it("does not mutate the input array", () => {
    const comics = [makeComic({ position: 2 }), makeComic({ position: 1 })];
    const snapshot = ids(comics);
    sortComics(comics, "manual");
    expect(ids(comics)).toEqual(snapshot);
  });
});

describe("isSortKey", () => {
  it("accepts valid keys and rejects others", () => {
    expect(isSortKey("coverDate")).toBe(true);
    expect(isSortKey("manual")).toBe(true);
    expect(isSortKey("nope")).toBe(false);
    expect(isSortKey(null)).toBe(false);
  });
});
