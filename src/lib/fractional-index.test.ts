import { describe, expect, it } from "vitest";
import { POSITION_STEP, positionAfterMax } from "./fractional-index";

describe("fractional-index", () => {
  it("appends after the max", () => {
    expect(positionAfterMax(5)).toBe(6);
    expect(positionAfterMax(null)).toBe(POSITION_STEP);
  });

  it("falls back to the first position for a non-finite max", () => {
    expect(positionAfterMax(undefined)).toBe(POSITION_STEP);
    expect(positionAfterMax(NaN)).toBe(POSITION_STEP);
    expect(positionAfterMax(Infinity)).toBe(POSITION_STEP);
  });
});
