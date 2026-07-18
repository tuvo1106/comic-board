import { describe, expect, it } from "vitest";
import {
  POSITION_STEP,
  needsRenumber,
  positionAfterMax,
  positionBeforeMin,
  positionBetween,
} from "./fractional-index";

describe("fractional-index", () => {
  it("appends after the max", () => {
    expect(positionAfterMax(5)).toBe(6);
    expect(positionAfterMax(null)).toBe(POSITION_STEP);
  });

  it("prepends before the min", () => {
    expect(positionBeforeMin(5)).toBe(4);
    expect(positionBeforeMin(null)).toBe(POSITION_STEP);
  });

  it("takes the midpoint between two neighbours", () => {
    expect(positionBetween(2, 4)).toBe(3);
    expect(positionBetween(1, 2)).toBe(1.5);
  });

  it("handles open ends", () => {
    expect(positionBetween(null, null)).toBe(POSITION_STEP);
    expect(positionBetween(null, 4)).toBe(3); // before min
    expect(positionBetween(2, null)).toBe(3); // after max
  });

  it("keeps a strict ordering across repeated midpoint splits", () => {
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 20; i++) {
      const mid = positionBetween(lo, hi);
      expect(mid).toBeGreaterThan(lo);
      expect(mid).toBeLessThan(hi);
      hi = mid; // keep splitting the lower gap
    }
  });

  it("flags neighbours too close to split further", () => {
    expect(needsRenumber(1, 2)).toBe(false);
    expect(needsRenumber(1, 1 + 1e-12)).toBe(true);
  });
});
