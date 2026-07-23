import { describe, expect, it } from "vitest";
import {
  EMPTY_FILTERS,
  applyFilters,
  computeFacets,
  countActive,
  filtersActive,
  filtersFromParams,
  filtersToParams,
  type Filters,
} from "./filters";
import { makeComic } from "./test-fixtures";

const f = (over: Partial<Filters> = {}): Filters => ({ ...EMPTY_FILTERS, ...over });

describe("applyFilters", () => {
  const comics = [
    makeComic({ series: "Batman", publisher: "DC", coverDate: "1963-06-01", tags: ["Facsimile"] }),
    makeComic({ series: "Daredevil", publisher: "Marvel", coverDate: "1982-04-01", artists: ["Frank Miller"], authors: ["Frank Miller"] }),
    makeComic({ series: "Batman", publisher: "DC", coverDate: "2025-11-05", characters: ["Joker"] }),
  ];

  it("returns everything with empty filters", () => {
    expect(applyFilters(comics, f())).toHaveLength(3);
  });

  it("filters by publisher (exact) with AND across facets", () => {
    expect(applyFilters(comics, f({ publishers: ["DC"] }))).toHaveLength(2);
    expect(applyFilters(comics, f({ publishers: ["DC"], characters: ["Joker"] }))).toHaveLength(1);
  });

  it("filters by author/artist via overlap (case-insensitive)", () => {
    expect(applyFilters(comics, f({ authors: ["frank miller"] }))).toHaveLength(1);
    expect(applyFilters(comics, f({ artists: ["Frank Miller"] }))).toHaveLength(1);
  });

  it("multi-select within a facet is OR", () => {
    expect(applyFilters(comics, f({ publishers: ["DC", "Marvel"] }))).toHaveLength(3);
  });

  it("filters by tag", () => {
    expect(applyFilters(comics, f({ tags: ["Facsimile"] }))).toHaveLength(1);
  });

  it("date range is inclusive on both ends and drops undated when a bound is set", () => {
    expect(applyFilters(comics, f({ dateFrom: "1963-06-01", dateTo: "1963-06-01" }))).toHaveLength(1);
    expect(applyFilters(comics, f({ dateFrom: "1970-01-01" }))).toHaveLength(2);
    const withUndated = [...comics, makeComic({ coverDate: null })];
    expect(applyFilters(withUndated, f({ dateTo: "2030-01-01" }))).toHaveLength(3);
  });

  it("free-text search spans series, publisher, authors, artists, characters", () => {
    expect(applyFilters(comics, f({ q: "miller" }))).toHaveLength(1);
    expect(applyFilters(comics, f({ q: "joker" }))).toHaveLength(1);
    expect(applyFilters(comics, f({ q: "marvel" }))).toHaveLength(1);
  });
});

describe("computeFacets", () => {
  it("tallies counts scoped to the given comics and sorts values", () => {
    const comics = [
      makeComic({ publisher: "Marvel", tags: ["Variant"] }),
      makeComic({ publisher: "DC", tags: ["Variant", "Facsimile"] }),
      makeComic({ publisher: "DC" }),
    ];
    const facets = computeFacets(comics);
    expect(facets.publishers).toEqual([
      { value: "DC", count: 2 },
      { value: "Marvel", count: 1 },
    ]);
    expect(facets.tags).toEqual([
      { value: "Facsimile", count: 1 },
      { value: "Variant", count: 2 },
    ]);
  });

  it("ignores empty publisher values", () => {
    const facets = computeFacets([makeComic({ publisher: null }), makeComic({ publisher: "" })]);
    expect(facets.publishers).toEqual([]);
  });

  it("scopes other facets to the active filters but leaves each facet self-unfiltered", () => {
    const comics = [
      makeComic({ publisher: "DC", authors: ["Alice"] }),
      makeComic({ publisher: "DC", authors: ["Bob"] }),
      makeComic({ publisher: "Marvel", authors: ["Alice"] }),
      makeComic({ publisher: "Marvel", authors: ["Carol"] }),
    ];
    const facets = computeFacets(comics, f({ publishers: ["DC"] }));
    // Author counts reflect only DC comics.
    expect(facets.authors).toEqual([
      { value: "Alice", count: 1 },
      { value: "Bob", count: 1 },
    ]);
    // Publisher list ignores its own selection, so Marvel is still offered.
    expect(facets.publishers).toEqual([
      { value: "DC", count: 2 },
      { value: "Marvel", count: 2 },
    ]);
  });

  it("without filters, counts span the whole set (backward compatible)", () => {
    const comics = [
      makeComic({ publisher: "DC", authors: ["Alice"] }),
      makeComic({ publisher: "Marvel", authors: ["Alice"] }),
    ];
    expect(computeFacets(comics)).toEqual(computeFacets(comics, f()));
  });
});

describe("filters URL round-trip", () => {
  it("serializes and parses back to the same filters", () => {
    const original = f({
      q: "spider",
      publishers: ["Marvel"],
      authors: ["Stan Lee", "Steve Ditko"],
      tags: ["Key Issue"],
      dateFrom: "1963-01-01",
      dateTo: "1970-12-31",
    });
    const params = filtersToParams(original);
    expect(filtersFromParams(params)).toEqual(original);
  });

  it("round-trips values containing the old delimiter and other hostile chars", () => {
    // Regression: a raw "~" join delimiter split these values apart on read.
    const original = f({
      series: ["Weird~Series", "A & B"],
      authors: ["Doe, Jane", "Tilde~Author"],
      tags: ["50% off", "a=b"],
      q: "cross~man",
    });
    const params = filtersToParams(original);
    expect(filtersFromParams(params)).toEqual(original);
  });

  it("filtersActive / countActive reflect set facets", () => {
    expect(filtersActive(f())).toBe(false);
    expect(countActive(f({ publishers: ["DC"], tags: ["Variant"], dateFrom: "2020-01-01" }))).toBe(3);
  });
});
