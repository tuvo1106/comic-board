import { describe, expect, it } from "vitest";
import { nameKey, newId } from "./ids";

describe("nameKey", () => {
  it("lowercases, trims, and collapses whitespace for dedupe", () => {
    expect(nameKey("Venom")).toBe("venom");
    expect(nameKey("  VENOM  ")).toBe("venom");
    expect(nameKey("Steve   Ditko")).toBe("steve ditko");
    expect(nameKey("steve ditko")).toBe(nameKey("Steve Ditko"));
  });
});

describe("newId", () => {
  it("produces 14-char url-safe ids that are unique", () => {
    const a = newId();
    const b = newId();
    expect(a).toHaveLength(14);
    expect(a).toMatch(/^[0-9a-z]{14}$/);
    expect(a).not.toBe(b);
  });
});
