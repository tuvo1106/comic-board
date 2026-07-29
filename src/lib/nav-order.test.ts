import { describe, expect, it } from "vitest";
import { navOrder } from "./nav-order";

describe("navOrder", () => {
  it("get returns whatever was last set", () => {
    navOrder.set(["a", "b", "c"]);
    expect(navOrder.get()).toEqual(["a", "b", "c"]);
  });

  it("a middle id has both a prev and a next", () => {
    navOrder.set(["a", "b", "c"]);
    expect(navOrder.neighbors("b")).toEqual({ prev: "a", next: "c" });
  });

  it("the first id has no prev", () => {
    navOrder.set(["a", "b", "c"]);
    expect(navOrder.neighbors("a")).toEqual({ prev: null, next: "b" });
  });

  it("the last id has no next", () => {
    navOrder.set(["a", "b", "c"]);
    expect(navOrder.neighbors("c")).toEqual({ prev: "b", next: null });
  });

  it("an id not in the order has neither (cold deep-link fallback)", () => {
    navOrder.set(["a", "b", "c"]);
    expect(navOrder.neighbors("z")).toEqual({ prev: null, next: null });
  });

  it("an empty order (nothing set yet) has neither, for any id", () => {
    navOrder.set([]);
    expect(navOrder.neighbors("a")).toEqual({ prev: null, next: null });
  });

  it("a single-item order has neither", () => {
    navOrder.set(["only"]);
    expect(navOrder.neighbors("only")).toEqual({ prev: null, next: null });
  });
});
