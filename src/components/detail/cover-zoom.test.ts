import { describe, expect, it } from "vitest";
import {
  MIN_MAX_SCALE,
  carryZoom,
  clampOffset,
  clampScale,
  fitBox,
  flightFrom,
  isTap,
  maxScaleFor,
  oneToOneScale,
  panByWheel,
  scaleFromPinch,
  zoomAbout,
} from "./cover-zoom";

const viewport = { width: 1000, height: 800 };
/** A typical portrait cover, taller than the viewport. */
const cover = { width: 1400, height: 2164 };

describe("fitBox", () => {
  it("fits a portrait cover to the viewport's height, not its width", () => {
    const fit = fitBox(cover, viewport, 0);
    expect(fit.height).toBeCloseTo(800);
    expect(fit.width).toBeCloseTo((1400 / 2164) * 800);
    // The whole cover is visible: neither axis overflows.
    expect(fit.width).toBeLessThanOrEqual(viewport.width);
  });

  it("fits a landscape scan to the width instead", () => {
    const fit = fitBox({ width: 3000, height: 1000 }, viewport, 0);
    expect(fit.width).toBeCloseTo(1000);
    expect(fit.height).toBeCloseTo(333.33, 1);
  });

  it("takes the padding out of the available space on both edges", () => {
    const fit = fitBox(cover, viewport, 64);
    expect(fit.height).toBeCloseTo(800 - 64);
  });

  it("enlarges a cover smaller than the viewport rather than leaving it tiny", () => {
    const fit = fitBox({ width: 100, height: 150 }, viewport, 0);
    expect(fit.scale).toBeGreaterThan(1);
    expect(fit.height).toBeCloseTo(800);
  });

  it("survives a viewport smaller than its own padding", () => {
    // Nothing should divide by zero or go negative while a window is dragged shut.
    const fit = fitBox(cover, { width: 40, height: 30 }, 64);
    expect(fit.width).toBeGreaterThan(0);
    expect(fit.height).toBeGreaterThan(0);
  });
});

describe("oneToOneScale", () => {
  it("is the factor that undoes the fit, so 1:1 shows every stored pixel", () => {
    const fit = fitBox(cover, viewport, 0);
    // This is the assertion the shipped bug failed: fit reported as 1:1.
    expect(oneToOneScale(fit)).toBeCloseTo(1 / fit.scale);
    expect(fit.width * oneToOneScale(fit)).toBeCloseTo(cover.width);
  });

  it("is 1 for a cover that fit had to enlarge — there is no detail to zoom to", () => {
    expect(oneToOneScale(fitBox({ width: 100, height: 150 }, viewport, 0))).toBe(1);
  });
});

describe("maxScaleFor / clampScale", () => {
  it("lets a big upscale zoom all the way to 1:1", () => {
    const fit = fitBox({ width: 4000, height: 6000 }, viewport, 0);
    expect(oneToOneScale(fit)).toBeGreaterThan(MIN_MAX_SCALE);
    expect(maxScaleFor(fit)).toBeCloseTo(oneToOneScale(fit));
  });

  it("keeps the floor when 1:1 is nearer than it — you can zoom past 1:1", () => {
    // This cover's 1:1 is 2.7×, so the ceiling is the floor instead. Going past
    // 1:1 shows interpolated pixels, which is the point of a magnifier.
    const fit = fitBox(cover, viewport, 0);
    expect(oneToOneScale(fit)).toBeLessThan(MIN_MAX_SCALE);
    expect(maxScaleFor(fit)).toBe(MIN_MAX_SCALE);
  });

  it("still offers a floor of zoom for a small image whose 1:1 is the fit", () => {
    expect(maxScaleFor(fitBox({ width: 100, height: 150 }, viewport, 0))).toBe(MIN_MAX_SCALE);
  });

  it("clamps requests to [1, ceiling] rather than rejecting them", () => {
    const fit = fitBox(cover, viewport, 0);
    expect(clampScale(0.2, fit)).toBe(1);
    expect(clampScale(500, fit)).toBe(maxScaleFor(fit));
    expect(clampScale(2, fit)).toBe(2);
  });
});

describe("clampOffset", () => {
  const fit = fitBox(cover, viewport, 0);

  it("pins to centre at fit — there is no overhang to pan into", () => {
    expect(clampOffset({ x: 400, y: 400 }, fit, viewport, 1)).toEqual({ x: 0, y: 0 });
  });

  it("allows exactly the overhang and no more", () => {
    const scale = 2;
    const overflowY = (fit.height * scale - viewport.height) / 2;
    expect(clampOffset({ x: 0, y: 1e6 }, fit, viewport, scale).y).toBeCloseTo(overflowY);
    expect(clampOffset({ x: 0, y: -1e6 }, fit, viewport, scale).y).toBeCloseTo(-overflowY);
  });

  it("keeps artwork under the cursor: the edge never crosses the viewport edge", () => {
    const scale = 2.5;
    const { x } = clampOffset({ x: 1e6, y: 0 }, fit, viewport, scale);
    const halfCover = (fit.width * scale) / 2;
    // Left edge of the cover, having been dragged as far right as allowed.
    expect(x - halfCover).toBeLessThanOrEqual(-viewport.width / 2 + 0.001);
  });

  it("pins the narrow axis while the tall one still pans", () => {
    // At 1.5×, this cover is taller than the viewport but not wider.
    const scale = 1.5;
    const out = clampOffset({ x: 300, y: 300 }, fit, viewport, scale);
    expect(out.x).toBe(0);
    expect(out.y).toBeGreaterThan(0);
  });
});

describe("carryZoom", () => {
  const fit = fitBox(cover, viewport, 0);
  const other = fitBox({ width: 600, height: 923 }, viewport, 0);

  it("keeps the zoom when stepping to the next cover", () => {
    // The whole point: arrowing through a run at 1:1 shouldn't drop to fit.
    const carried = carryZoom({ scale: 2, offset: { x: 0, y: 0 } }, fit, fit, viewport);
    expect(carried.scale).toBe(2);
  });

  it("is a no-op between covers of the same size", () => {
    // Both within this cover's travel at 2x — it only has ~17px sideways.
    const view = { scale: 2, offset: { x: 10, y: 60 } };
    const carried = carryZoom(view, fit, fit, viewport);
    expect(carried.scale).toBe(2);
    expect(carried.offset.x).toBeCloseTo(10);
    expect(carried.offset.y).toBeCloseTo(60);
  });

  it("lowers a zoom the next cover can't reach", () => {
    // A 4000px upscale goes to 6.7x; a 600px scan's ceiling is 3.
    const big = fitBox({ width: 4000, height: 6000 }, viewport, 0);
    const carried = carryZoom({ scale: maxScaleFor(big), offset: { x: 0, y: 0 } }, big, other, viewport);
    expect(carried.scale).toBe(maxScaleFor(other));
  });

  it("carries the pan proportionally, so a corner stays that corner", () => {
    const scale = 2;
    const edgeY = (fit.height * scale - viewport.height) / 2;
    const carried = carryZoom({ scale, offset: { x: 0, y: edgeY } }, fit, other, viewport);
    // Was pinned to the bottom of one cover; still pinned to the bottom of the
    // next, at that cover's own travel rather than the old pixel value.
    const nextEdgeY = (other.height * carried.scale - viewport.height) / 2;
    expect(carried.offset.y).toBeCloseTo(nextEdgeY);
  });

  it("centres when the previous cover had no travel to speak of", () => {
    const carried = carryZoom({ scale: 1, offset: { x: 0, y: 0 } }, fit, other, viewport);
    expect(carried.offset.x).toBeCloseTo(0);
    expect(carried.offset.y).toBeCloseTo(0);
  });

  it("never lands outside the next cover's bounds", () => {
    const view = { scale: 3, offset: { x: 1e4, y: 1e4 } };
    const carried = carryZoom(view, fit, other, viewport);
    expect(carried.offset).toEqual(
      clampOffset(carried.offset, other, viewport, carried.scale),
    );
  });
});

describe("panByWheel", () => {
  const fit = fitBox(cover, viewport, 0);

  it("moves the artwork opposite the gesture, like scrolling a page", () => {
    // Two fingers down (positive deltaY) pushes the cover up.
    const out = panByWheel({ x: 0, y: 0 }, { x: 0, y: 40 }, fit, viewport, 2);
    expect(out.y).toBe(-40);
  });

  it("pans both axes, so a sideways trackpad swipe works", () => {
    const out = panByWheel({ x: 0, y: 0 }, { x: 30, y: 10 }, fit, viewport, 2.5);
    expect(out.x).toBe(-30);
    expect(out.y).toBe(-10);
  });

  it("stops at the same bounds a drag does", () => {
    const out = panByWheel({ x: 0, y: 0 }, { x: 0, y: -1e6 }, fit, viewport, 2);
    expect(out).toEqual(clampOffset(out, fit, viewport, 2));
  });

  it("goes nowhere at fit, where there's nothing to pan", () => {
    // `toBeCloseTo` per axis rather than `toEqual`: clamping to a zero bound
    // yields -0, which is the same position and a different value.
    const out = panByWheel({ x: 0, y: 0 }, { x: 50, y: 50 }, fit, viewport, 1);
    expect(out.x).toBeCloseTo(0);
    expect(out.y).toBeCloseTo(0);
  });
});

describe("scaleFromPinch", () => {
  const fit = fitBox({ width: 4000, height: 6000 }, viewport, 0);

  it("opens out on a spread and closes on a pinch", () => {
    expect(scaleFromPinch(2, -10, fit)).toBeGreaterThan(2);
    expect(scaleFromPinch(2, 10, fit)).toBeLessThan(2);
  });

  it("is proportional, so the gesture feels the same at 1x and 3x", () => {
    // Equal deltas multiply by an equal factor rather than adding a fixed step.
    expect(scaleFromPinch(2, -10, fit) / 2).toBeCloseTo(scaleFromPinch(3, -10, fit) / 3);
  });

  it("stays inside the zoom range however hard you pinch", () => {
    expect(scaleFromPinch(2, -1e4, fit)).toBe(maxScaleFor(fit));
    expect(scaleFromPinch(2, 1e4, fit)).toBe(1);
  });
});

describe("isTap", () => {
  it("counts a click that didn't move", () => {
    expect(isTap({ x: 100, y: 100 }, { x: 100, y: 100 })).toBe(true);
  });

  it("tolerates the shake of a real click", () => {
    expect(isTap({ x: 100, y: 100 }, { x: 103, y: 98 })).toBe(true);
  });

  it("rejects the end of a pan, so letting go doesn't zoom back out", () => {
    expect(isTap({ x: 100, y: 100 }, { x: 240, y: 100 })).toBe(false);
    expect(isTap({ x: 100, y: 100 }, { x: 100, y: 240 })).toBe(false);
  });

  it("measures each axis, not the diagonal", () => {
    // 5px on both axes is still a click; the slop is a box, not a circle.
    expect(isTap({ x: 0, y: 0 }, { x: 5, y: 5 })).toBe(true);
    expect(isTap({ x: 0, y: 0 }, { x: 6, y: 0 })).toBe(false);
  });
});

describe("flightFrom", () => {
  const fit = fitBox(cover, viewport, 0);

  it("lands the fitted cover exactly on the modal's cover", () => {
    // The modal's cover: 200px wide, left half of the screen.
    const from = { left: 100, top: 200, width: 200, height: 309 };
    const flight = flightFrom(from, fit, viewport);

    // Motion applies these about the element's own centre, so reconstruct where
    // the fitted box ends up and check it covers `from`.
    const centreX = viewport.width / 2 + flight.x;
    const centreY = viewport.height / 2 + flight.y;
    expect(centreX).toBeCloseTo(from.left + from.width / 2);
    expect(centreY).toBeCloseTo(from.top + from.height / 2);
    expect(fit.width * flight.scale).toBeCloseTo(from.width);
  });

  it("is the identity when the cover is already where it's going", () => {
    const from = {
      left: (viewport.width - fit.width) / 2,
      top: (viewport.height - fit.height) / 2,
      width: fit.width,
      height: fit.height,
    };
    const flight = flightFrom(from, fit, viewport);
    expect(flight.x).toBeCloseTo(0);
    expect(flight.y).toBeCloseTo(0);
    expect(flight.scale).toBeCloseTo(1);
  });

  it("doesn't divide by zero before the cover has a box", () => {
    const flight = flightFrom({ left: 0, top: 0, width: 0, height: 0 }, { width: 0, height: 0, scale: 0 }, viewport);
    expect(flight.scale).toBe(1);
  });
});

describe("zoomAbout", () => {
  const fit = fitBox(cover, viewport, 0);

  it("keeps the zoomed-at point over the same artwork", () => {
    const origin = { x: 100, y: 50 };
    const to = 3;
    const offset = zoomAbout({ x: 0, y: 0 }, 1, to, origin, fit, viewport);
    // The artwork under `origin` before the zoom is still under it after:
    // (origin - offset) / scale is the artwork coordinate, and it's unchanged.
    expect((origin.x - offset.x) / to).toBeCloseTo(origin.x);
    expect((origin.y - offset.y) / to).toBeCloseTo(origin.y);
  });

  it("gives up the anchor rather than the pan bounds when the two disagree", () => {
    // Holding a far-off point still would need to pan past the cover's edge.
    // Showing empty space beside a cover is worse than the point drifting, so
    // the clamp wins — and this is why the anchor test above stays inside them.
    const to = 2;
    const offset = zoomAbout({ x: 0, y: 0 }, 1, to, { x: 480, y: 0 }, fit, viewport);
    expect(offset).toEqual(clampOffset(offset, fit, viewport, to));
    expect((480 - offset.x) / to).not.toBeCloseTo(480);
  });

  it("recentres when zooming back out to fit", () => {
    expect(zoomAbout({ x: 120, y: 90 }, 3, 1, { x: 200, y: 0 }, fit, viewport)).toEqual({
      x: 0,
      y: 0,
    });
  });

  it("zooms about the centre when no origin is given by the caller", () => {
    const offset = zoomAbout({ x: 0, y: 0 }, 1, 2, { x: 0, y: 0 }, fit, viewport);
    expect(offset).toEqual({ x: 0, y: 0 });
  });

  it("never lands outside the pan bounds, however far off-centre the origin", () => {
    const offset = zoomAbout({ x: 0, y: 0 }, 1, 3, { x: 5000, y: 5000 }, fit, viewport);
    expect(offset).toEqual(clampOffset(offset, fit, viewport, 3));
  });

  it("composes: two wheel notches about one point equal one big zoom to it", () => {
    // Within the pan bounds, stepping there and jumping there must agree —
    // otherwise repeated wheel notches would drift off the thing you're on.
    const origin = { x: 50, y: 40 };
    const once = zoomAbout({ x: 0, y: 0 }, 1, 3, origin, fit, viewport);
    const step = zoomAbout({ x: 0, y: 0 }, 1, 2.5, origin, fit, viewport);
    const twice = zoomAbout(step, 2.5, 3, origin, fit, viewport);
    expect(twice.x).toBeCloseTo(once.x);
    expect(twice.y).toBeCloseTo(once.y);
  });
});
