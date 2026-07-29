import { describe, expect, it } from "vitest";
import { shouldOpenUp } from "./TagInput";

describe("shouldOpenUp", () => {
  const H = 232;

  it("opens upward for a bottom field (no room below, lots above)", () => {
    expect(shouldOpenUp(447, 27, H)).toBe(true); // the real Tags-field case
  });

  it("opens downward when the dropdown fits below", () => {
    expect(shouldOpenUp(100, 400, H)).toBe(false); // plenty below
    expect(shouldOpenUp(300, 232, H)).toBe(false); // exactly fits below
  });

  it("when cramped both ways, picks the side with more room", () => {
    expect(shouldOpenUp(60, 40, H)).toBe(true); // more above
    expect(shouldOpenUp(40, 60, H)).toBe(false); // more below
  });
});
