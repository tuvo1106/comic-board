import { describe, expect, it } from "vitest";
import { mapMetronIssue, mapMetronIssueDetail } from "./metron";

// Fixtures trimmed from real Metron responses (issue 7406 — The Amazing
// Spider-Man #1, 1963). See PROVIDERS.md.

describe("mapMetronIssue", () => {
  it("maps an issue-grain search hit to a candidate, preferring the release date", () => {
    const c = mapMetronIssue({
      id: 7406,
      series: { name: "The Amazing Spider-Man", year_began: 1963 },
      number: "1",
      cover_date: "1963-03-01",
      store_date: "1963-01-08",
      image: "https://static.metron.cloud/asm-v1-1.jpg",
    });
    expect(c).toMatchObject({
      provider: "metron",
      ref: "7406",
      series: "The Amazing Spider-Man",
      issueNumber: "1",
      coverDate: "1963-01-08", // store_date preferred over cover_date
      publisher: null, // not in search results; filled at detail
      coverThumbUrl: "https://static.metron.cloud/asm-v1-1.jpg",
      year: 1963,
    });
  });

  it("falls back to cover_date when there is no store date", () => {
    const c = mapMetronIssue({
      id: 1,
      series: { name: "X", year_began: 1963 },
      number: "1",
      cover_date: "1963-03-01",
      store_date: null,
    });
    expect(c.coverDate).toBe("1963-03-01");
  });
});

describe("mapMetronIssueDetail", () => {
  const issue = {
    series: { name: "The Amazing Spider-Man", year_began: 1963 },
    number: "1",
    publisher: { name: "Marvel" },
    cover_date: "1963-03-01",
    store_date: "1963-01-08",
    credits: [
      { creator: "Jack Kirby", role: [{ name: "Cover" }] },
      { creator: "John Duffy", role: [{ name: "Letterer" }] },
      { creator: "Stan Lee", role: [{ name: "Script" }, { name: "Editor" }] },
      { creator: "Steve Ditko", role: [{ name: "Artist" }, { name: "Cover" }] },
    ],
    image: "https://static.metron.cloud/media/issue/2019/11/14/asm-v1-1.jpg",
    variants: [
      { name: "Second Printing Variant Cover", image: "https://static.metron.cloud/media/variants/asm-1a.jpg" },
      { name: null, image: "https://static.metron.cloud/media/variants/asm-1b.jpg" },
    ],
  };

  it("maps writers (via Script), all cover artists, and the release date", () => {
    const d = mapMetronIssueDetail(issue);
    expect(d.authors).toEqual(["Stan Lee"]); // "Script" counts as writer
    expect(d.artists).toEqual(["Jack Kirby", "Steve Ditko"]); // all cover contributors
    expect(d).toMatchObject({
      series: "The Amazing Spider-Man",
      issueNumber: "1",
      publisher: "Marvel",
      coverDate: "1963-01-08", // store_date, not cover_date
    });
    expect(d).not.toHaveProperty("characters"); // characters are not autofilled
  });

  it("lists the primary cover first, then labeled variants", () => {
    const d = mapMetronIssueDetail(issue);
    expect(d.covers).toEqual([
      { url: "https://static.metron.cloud/media/issue/2019/11/14/asm-v1-1.jpg", label: "Main cover" },
      { url: "https://static.metron.cloud/media/variants/asm-1a.jpg", label: "Second Printing Variant Cover" },
      { url: "https://static.metron.cloud/media/variants/asm-1b.jpg", label: "Variant 2" },
    ]);
  });
});
