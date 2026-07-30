import { describe, expect, it } from "vitest";
import { makeComic } from "./test-fixtures";
import { computeStats } from "./stats";
import type { ComicDTO } from "./types";

// Local wall-clock timestamps. `createdAt` is bucketed in local time (see
// growthSeries), so building fixtures the same way keeps these assertions
// independent of the machine's timezone.
const at = (y: number, m: number, d = 1) => new Date(y, m - 1, d).getTime();

const labels = (buckets: { label: string }[]) => buckets.map((b) => b.label);
const pairs = (buckets: { label: string; count: number }[]) =>
  buckets.map((b) => [b.label, b.count]);

describe("computeStats", () => {
  describe("totals", () => {
    it("counts comics and distinct series / publishers / artists", () => {
      const comics = [
        makeComic({ series: "Batman", publisher: "DC", artists: ["Jim Lee"] }),
        makeComic({ series: "Batman", publisher: "DC", artists: ["Jim Lee", "Alex Ross"] }),
        makeComic({ series: "Saga", publisher: "Image", artists: [] }),
      ];
      expect(computeStats(comics).totals).toMatchObject({
        comics: 3,
        series: 2,
        publishers: 2,
        artists: 2,
      });
    });

    it("averages only the rated comics, so unrated ones don't drag it to zero", () => {
      const comics = [
        makeComic({ rating: 5 }),
        makeComic({ rating: 4 }),
        makeComic({ rating: null }),
      ];
      expect(computeStats(comics).totals).toMatchObject({
        rated: 2,
        averageRating: 4.5,
      });
    });

    it("reports no average when nothing is rated", () => {
      expect(computeStats([makeComic({ rating: null })]).totals.averageRating).toBeNull();
    });

    it("counts comics with no cover date", () => {
      const comics = [makeComic({ coverDate: "1994-05-01" }), makeComic({ coverDate: null })];
      expect(computeStats(comics).totals.undated).toBe(1);
    });
  });

  describe("publishers", () => {
    it("ranks by count, highest first", () => {
      const comics = [
        makeComic({ publisher: "Image" }),
        makeComic({ publisher: "DC" }),
        makeComic({ publisher: "DC" }),
      ];
      expect(pairs(computeStats(comics).publishers)).toEqual([
        ["DC", 2],
        ["Image", 1],
      ]);
    });

    it("breaks count ties by label, so equal counts don't shuffle as comics are added", () => {
      const comics = [
        makeComic({ publisher: "Zenescope" }),
        makeComic({ publisher: "Ahoy" }),
        makeComic({ publisher: "Marvel" }),
      ];
      expect(labels(computeStats(comics).publishers)).toEqual(["Ahoy", "Marvel", "Zenescope"]);
    });

    it("collapses everything past the top 8 into an Other bucket that names the remainder", () => {
      // Ten publishers with descending counts: the top 8 stay, the last 2 merge.
      const comics: ComicDTO[] = [];
      for (let i = 0; i < 10; i += 1) {
        const publisher = `P${String(i).padStart(2, "0")}`;
        for (let n = 0; n < 10 - i; n += 1) comics.push(makeComic({ publisher }));
      }
      const buckets = computeStats(comics).publishers;
      expect(buckets).toHaveLength(9);
      expect(buckets[8]).toEqual({ value: null, label: "Other (2)", count: 3 }); // 2 + 1
    });

    it("keeps comics with no publisher in their own bucket rather than dropping them", () => {
      const comics = [
        makeComic({ publisher: "DC" }),
        makeComic({ publisher: null }),
        makeComic({ publisher: null }),
      ];
      expect(pairs(computeStats(comics).publishers)).toEqual([
        ["DC", 1],
        ["No publisher", 2],
      ]);
    });
  });

  describe("decades", () => {
    it("buckets cover dates by decade with an inclusive date range for filtering", () => {
      const comics = [
        makeComic({ coverDate: "1994-05-01" }),
        makeComic({ coverDate: "1999-12-31" }),
      ];
      expect(computeStats(comics).decades).toEqual([
        { label: "1990s", count: 2, from: "1990-01-01", to: "1999-12-31" },
      ]);
    });

    it("keeps empty decades between the first and last as zero-count buckets", () => {
      const comics = [makeComic({ coverDate: "1975-01-01" }), makeComic({ coverDate: "2004-01-01" })];
      expect(pairs(computeStats(comics).decades)).toEqual([
        ["1970s", 1],
        ["1980s", 0],
        ["1990s", 0],
        ["2000s", 1],
      ]);
    });

    it("puts undated comics in a trailing Unknown bucket with no date range", () => {
      const comics = [makeComic({ coverDate: "1994-05-01" }), makeComic({ coverDate: null })];
      const decades = computeStats(comics).decades;
      expect(decades[decades.length - 1]).toEqual({
        label: "Unknown",
        count: 1,
        from: null,
        to: null,
      });
    });

    it("treats a malformed cover date as undated instead of inventing a decade", () => {
      const comics = [makeComic({ coverDate: "not-a-date" })];
      expect(labels(computeStats(comics).decades)).toEqual(["Unknown"]);
    });

    it("returns only Unknown when nothing is dated", () => {
      expect(labels(computeStats([makeComic({ coverDate: null })]).decades)).toEqual(["Unknown"]);
    });
  });

  describe("ratings", () => {
    it("always returns all ten half-star buckets plus unrated, holes included", () => {
      const stats = computeStats([makeComic({ rating: 4 })]);
      expect(labels(stats.ratings)).toEqual([
        "0.5", "1", "1.5", "2", "2.5", "3", "3.5", "4", "4.5", "5", "Unrated",
      ]);
      expect(stats.ratings.find((b) => b.label === "4")?.count).toBe(1);
      expect(stats.ratings.find((b) => b.label === "3")?.count).toBe(0);
    });

    it("counts unrated comics in their own bucket", () => {
      const stats = computeStats([makeComic({ rating: null }), makeComic({ rating: 5 })]);
      expect(stats.ratings.find((b) => b.rating === null)?.count).toBe(1);
    });

    it("snaps an off-step rating into range rather than dropping it from the histogram", () => {
      // Validation pins ratings to 0.5 steps in [0.5, 5], but an import or a
      // pre-validation row must still be counted somewhere.
      const stats = computeStats([
        makeComic({ rating: 3.7 }), // → 3.5
        makeComic({ rating: 9 }), // → 5
      ]);
      expect(stats.ratings.find((b) => b.rating === 3.5)?.count).toBe(1);
      expect(stats.ratings.find((b) => b.rating === 5)?.count).toBe(1);
    });
  });

  describe("release years", () => {
    it("counts covers by their release year", () => {
      const comics = [
        makeComic({ coverDate: "1994-05-01" }),
        makeComic({ coverDate: "1994-11-01" }),
        makeComic({ coverDate: "1995-02-01" }),
      ];
      expect(computeStats(comics).releaseYears).toEqual([
        { year: 1994, label: "1994", count: 2 },
        { year: 1995, label: "1995", count: 1 },
      ]);
    });

    it("fills the quiet years in between rather than closing the gap", () => {
      const comics = [makeComic({ coverDate: "1990-01-01" }), makeComic({ coverDate: "1993-01-01" })];
      expect(computeStats(comics).releaseYears.map((p) => [p.year, p.count])).toEqual([
        [1990, 1],
        [1991, 0],
        [1992, 0],
        [1993, 1],
      ]);
    });

    it("ignores undated comics, which totals.undated accounts for instead", () => {
      const comics = [makeComic({ coverDate: "1994-05-01" }), makeComic({ coverDate: null })];
      const stats = computeStats(comics);
      expect(stats.releaseYears).toEqual([{ year: 1994, label: "1994", count: 1 }]);
      expect(stats.totals.undated).toBe(1);
    });

    it("returns nothing when no comic carries a cover date", () => {
      expect(computeStats([makeComic({ coverDate: null })]).releaseYears).toEqual([]);
    });

    it("is keyed off the release date, not when the comic was added", () => {
      // The whole point of the switch: uploading a 1965 issue today is a 1965
      // data point, not a 2026 one.
      const comics = [makeComic({ coverDate: "1965-03-01", createdAt: at(2026, 7, 29) })];
      expect(computeStats(comics).releaseYears).toEqual([
        { year: 1965, label: "1965", count: 1 },
      ]);
    });
  });

  describe("leaderboards", () => {
    it("ranks multi-valued fields across every comic that lists them", () => {
      const comics = [
        makeComic({ artists: ["Jim Lee"], characters: ["Batman", "Robin"] }),
        makeComic({ artists: ["Jim Lee", "Alex Ross"], characters: ["Batman"] }),
      ];
      const stats = computeStats(comics);
      expect(pairs(stats.topArtists)).toEqual([
        ["Jim Lee", 2],
        ["Alex Ross", 1],
      ]);
      expect(pairs(stats.topCharacters)).toEqual([
        ["Batman", 2],
        ["Robin", 1],
      ]);
    });

    it("caps each leaderboard at ten rows", () => {
      const comics = Array.from({ length: 12 }, (_, i) =>
        makeComic({ series: `S${String(i).padStart(2, "0")}` }),
      );
      expect(computeStats(comics).topSeries).toHaveLength(10);
    });
  });

  describe("invariants", () => {
    const comics = [
      makeComic({ publisher: "DC", coverDate: "1994-05-01", rating: 4 }),
      makeComic({ publisher: "DC", coverDate: null, rating: null }),
      makeComic({ publisher: null, coverDate: "2011-01-01", rating: 2.5 }),
    ];

    // Every breakdown accounts for all comics — a chart whose bars don't add up
    // to the collection size can't distinguish "small collection" from "lots of
    // missing metadata".
    it.each([
      ["publishers", (s: ReturnType<typeof computeStats>) => s.publishers],
      ["decades", (s: ReturnType<typeof computeStats>) => s.decades],
      ["ratings", (s: ReturnType<typeof computeStats>) => s.ratings],
    ])("%s buckets sum to the comic count", (_name, pick) => {
      const stats = computeStats(comics);
      const sum = pick(stats).reduce((acc, b) => acc + b.count, 0);
      expect(sum).toBe(stats.totals.comics);
    });

    it("release years plus the undated ones sum to the comic count", () => {
      const stats = computeStats(comics);
      const dated = stats.releaseYears.reduce((acc, p) => acc + p.count, 0);
      expect(dated + stats.totals.undated).toBe(stats.totals.comics);
    });
  });

  it("handles an empty collection without dividing by zero or inventing buckets", () => {
    const stats = computeStats([]);
    expect(stats.totals).toEqual({
      comics: 0,
      series: 0,
      publishers: 0,
      artists: 0,
      rated: 0,
      averageRating: null,
      undated: 0,
    });
    expect(stats.publishers).toEqual([]);
    expect(stats.decades).toEqual([]);
    expect(stats.releaseYears).toEqual([]);
    expect(stats.topSeries).toEqual([]);
    // The rating histogram is a fixed axis, so it keeps its (empty) buckets.
    expect(stats.ratings.every((b) => b.count === 0)).toBe(true);
  });
});
