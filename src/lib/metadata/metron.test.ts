import { afterEach, describe, expect, it, vi } from "vitest";
import { mapMetronIssue, mapMetronIssueDetail, metronProvider } from "./metron";

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

  it("maps writers (via Script) and the release date", () => {
    const d = mapMetronIssueDetail(issue);
    expect(d.authors).toEqual(["Stan Lee"]); // "Script" counts as writer
    expect(d.artists).toEqual([]); // not autofilled — Metron can't attribute a cover credit to a specific variant
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

describe("metronProvider (fetch wiring)", () => {
  afterEach(() => vi.unstubAllGlobals());

  const lite = {
    id: 7406,
    series: { name: "Batman", year_began: 1940 },
    number: "1",
    store_date: "1940-04-01",
    cover_date: "1940-05-01",
    image: "https://static.metron.cloud/b.jpg",
  };
  const fullDetail = {
    series: { name: "Batman", year_began: 1940 },
    number: "1",
    publisher: { name: "DC" },
    store_date: "1940-04-01",
    cover_date: "1940-05-01",
    credits: [{ creator: "Bob Kane", role: [{ name: "Cover" }] }],
    image: "https://static.metron.cloud/b.jpg",
    variants: [],
  };

  function jsonRes(body: unknown, headers?: Record<string, string>) {
    return new Response(JSON.stringify(body), { headers });
  }

  it("search() hits the issue endpoint with auth + query and maps the results", async () => {
    const fetchMock = vi.fn(async (_url: string | URL, _init?: RequestInit) =>
      jsonRes({ results: [lite] }, { "x-ratelimit-burst-remaining": "10" }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const candidates = await metronProvider("tok").search({ series: "Batman", issue: "1" });
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({ provider: "metron", ref: "7406", coverDate: "1940-04-01" });

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/issue/");
    expect(String(url)).toContain("series_name=Batman");
    expect(String(url)).toContain("number=1");
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer tok");
  });

  it("search() sorts candidates by newest series year first", async () => {
    const mk = (id: number, year: number) => ({ ...lite, id, series: { name: "Batman", year_began: year } });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonRes({ results: [mk(1, 1940), mk(2, 2016), mk(3, 2011)] })),
    );
    const candidates = await metronProvider("tok").search({ series: "Batman", issue: "2" });
    expect(candidates.map((c) => c.year)).toEqual([2016, 2011, 1940]);
  });

  it("search() warns when the burst budget runs low", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonRes({ results: [] }, { "x-ratelimit-burst-remaining": "2" })),
    );
    await metronProvider("tok").search({ series: "x" });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("budget low"));
    warn.mockRestore();
  });

  it("detail() fetches the issue by ref and maps it", async () => {
    const fetchMock = vi.fn(async (_url: string | URL, _init?: RequestInit) => jsonRes(fullDetail));
    vi.stubGlobal("fetch", fetchMock);

    const d = await metronProvider("tok").detail("326");
    expect(d).toMatchObject({ series: "Batman", publisher: "DC", coverDate: "1940-04-01" });
    expect(d.artists).toEqual([]);
    expect(d.covers[0]).toMatchObject({ label: "Main cover" });
    expect(String(fetchMock.mock.calls[0][0])).toContain("/issue/326/");
  });
});
