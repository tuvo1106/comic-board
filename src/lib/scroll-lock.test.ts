import { beforeEach, describe, expect, it } from "vitest";
import { lockScroll, unlockScroll } from "./scroll-lock";

// The helper only reads/writes document.body.style.overflow at call time, so a
// minimal fake stands in for a DOM (the suite runs in node, no jsdom).
const style = { overflow: "" };
beforeEach(() => {
  style.overflow = "scroll"; // a pre-existing value we must restore, not clobber
  (globalThis as unknown as { document: unknown }).document = { body: { style } };
});

describe("scroll-lock", () => {
  it("locks on first hold and restores the prior value on last release", () => {
    lockScroll();
    expect(style.overflow).toBe("hidden");
    unlockScroll();
    expect(style.overflow).toBe("scroll");
  });

  it("stays locked while any holder remains (nested overlays)", () => {
    lockScroll(); // e.g. the detail modal
    lockScroll(); // e.g. a dialog opened above it
    expect(style.overflow).toBe("hidden");

    unlockScroll(); // inner dialog closes — must NOT prematurely restore scroll
    expect(style.overflow).toBe("hidden");

    unlockScroll(); // modal closes — now scroll is restored
    expect(style.overflow).toBe("scroll");
  });

  it("ignores an unlock with no active holders", () => {
    unlockScroll();
    expect(style.overflow).toBe("scroll");
  });
});
