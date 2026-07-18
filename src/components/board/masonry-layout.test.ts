import { describe, expect, it } from "vitest";
import { makeComic } from "@/lib/test-fixtures";
import { columnsForWidth, computeMasonry, maxColumnsForWidth } from "./masonry-layout";

describe("columnsForWidth", () => {
  it("maps widths to the responsive breakpoints", () => {
    expect(columnsForWidth(2000)).toBe(6);
    expect(columnsForWidth(1600)).toBe(5);
    expect(columnsForWidth(1300)).toBe(4);
    expect(columnsForWidth(800)).toBe(3);
    expect(columnsForWidth(500)).toBe(2);
    expect(columnsForWidth(320)).toBe(1);
  });
});

describe("maxColumnsForWidth", () => {
  it("never allows cards below the minimum width", () => {
    expect(maxColumnsForWidth(0)).toBe(1);
    // ~150px min card + 16 gap -> a 1360px board fits at most 8
    expect(maxColumnsForWidth(1360)).toBeGreaterThanOrEqual(6);
    expect(maxColumnsForWidth(200)).toBe(1);
  });
});

describe("computeMasonry", () => {
  const comics = Array.from({ length: 8 }, (_, i) => makeComic({ id: `c${i}` }));

  it("gives every card the same (uniform-grid) height", () => {
    const { placements } = computeMasonry(comics, 1360);
    const heights = new Set([...placements.values()].map((p) => p.height));
    expect(heights.size).toBe(1);
  });

  it("assigns fixed columns by flow index (i % columns), so reordering is stable", () => {
    const { placements, columns, columnWidth } = computeMasonry(comics, 1360);
    expect(columns).toBe(4);
    // c0 -> col0, c1 -> col1, ... c4 -> col0 again (second row)
    const c0 = placements.get("c0")!;
    const c1 = placements.get("c1")!;
    const c4 = placements.get("c4")!;
    expect(c0.x).toBe(0);
    expect(c1.x).toBeCloseTo(columnWidth + 16);
    expect(c4.x).toBe(c0.x); // same column as c0
    expect(c4.y).toBeGreaterThan(c0.y); // next row down
  });

  it("respects a pinned column override, clamped to what fits", () => {
    expect(computeMasonry(comics, 1360, 3).columns).toBe(3);
    expect(computeMasonry(comics, 1360, 99).columns).toBe(maxColumnsForWidth(1360));
  });

  it("returns zero height for an empty board", () => {
    expect(computeMasonry([], 1360).height).toBe(0);
  });
});
