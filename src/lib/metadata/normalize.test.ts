import { describe, expect, it } from "vitest";
import { cleanNames, isCoverRole, isWriterRole, normalizeCoverDate, toYear } from "./normalize";

describe("role classification", () => {
  it("treats writer/script/plot as authors", () => {
    expect(isWriterRole(["writer"])).toBe(true);
    expect(isWriterRole(["Script"])).toBe(true); // Metron's label
    expect(isWriterRole(["Plot"])).toBe(true);
    expect(isWriterRole(["Letterer"])).toBe(false);
    expect(isWriterRole(["artist", "cover"])).toBe(false);
  });

  it("treats cover as cover artist", () => {
    expect(isCoverRole(["cover"])).toBe(true);
    expect(isCoverRole(["artist", "cover"])).toBe(true);
    expect(isCoverRole(["Cover"])).toBe(true);
    expect(isCoverRole(["penciler"])).toBe(false);
  });
});

describe("normalizeCoverDate", () => {
  it("passes through a valid yyyy-mm-dd", () => {
    expect(normalizeCoverDate("1963-03-01")).toBe("1963-03-01");
  });

  it("clamps day/month 00 sentinels to 01", () => {
    expect(normalizeCoverDate("1963-03-00")).toBe("1963-03-01");
    expect(normalizeCoverDate("1963-00-00")).toBe("1963-01-01");
  });

  it("pads partial year-month and year-only dates", () => {
    expect(normalizeCoverDate("2018-06")).toBe("2018-06-01");
    expect(normalizeCoverDate("2018")).toBe("2018-01-01");
  });

  it("rejects garbage and out-of-range values as null", () => {
    expect(normalizeCoverDate(null)).toBeNull();
    expect(normalizeCoverDate(undefined)).toBeNull();
    expect(normalizeCoverDate("")).toBeNull();
    expect(normalizeCoverDate("March 1963")).toBeNull();
    expect(normalizeCoverDate("1963-13-01")).toBeNull();
  });
});

describe("cleanNames", () => {
  it("trims, drops blanks, and de-dupes case-insensitively in order", () => {
    expect(cleanNames(["  Stan Lee ", "stan lee", "", null, "Steve Ditko"])).toEqual([
      "Stan Lee",
      "Steve Ditko",
    ]);
  });
});

describe("toYear", () => {
  it("accepts numbers and 4-digit-prefixed strings", () => {
    expect(toYear(1963)).toBe(1963);
    expect(toYear("1963")).toBe(1963);
    expect(toYear("1999 (v2)")).toBe(1999);
    expect(toYear(null)).toBeNull();
    expect(toYear("n/a")).toBeNull();
  });
});
