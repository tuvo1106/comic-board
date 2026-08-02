import { FIT_VIEW, type FitBox, type Rect, type View } from "./cover-zoom";

/**
 * The full-screen viewer's state, held outside React because the component
 * holding it does not survive the thing it has to survive.
 *
 * Arrowing to the next cover is a route change (`/comic/<id>`), and Next
 * remounts the route segment for a different param — so `ComicDetail` is torn
 * down and rebuilt on every step. Any `useState` in it is gone: the viewer
 * closed itself mid-navigation, which is what "left/right goes to the next
 * comic but drops the zoom" actually was. Nothing called `onClose`; the state
 * simply ceased to exist.
 *
 * Same shape of problem, same shape of answer as `lib/nav-order.ts`, which
 * keeps the prev/next order alive across these navigations for exactly this
 * reason. Module state outlives the tree.
 *
 * `fit` is stored alongside the view so the next mount knows what box the
 * saved pan was measured against, and can carry it proportionally onto a cover
 * of a different size (`carryZoom`).
 *
 * Cleared when the viewer closes, when the modal itself closes, and on
 * `popstate` — the store outliving the tree is the point, so every way out of
 * the viewer has to say so explicitly.
 */
export const coverView = {
  open: false,
  view: FIT_VIEW as View,
  /** The fit box the stored `view` was measured in. */
  fit: null as FitBox | null,
  /**
   * Where the cover sat in the modal when the viewer opened, for the flight.
   * Cleared once consumed: the flight belongs to opening, not to stepping
   * between covers — replaying it on each arrow would fly from a stale box.
   */
  originRect: null as Rect | null,

  openFrom(rect: Rect | null) {
    this.open = true;
    this.view = FIT_VIEW;
    this.fit = null;
    this.originRect = rect;
  },

  /**
   * The one place that means "really done", as opposed to the unmount that
   * happens on every step between covers. Leaving the page in browser
   * full-screen would strand the board with no visible chrome, so that unwinds
   * here rather than in a component teardown that fires far too often.
   */
  close() {
    this.open = false;
    this.view = FIT_VIEW;
    this.fit = null;
    this.originRect = null;
    if (typeof document !== "undefined" && document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
  },
};
