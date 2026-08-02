"use client";

import { motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ComicDTO } from "@/lib/types";
import { CoverBackdrop } from "./CoverBackdrop";
import { coverView } from "./cover-view-store";
import {
  carryZoom,
  clampOffset,
  clampScale,
  fitBox,
  FIT_VIEW,
  flightFrom,
  isTap,
  maxScaleFor,
  oneToOneScale,
  panByWheel,
  scaleFromPinch,
  zoomAbout,
  type Point,
  type View,
} from "./cover-zoom";
import {
  ChevronLeft,
  ChevronRight,
  Expand,
  Shrink,
  X,
  ZoomIn,
  ZoomOut,
} from "@/components/ui/icons";

/**
 * SPIKE — full-screen cover viewer, opened from the detail modal.
 *
 * The detail modal shows the cover at ~45% of a 5xl panel, which is enough to
 * identify a book and not enough to look at one. This is the "look at it" mode:
 * the cover fills the viewport, and you can go past fit-to-screen to 1:1 to
 * read the linework on an upscaled scan.
 *
 * Layers above the modal (z-90 vs z-70) and leaves it mounted underneath, so
 * closing returns you to exactly the modal state you left — including edit mode
 * and scroll position in the metadata panel.
 *
 * Zoom survives stepping between covers, which takes a module store rather than
 * component state — see `cover-view-store.ts` for why.
 */

/** Zoom steps per button press / wheel notch. */
const ZOOM_STEP = 1.4;

export function CoverViewer({
  comic,
  onClose,
  prev,
  next,
  onNavigate,
}: {
  comic: ComicDTO;
  onClose: () => void;
  prev: string | null;
  next: string | null;
  onNavigate: (id: string | null) => void;
}) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [viewport, setViewport] = useState(() => ({
    width: typeof window === "undefined" ? 1200 : window.innerWidth,
    height: typeof window === "undefined" ? 800 : window.innerHeight,
  }));

  // Geometry lives in `cover-zoom.ts` — pure, and tested there.
  const fit = fitBox(comic, viewport, viewport.width >= 640 ? 64 : 32); // p-4 / sm:p-8

  /**
   * Scale and pan are one piece of state, not two: carrying the zoom onto the
   * next cover has to move both together, from the values they had at that
   * moment, and two `set`s can't be read as a pair inside one updater.
   *
   * Seeded from the module store, and carried onto *this* cover as it's read:
   * stepping to the next cover remounts this component (see
   * `cover-view-store.ts`), so a mount is exactly where the hand-off happens.
   * Doing it here rather than in an effect means the first painted frame is
   * already right, with no cascading second render.
   */
  const [view, setViewState] = useState<View>(() =>
    coverView.fit ? carryZoom(coverView.view, coverView.fit, fit, viewport) : coverView.view,
  );
  const setView = useCallback(
    (next: View | ((v: View) => View)) => setViewState(next),
    [],
  );

  // The flight belongs to opening the viewer, not to stepping between covers —
  // so the rect is spent on mount, and a remount mid-run finds nothing to fly
  // from. Kept out of the render pass: updaters and initialisers must be pure.
  useEffect(() => {
    coverView.originRect = null;
  }, []);

  // Mirrored into the store so the next mount picks up where this one left off.
  // An effect, not a write inside the state updater, which React may run twice.
  useEffect(() => {
    coverView.view = view;
  }, [view]);


  /**
   * Clamped for display rather than trusted as stored. The stored view was
   * measured against some other box — the previous cover's, or this one's
   * before the window changed size — and deriving the safe value each render
   * means a resize can never leave the cover stranded off-screen waiting for
   * the next interaction to correct it.
   */
  const scale = clampScale(view.scale, fit);
  const offset = clampOffset(view.offset, fit, viewport, scale);
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  /** Where the pointer went down, so a click can be told from the end of a pan. */
  const tapStart = useRef<Point | null>(null);

  // Browser full-screen changes the viewport without a resize in some browsers,
  // so listen for both.
  useEffect(() => {
    const sync = () => setViewport({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener("resize", sync);
    document.addEventListener("fullscreenchange", sync);
    return () => {
      window.removeEventListener("resize", sync);
      document.removeEventListener("fullscreenchange", sync);
    };
  }, []);

  const oneToOne = oneToOneScale(fit);
  const maxScale = maxScaleFor(fit);
  /**
   * Read, not consumed, during render — clearing it here would be a
   * render-phase side effect, and StrictMode double-invokes initialisers: the
   * first pass would take the rect, the second would find `null`, and the
   * flight would silently never play in dev. The consuming happens on mount.
   */
  const [originRect] = useState(() => coverView.originRect);
  const flight = originRect ? flightFrom(originRect, fit, viewport) : null;

  /**
   * Keep the image from being dragged off into the void: it may never be panned
   * further than its own overhang, so there is always artwork under the cursor.
   */
  const clamp = useCallback(
    (next: Point, atScale: number) => clampOffset(next, fit, viewport, atScale),
    [fit, viewport],
  );

  const reset = useCallback(() => setView(FIT_VIEW), [setView]);

  // The box the stored pan is measured against, for the next mount to carry
  // from. An assignment, not state — nothing re-renders because of it.
  useEffect(() => {
    coverView.fit = fit;
  }, [fit]);

  /**
   * Zoom about a point rather than about the centre: zooming from the middle
   * makes the thing you were looking at slide away, and on a cover you're
   * usually inspecting a corner. `origin` is relative to the container centre;
   * omitted, it zooms about the centre.
   */
  const zoomTo = useCallback(
    (nextScale: number, origin?: { x: number; y: number }) => {
      setView((v) => {
        const target = clampScale(nextScale, fit);
        return {
          scale: target,
          offset: zoomAbout(v.offset, v.scale, target, origin ?? { x: 0, y: 0 }, fit, viewport),
        };
      });
    },
    [fit, viewport, setView],
  );

  /**
   * Click the cover to zoom to 1:1 at that point; click again to come back;
   * click the surround to leave.
   *
   * A single click rather than a double: the first thing anyone does to a
   * full-screen image is click it, and if that does nothing then the controls
   * in the corner are the only way in. It's also the answer to "how do I get
   * back out" — the same gesture in reverse, which no button in a corner
   * teaches half as directly.
   *
   * **Bound to the surface, not to the `<img>`.** While zoomed, the pan sets
   * pointer capture on this container, and capture retargets the subsequent
   * `click` to the capturing element — so an `onClick` on the image fired at
   * fit and never once zoomed, which is exactly the half-working state this
   * feature was reported in.
   */
  const onSurfaceClick = (e: React.MouseEvent) => {
    const start = tapStart.current;
    tapStart.current = null;
    // A control was the target, not the artwork.
    if ((e.target as HTMLElement).closest("button, input, a")) return;
    // The release of a pan, not a click.
    if (!start || !isTap(start, { x: e.clientX, y: e.clientY })) return;

    if (scale > 1) return reset();

    const box = containerRef.current;
    const cover = imgRef.current?.getBoundingClientRect();
    if (!box) return;
    const onCover =
      cover &&
      e.clientX >= cover.left &&
      e.clientX <= cover.right &&
      e.clientY >= cover.top &&
      e.clientY <= cover.bottom;
    // Clicking the blurred surround dismisses, the way every lightbox does.
    if (!onCover) return onClose();

    const rect = box.getBoundingClientRect();
    zoomTo(oneToOne, {
      x: e.clientX - (rect.left + rect.width / 2),
      y: e.clientY - (rect.top + rect.height / 2),
    });
  };

  /**
   * Wheel handling, attached natively because it must be able to
   * `preventDefault`: React registers `onWheel` passively, and without the
   * cancel a pinch zooms the whole browser page instead of the cover.
   *
   * A two-finger trackpad scroll and a mouse wheel arrive as the same event, so
   * the split can't be by device — it's by intent, using the convention every
   * browser follows: **a pinch is a wheel event with `ctrlKey` set.**
   *
   *   - pinch (or ctrl+wheel) → zoom about the pointer
   *   - scroll while zoomed   → pan, since that's what scrolling means
   *   - scroll at fit         → zoom in, since there's nothing to pan yet
   */
  useEffect(() => {
    const box = containerRef.current;
    if (!box) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = box.getBoundingClientRect();
      const origin = {
        x: e.clientX - (rect.left + rect.width / 2),
        y: e.clientY - (rect.top + rect.height / 2),
      };
      if (e.ctrlKey) {
        zoomTo(scaleFromPinch(scale, e.deltaY, fit), origin);
      } else if (scale > 1) {
        setView((v) => ({
          ...v,
          offset: panByWheel(v.offset, { x: e.deltaX, y: e.deltaY }, fit, viewport, v.scale),
        }));
      } else {
        zoomTo(scale * (e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP), origin);
      }
    };
    box.addEventListener("wheel", onWheel, { passive: false });
    return () => box.removeEventListener("wheel", onWheel);
  }, [scale, fit, viewport, zoomTo, setView]);

  const onPointerDown = (e: React.PointerEvent) => {
    // Recorded whatever the zoom: the click handler needs it at fit too, where
    // there's no drag to compare against.
    tapStart.current = { x: e.clientX, y: e.clientY };
    if (scale === 1) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
    setDragging(true);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    setView((v) => ({
      ...v,
      offset: clamp({ x: d.ox + (e.clientX - d.x), y: d.oy + (e.clientY - d.y) }, v.scale),
    }));
  };
  const onPointerUp = () => {
    drag.current = null;
    setDragging(false);
  };

  // Real browser full-screen on top of the viewport overlay — on a laptop the
  // browser chrome is a surprising fraction of the height available to a
  // portrait cover.
  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else document.documentElement.requestFullscreen().catch(() => {});
  };
  useEffect(() => {
    const sync = () => setIsFullscreen(!!document.fullscreenElement);
    sync();
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);
  // Exiting browser full-screen belongs to *closing* the viewer, not to
  // unmounting it — this component unmounts on every step between covers, so
  // doing it here dropped you out of full screen the moment you pressed an
  // arrow. `coverView.close()` is the one place that means "really done", and
  // it handles it.

  // No reset: the zoom rides along to the next cover (see the `carryZoom`
  // effect above), which is what makes arrowing through a run at 1:1 useful.
  const go = (id: string | null) => {
    if (!id) return;
    onNavigate(id);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // This is the topmost surface while open, so it owns the keyboard — the
      // detail modal underneath skips its own handler (see ComicDetail).
      // Escape always closes, wherever focus is.
      if (e.key === "Escape") return onClose();

      // Everything else defers to a focused control, which owns its own keys:
      // click the zoom slider and press Right and, without this, the range
      // steps *and* you get thrown onto the next comic. `ComicDetail` guards
      // against precisely this for the upscale dialog's slider — same bug,
      // reached from the other side.
      if ((e.target as HTMLElement | null)?.closest?.("input, button, select, textarea")) return;

      if (e.key === "ArrowLeft") go(prev);
      else if (e.key === "ArrowRight") go(next);
      else if (e.key === "+" || e.key === "=") zoomTo(scale * ZOOM_STEP);
      else if (e.key === "-") zoomTo(scale / ZOOM_STEP);
      else if (e.key === "0") reset();
      else if (e.key === "f") toggleFullscreen();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const zoomed = scale > 1;

  return (
    <motion.div
      ref={containerRef}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      // Slower on the way out than in, so the backdrop doesn't vanish out from
      // under the cover while it's still flying home.
      exit={{ opacity: 0, transition: { duration: 0.32 } }}
      transition={{ duration: 0.18 }}
      // `touch-none`: panning is driven by pointer events, and without it the
      // browser claims a touch drag for its own page pan and fires
      // `pointercancel` mid-gesture, so a zoomed cover can't be dragged on a
      // phone at all.
      className="fixed inset-0 z-[90] touch-none select-none overflow-hidden bg-black"
      onClick={onSurfaceClick}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {/* The same silhouette treatment as the detail modal, held back harder:
          full-screen it's the entire background rather than a strip either side,
          so the cover has to stay the brightest thing on screen. */}
      <CoverBackdrop
        blurDataUrl={comic.blurDataUrl}
        thumbUrl={comic.thumbUrl}
        scrimClass="bg-black/60"
      />

      {/*
        Two elements, two transform owners. Motion animates the wrapper (the
        open / navigate transition); the zoom/pan transform lives on the `<img>`
        itself. Putting both on one node meant Motion's settled `scale: 1`
        overwrote the zoom on every commit — the readout moved, the cover
        didn't.
      */}
      <div className="absolute inset-0 flex items-center justify-center p-4 sm:p-8">
        {/*
          The cover *flies* out of the modal and back again on close, the same
          transition this app uses to open a card — a fade would read as a
          different image appearing, where the flight reads as the same object
          coming closer.

          Hand-rolled from `flightFrom` rather than Motion's `layoutId`: layout
          projection writes a correcting transform onto this element's child
          through the Web Animations API, which outranks the inline style the
          zoom lives in, and the zoom silently stopped working. Two transforms,
          two elements, neither surprising the other.
        */}
        <motion.div
          initial={flight ?? { opacity: 0, scale: 0.96 }}
          animate={{ x: 0, y: 0, scale: 1, opacity: 1 }}
          exit={flight ?? { opacity: 0, scale: 0.96 }}
          transition={{ type: "spring", stiffness: 300, damping: 34 }}
          style={{ width: fit.width, height: fit.height }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- the point of
              this view is the image at its own resolution; next/image would
              serve a resampled one, and the file is already fetched and decoded
              by the modal underneath. */}
          <img
            ref={imgRef}
            src={comic.imageUrl}
            alt={comic.series}
            draggable={false}
            style={{
              transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
              // No transition while dragging — a spring on pan lags the cursor.
              transition: dragging ? "none" : "transform 120ms ease-out",
              // `zoom-out` while zoomed, not `grab`: the cursor is the only
              // always-visible hint that a click gets you back, and panning
              // announces itself well enough once you start.
              cursor: zoomed ? (dragging ? "grabbing" : "zoom-out") : "zoom-in",
            }}
            className="h-full w-full rounded-sm object-contain shadow-2xl"
          />
        </motion.div>
      </div>

      {/* Controls. `pointer-events-none` on the rail with `auto` on the buttons
          so the gap between them still drags the image underneath. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-3 p-4">
        <div className="pointer-events-auto rounded-lg bg-black/40 px-3 py-1.5 text-sm text-fg/90 backdrop-blur-sm">
          <span className="font-medium">{comic.series}</span>
          {comic.issueNumber && <span className="text-fg/60"> #{comic.issueNumber}</span>}
          <span className="ml-2 text-xs tabular-nums text-fg/50">
            {comic.width}×{comic.height}
          </span>
        </div>

        <div className="pointer-events-auto flex items-center gap-1 rounded-lg bg-black/40 p-1 backdrop-blur-sm">
          <ViewerButton label="Zoom out" onClick={() => zoomTo(scale / ZOOM_STEP)} disabled={scale <= 1}>
            <ZoomOut className="h-4 w-4" />
          </ViewerButton>
          {/*
            A slider, not just +/− buttons: the gestures (wheel, double-click)
            are invisible, and a control you can see is the difference between
            "this viewer zooms" and "this viewer might zoom." It doubles as the
            readout of where you are between fit and 1:1.
          */}
          <input
            type="range"
            min={1}
            max={maxScale}
            step={0.01}
            value={scale}
            onChange={(e) => zoomTo(Number(e.target.value))}
            aria-label="Zoom"
            className="h-1 w-24 cursor-pointer appearance-none rounded-full bg-white/20 accent-accent sm:w-32"
          />
          <ViewerButton
            label="Zoom in"
            onClick={() => zoomTo(scale * ZOOM_STEP)}
            disabled={scale >= maxScale}
          >
            <ZoomIn className="h-4 w-4" />
          </ViewerButton>
          {/*
            At fit this is just a readout. Once zoomed it becomes a labelled
            "Fit" button with a visible edge — the way out was previously a
            percentage you had to guess was clickable, a minus button, or the
            left end of the slider, none of which say "get me back".
          */}
          <button
            onClick={reset}
            disabled={scale === 1}
            title="Fit to screen"
            className={`min-w-14 rounded-md px-2 py-1 text-xs tabular-nums transition ${
              zoomed
                ? "bg-white/10 text-fg ring-1 ring-white/20 hover:bg-white/20"
                : "text-fg/60"
            }`}
          >
            {zoomed
              ? `Fit · ${Math.round((scale / oneToOne) * 100) === 100 ? "1:1" : `${Math.round(scale * 100)}%`}`
              : "100%"}
          </button>
          <ViewerButton label={isFullscreen ? "Exit full screen" : "Full screen"} onClick={toggleFullscreen}>
            {isFullscreen ? <Shrink className="h-4 w-4" /> : <Expand className="h-4 w-4" />}
          </ViewerButton>
          <ViewerButton label="Close" onClick={onClose}>
            <X className="h-4 w-4" />
          </ViewerButton>
        </div>
      </div>

      {/*
        Shown while zoomed too. They used to hide, on the theory that a pan
        ending on an arrow would throw you onto another cover — but the pan sets
        pointer capture, so an arrow never sees that pointer, and hiding them
        left ←/→ navigating from the keyboard with no visible counterpart. Two
        controls for one action should not disagree about whether it exists.

        They do step back while zoomed: you're inspecting artwork underneath
        them, and they're still there the moment you look for them.
      */}
      {prev && (
        <ViewerArrow side="left" dimmed={zoomed} onClick={() => go(prev)}>
          <ChevronLeft className="h-6 w-6" />
        </ViewerArrow>
      )}
      {next && (
        <ViewerArrow side="right" dimmed={zoomed} onClick={() => go(next)}>
          <ChevronRight className="h-6 w-6" />
        </ViewerArrow>
      )}

      <p className="pointer-events-none absolute inset-x-0 bottom-4 text-center text-xs text-fg/40">
        {zoomed
          ? "Click the cover to zoom out · drag to pan · Esc to close"
          : "Click the cover to zoom in · F for full screen · Esc to close"}
      </p>
    </motion.div>
  );
}

function ViewerButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className="grid h-8 w-8 place-items-center rounded-md text-fg/70 transition hover:bg-white/10 hover:text-fg disabled:opacity-30 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  );
}

function ViewerArrow({
  side,
  onClick,
  dimmed,
  children,
}: {
  side: "left" | "right";
  onClick: () => void;
  dimmed?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`absolute top-1/2 hidden -translate-y-1/2 rounded-full bg-black/40 p-2 text-fg/70 backdrop-blur-sm transition hover:bg-black/70 hover:text-fg hover:opacity-100 sm:grid ${
        dimmed ? "opacity-30" : "opacity-100"
      } ${side === "left" ? "left-4" : "right-4"}`}
      aria-label={side === "left" ? "Previous cover" : "Next cover"}
    >
      {children}
    </button>
  );
}
