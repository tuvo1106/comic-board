import { describe, expect, it } from "vitest";
import { parseSearchQuery } from "./query";

describe("parseSearchQuery", () => {
  it("splits a trailing number into the issue", () => {
    expect(parseSearchQuery("black cat 4")).toEqual({ series: "black cat", issue: "4" });
    expect(parseSearchQuery("The Amazing Spider-Man 300")).toEqual({
      series: "The Amazing Spider-Man",
      issue: "300",
    });
  });

  it("accepts a # prefix and decimal issue numbers", () => {
    expect(parseSearchQuery("x-men #12")).toEqual({ series: "x-men", issue: "12" });
    expect(parseSearchQuery("asm 1.1")).toEqual({ series: "asm", issue: "1.1" });
  });

  it("collapses whitespace and trims", () => {
    expect(parseSearchQuery("  black   cat   4  ")).toEqual({ series: "black cat", issue: "4" });
  });

  it("treats a bare series (no trailing number) as series-only", () => {
    expect(parseSearchQuery("Fantastic Four")).toEqual({ series: "Fantastic Four" });
    expect(parseSearchQuery("Daredevil")).toEqual({ series: "Daredevil" });
  });

  it("still splits titles that end in a number (route retries as a fallback)", () => {
    // 'Spider-Man 2099' parses as issue 2099; the search route falls back to the
    // full string when that yields nothing.
    expect(parseSearchQuery("Spider-Man 2099")).toEqual({ series: "Spider-Man", issue: "2099" });
  });

  it("handles empty input", () => {
    expect(parseSearchQuery("   ")).toEqual({ series: "" });
  });
});
