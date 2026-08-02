/**
 * The geometry behind the full-screen cover viewer: fitting a cover to the
 * viewport, what 1:1 means, zooming about a point, and how far a zoomed cover
 * may be panned.
 *
 * Pure and separate from the component for the same reason `masonry-layout.ts`
 * is: this is arithmetic with edge cases (a landscape scan, an image smaller
 * than the viewport, a drag at the end of its travel), and testing it through a
 * rendered component would test React instead. Both bugs this file exists
 * because of were arithmetic — a viewer that claimed "1:1" while showing a
 * third of the detail, and pan bounds derived from an element whose layout size
 * wasn't its rendered size.
 */

export interface Size {
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

/** A DOM rect, narrowed to what the flight needs. */
export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface FitBox {
  /** Rendered size of the cover at fit-to-screen. */
  width: number;
  height: number;
  /** Rendered size ÷ natural size. Below 1 when the cover is larger than the viewport. */
  scale: number;
}

/** Smallest zoom ceiling, for covers too small for 1:1 to be a meaningful zoom. */
export const MIN_MAX_SCALE = 3;

/**
 * The cover's box at fit-to-screen: as large as it goes without cropping or
 * overflowing the padded viewport.
 *
 * Computed from the stored pixel dimensions rather than measured off the DOM.
 * The rendered element carries a Motion layout projection (the flight from the
 * detail modal), so it lays out at its natural size and is *transformed* to
 * fit — `clientWidth` reports 1400 for a cover drawn 430px wide, which is what
 * made the viewer label fit-to-screen as "1:1".
 */
export function fitBox(natural: Size, viewport: Size, padding: number): FitBox {
  const availableW = Math.max(1, viewport.width - padding);
  const availableH = Math.max(1, viewport.height - padding);
  const scale = Math.min(availableW / natural.width, availableH / natural.height);
  return { width: natural.width * scale, height: natural.height * scale, scale };
}

/**
 * The zoom multiplier at which one image pixel covers one screen pixel.
 *
 * Never below 1: a cover smaller than the viewport is already shown at 1:1 when
 * fitted, and zooming "in" to reach it would mean zooming out.
 */
export function oneToOneScale(fit: FitBox): number {
  return Math.max(1, 1 / fit.scale);
}

/** The zoom ceiling: 1:1, or `MIN_MAX_SCALE` when 1:1 is nearer than that. */
export function maxScaleFor(fit: FitBox): number {
  return Math.max(oneToOneScale(fit), MIN_MAX_SCALE);
}

/** Hold a requested zoom inside [1, ceiling]. */
export function clampScale(requested: number, fit: FitBox): number {
  return Math.min(maxScaleFor(fit), Math.max(1, requested));
}

/**
 * Hold the pan inside the cover's own overhang, so there is always artwork
 * under the cursor. An axis with no overhang (the cover is narrower than the
 * viewport at this zoom) is pinned to centre rather than left free.
 */
export function clampOffset(
  offset: Point,
  fit: FitBox,
  viewport: Size,
  scale: number,
): Point {
  const overflowX = Math.max(0, (fit.width * scale - viewport.width) / 2);
  const overflowY = Math.max(0, (fit.height * scale - viewport.height) / 2);
  return {
    x: Math.min(overflowX, Math.max(-overflowX, offset.x)),
    y: Math.min(overflowY, Math.max(-overflowY, offset.y)),
  };
}

/** Everything the viewer holds about where you are in a cover. */
export interface View {
  scale: number;
  offset: Point;
}

export const FIT_VIEW: View = { scale: 1, offset: { x: 0, y: 0 } };

/**
 * Carry the current zoom onto the next cover.
 *
 * Arrowing through a run of covers at 1:1 is the point of being zoomed —
 * comparing the same detail across issues, or reading the small print down the
 * spine of each. Dropping back to fit on every step makes you redo the zoom for
 * each cover, and the arrows stop being navigation and start being an exit.
 *
 * The scale transfers directly, since it's relative to fit and so means the
 * same thing on any cover; it's re-clamped because a small scan's ceiling is
 * lower than a big upscale's. The pan transfers **proportionally** — as a
 * fraction of how far you could pan, not as pixels — so "bottom-left corner"
 * stays the bottom-left corner on a cover of a different size.
 */
export function carryZoom(view: View, from: FitBox, to: FitBox, viewport: Size): View {
  const scale = clampScale(view.scale, to);
  const overhang = (box: FitBox, at: number) => ({
    x: Math.max(0, (box.width * at - viewport.width) / 2),
    y: Math.max(0, (box.height * at - viewport.height) / 2),
  });
  const was = overhang(from, view.scale);
  const now = overhang(to, scale);
  const fraction = {
    x: was.x > 0 ? view.offset.x / was.x : 0,
    y: was.y > 0 ? view.offset.y / was.y : 0,
  };
  return {
    scale,
    offset: clampOffset({ x: fraction.x * now.x, y: fraction.y * now.y }, to, viewport, scale),
  };
}

/**
 * Pan by a wheel/trackpad delta: the content moves opposite the gesture, the
 * way scrolling a page does — two fingers down pushes the artwork up.
 *
 * A two-finger trackpad scroll and a mouse wheel are the same `wheel` event, so
 * whatever this does, it does for both. Panning is the right default: on a
 * trackpad, scrolling is how you move around anything, and a viewer that zooms
 * instead fights a gesture the whole OS has already assigned. Zoom lives on
 * pinch — which arrives as a wheel event with `ctrlKey` set — and on the
 * controls.
 */
export function panByWheel(
  offset: Point,
  delta: Point,
  fit: FitBox,
  viewport: Size,
  scale: number,
): Point {
  return clampOffset({ x: offset.x - delta.x, y: offset.y - delta.y }, fit, viewport, scale);
}

/**
 * The zoom a pinch of `deltaY` lands on, exponential so the gesture feels the
 * same whether you're at 1× or 3× — a linear step is imperceptible at the
 * bottom of the range and violent at the top.
 */
export function scaleFromPinch(scale: number, deltaY: number, fit: FitBox): number {
  return clampScale(scale * Math.exp(-deltaY / 100), fit);
}

/**
 * How far the pointer may wander between press and release and still count as a
 * tap rather than a drag. Small enough that a deliberate pan is never mistaken
 * for a click, large enough to absorb the shake of a normal click.
 */
export const TAP_SLOP = 5;

/**
 * Whether a press-and-release was a tap on the spot or the end of a drag.
 *
 * A single click toggles zoom, and panning a zoomed cover ends with a click
 * event too — without this, letting go of a pan would zoom back out and throw
 * away the position you had just dragged to.
 */
export function isTap(down: Point, up: Point, slop = TAP_SLOP): boolean {
  return Math.abs(up.x - down.x) <= slop && Math.abs(up.y - down.y) <= slop;
}

/**
 * The transform that lays the fitted cover exactly over `from` — the starting
 * (and, reversed, the ending) point of the flight out of the detail modal.
 *
 * This is a hand-rolled FLIP rather than Motion's `layoutId`, which would be
 * the obvious tool. Layout projection writes a distortion-correcting transform
 * onto the *child* of the animating element through the Web Animations API,
 * and a WAAPI animation outranks an inline style — so the viewer's zoom
 * transform silently did nothing while the projection lived. Owning the
 * arithmetic keeps the two transforms on separate elements and answerable to
 * one another.
 *
 * Expressed as centre-delta + scale because that's what Motion's `x`/`y`/
 * `scale` mean: the element scales about its own centre, so placing the centre
 * and matching the width is the whole job.
 */
export function flightFrom(
  from: Rect,
  fit: FitBox,
  viewport: Size,
): { x: number; y: number; scale: number } {
  return {
    x: from.left + from.width / 2 - viewport.width / 2,
    y: from.top + from.height / 2 - viewport.height / 2,
    scale: fit.width > 0 ? from.width / fit.width : 1,
  };
}

/**
 * The offset that keeps `origin` — a point relative to the viewport's centre —
 * over the same part of the artwork after zooming from `from` to `to`.
 *
 * Zooming about the centre instead makes whatever you were looking at slide
 * away, which on a cover you are usually inspecting a corner of is the wrong
 * behaviour. Returning to fit recentres, because at fit there is nowhere to be
 * but the middle.
 */
export function zoomAbout(
  offset: Point,
  from: number,
  to: number,
  origin: Point,
  fit: FitBox,
  viewport: Size,
): Point {
  if (to <= 1) return { x: 0, y: 0 };
  const ratio = to / from;
  return clampOffset(
    { x: origin.x - (origin.x - offset.x) * ratio, y: origin.y - (origin.y - offset.y) * ratio },
    fit,
    viewport,
    to,
  );
}
