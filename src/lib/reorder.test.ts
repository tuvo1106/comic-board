import { describe, expect, it } from "vitest";
import { swapReorder } from "./reorder";

/** Minimal card: swapReorder only cares about id + position. */
function board(...ids: string[]) {
  return ids.map((id, i) => ({ id, position: i + 1 }));
}

describe("swapReorder", () => {
  it("trades the two cards' exact positions and leaves everyone else put", () => {
    const items = board("a", "b", "c", "d"); // positions 1,2,3,4
    const r = swapReorder(items, "a", "d")!;

    // a takes d's position (4), d takes a's (1); b and c are untouched.
    expect(r.updates).toEqual([
      { id: "a", position: 4 },
      { id: "d", position: 1 },
    ]);
    expect(r.orderedIds).toEqual(["d", "b", "c", "a"]);
    expect(items.map((c) => c.id)).toEqual(["a", "b", "c", "d"]); // input not mutated
  });

  it("does NOT shift the cards between them (swap, not insert)", () => {
    // Insert semantics would give ["b","c","d","a"] (a pulled out, everyone
    // shifts left). Swap only exchanges the endpoints.
    const r = swapReorder(board("a", "b", "c", "d"), "a", "d")!;
    expect(r.orderedIds).toEqual(["d", "b", "c", "a"]);
  });

  it("is symmetric — dragging a→b and b→a give the same result", () => {
    const ab = swapReorder(board("a", "b", "c"), "a", "b")!;
    const ba = swapReorder(board("a", "b", "c"), "b", "a")!;
    expect(ab.orderedIds).toEqual(ba.orderedIds);
    expect(new Set(ab.updates)).toEqual(new Set(ba.updates));
  });

  it("preserves non-position fields on the swapped cards", () => {
    const items = [
      { id: "a", position: 1, series: "Batman" },
      { id: "b", position: 2, series: "Spawn" },
    ];
    const r = swapReorder(items, "a", "b")!;
    const a = r.items.find((c) => c.id === "a")!;
    expect(a).toEqual({ id: "a", position: 2, series: "Batman" });
  });

  it("works with fractional positions without introducing new midpoints", () => {
    const items = [
      { id: "a", position: 0.25 },
      { id: "b", position: 0.5 },
      { id: "c", position: 0.75 },
    ];
    const r = swapReorder(items, "a", "c")!;
    expect(r.updates).toEqual([
      { id: "a", position: 0.75 },
      { id: "c", position: 0.25 },
    ]);
    // Only the two endpoints' existing values are reused — no averaging.
    expect(r.orderedIds).toEqual(["c", "b", "a"]);
  });

  it("returns null for a no-op drop (same card)", () => {
    expect(swapReorder(board("a", "b"), "a", "a")).toBeNull();
  });

  it("returns null when either id is missing", () => {
    expect(swapReorder(board("a", "b"), "a", "zzz")).toBeNull();
    expect(swapReorder(board("a", "b"), "zzz", "b")).toBeNull();
  });
});
