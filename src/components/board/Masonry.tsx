"use client";

import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  pointerWithin,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { motion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMeasureWidth } from "@/lib/use-measure";
import { swapReorder, type ReorderUpdate } from "@/lib/reorder";
import type { ComicDTO } from "@/lib/types";
import { computeMasonry, placementsInRange, type Placement } from "./masonry-layout";
import { ComicCard } from "./ComicCard";

// How far above and below the viewport to keep cards mounted, so scrolling
// reveals already-rendered cards instead of blank space. Roughly a screenful.
const WINDOW_BUFFER = 800;

export interface ReorderResult {
  /** Position writes to persist — a swap trades the two cards' exact positions. */
  updates: ReorderUpdate[];
  orderedIds: string[];
}

interface Props {
  comics: ComicDTO[];
  onOpen?: (comic: ComicDTO) => void;
  renderMenu?: (comic: ComicDTO) => React.ReactNode;
  stagger?: boolean;
  /** Enable drag-to-reorder (off while filtered). */
  draggable?: boolean;
  onReorder?: (result: ReorderResult) => void;
  /** null = responsive by width; a number pins the column count. */
  columns?: number | null;
}

export function Masonry({
  comics,
  onOpen,
  renderMenu,
  stagger = true,
  draggable = false,
  onReorder,
  columns = null,
}: Props) {
  const { ref: measureRef, width } = useMeasureWidth<HTMLDivElement>();
  const [items, setItems] = useState<ComicDTO[]>(comics);
  const [activeId, setActiveId] = useState<string | null>(null);

  // The grid element, tracked alongside the width observer so we can read its
  // document offset for windowing (getBoundingClientRect on scroll).
  const containerRef = useRef<HTMLDivElement | null>(null);
  const setContainerRef = useCallback(
    (node: HTMLDivElement | null) => {
      containerRef.current = node;
      measureRef(node);
    },
    [measureRef],
  );

  // The entrance stagger should play once (initial load), not every time a card
  // scrolls into the window. A ref (not state) so flipping it never re-renders.
  const enteredRef = useRef(false);
  useEffect(() => {
    enteredRef.current = true;
  }, []);

  // Keep local order in sync with props, except while a drag is in progress.
  // Adjusting during render (rather than in an effect) avoids a wasted render
  // pass; `prevComics` gates the sync to actual prop changes.
  const [prevComics, setPrevComics] = useState(comics);
  if (comics !== prevComics && !activeId) {
    setPrevComics(comics);
    setItems(comics);
  }

  const layout = useMemo(
    () => (width > 0 ? computeMasonry(items, width, columns) : null),
    [items, width, columns],
  );

  // Virtualization window in container-local coordinates. Only cards whose
  // placement intersects [top, bottom] are mounted; the container keeps its
  // full height so the scrollbar and layout are unaffected. Seeded from the
  // viewport so the very first paint is already windowed (never mounts all).
  const [range, setRange] = useState(() => ({
    top: -WINDOW_BUFFER,
    bottom: (typeof window !== "undefined" ? window.innerHeight : 1200) + WINDOW_BUFFER,
  }));
  useEffect(() => {
    let raf = 0;
    const recompute = () => {
      raf = 0;
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      // rect.top is the container's top in viewport coords; a card at local y
      // sits at viewport `rect.top + y`. Convert the buffered viewport back into
      // local coords.
      setRange({
        top: -rect.top - WINDOW_BUFFER,
        bottom: -rect.top + window.innerHeight + WINDOW_BUFFER,
      });
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(recompute);
    };
    recompute();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  // The subset of cards to actually mount. The dragged card is always kept
  // mounted (even if it scrolls out) so dnd-kit's sortable node never detaches
  // mid-drag.
  const visibleItems = useMemo(() => {
    if (!layout) return [];
    const inRange = new Set(
      placementsInRange(layout.placements.values(), range.top, range.bottom).map((p) => p.id),
    );
    if (activeId) inRange.add(activeId);
    return items.filter((c) => inRange.has(c.id));
  }, [layout, range, items, activeId]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // Insert where the cursor actually is (pointer-precise); fall back to
  // nearest-center for keyboard dragging, which has no pointer.
  const collisionDetection: CollisionDetection = (args) => {
    const byPointer = pointerWithin(args);
    return byPointer.length > 0 ? byPointer : closestCenter(args);
  };

  const activeComic = activeId ? items.find((c) => c.id === activeId) ?? null : null;
  const activePlacement = activeId ? layout?.placements.get(activeId) ?? null : null;

  const onDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id));

  // Reorder once, on drop. Live per-move reordering is unstable on a
  // variable-height masonry (the collision target oscillates as cards reflow
  // under the cursor, dragging neighbors along), so we let the overlay track
  // the pointer and settle everything in a single reflow when released. The
  // swap itself is `swapReorder` (see src/lib/reorder.ts).
  const onDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = e;
    if (!over) return;
    const result = swapReorder(items, String(active.id), String(over.id));
    if (!result) return;
    setItems(result.items);
    onReorder?.({ updates: result.updates, orderedIds: result.orderedIds });
  };

  // Reading `enteredRef` during render is deliberate (see the ref's declaration
  // above): it gates the entrance stagger to the initial load only. It must be a
  // render-time ref read rather than state/effect — flipping it must NOT trigger
  // a re-render, or the extra render would cancel the in-flight fade-in for the
  // first batch of cards. The taint flows into the `grid` JSX below.
  /* eslint-disable react-hooks/refs -- intentional entrance-animation gate */
  const animateIn = stagger && !enteredRef.current;
  const grid = (
    <div ref={setContainerRef} className="relative w-full" style={{ height: layout?.height ?? 0 }}>
      {layout &&
        visibleItems.map((comic, idx) => {
          const p = layout.placements.get(comic.id);
          if (!p) return null;
          const delay = animateIn ? Math.min(idx * 0.012, 0.25) : 0;
          return (
            <CardShell
              key={comic.id}
              comic={comic}
              placement={p}
              delay={delay}
              animateIn={animateIn}
              draggable={draggable}
              dimmed={activeId === comic.id}
              onOpen={() => onOpen?.(comic)}
              menu={renderMenu?.(comic)}
            />
          );
        })}
    </div>
  );
  /* eslint-enable react-hooks/refs */

  // DndContext stays mounted whether or not dragging is enabled, so toggling
  // filters never remounts the grid (which would restart enter animations and
  // detach the width observer). When not draggable, cards carry no drag
  // listeners, so no drag can start.
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => {
        setActiveId(null);
        setItems(comics);
      }}
    >
      <SortableContext items={items.map((c) => c.id)} strategy={rectSortingStrategy}>
        {grid}
      </SortableContext>
      <DragOverlay dropAnimation={null}>
        {activeComic && activePlacement && (
          <div style={{ width: activePlacement.width }} className="cursor-grabbing">
            <div className="scale-[1.04]">
              <ComicCard comic={activeComic} height={activePlacement.height} noLayoutId />
            </div>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}

/**
 * One positioned card. When draggable, wires dnd-kit listeners onto the wrapper.
 * `animateIn` plays the entrance fade only on the initial load; cards mounting
 * later because they scrolled into the virtualization window appear instantly
 * (a fade on every scroll would flicker). Reorder still animates via `layout`.
 */
function CardShell({
  comic,
  placement,
  delay,
  animateIn,
  draggable,
  dimmed,
  onOpen,
  menu,
}: {
  comic: ComicDTO;
  placement: Placement;
  delay: number;
  animateIn: boolean;
  draggable: boolean;
  dimmed: boolean;
  onOpen: () => void;
  menu?: React.ReactNode;
}) {
  const sortable = useSortable({ id: comic.id, disabled: !draggable });

  return (
    <motion.div
      ref={draggable ? sortable.setNodeRef : undefined}
      layout
      initial={animateIn ? { opacity: 0, scale: 0.92 } : false}
      animate={{ opacity: dimmed ? 0.4 : 1, scale: 1 }}
      transition={{
        layout: { type: "spring", stiffness: 480, damping: 42 },
        scale: { type: "spring", stiffness: 480, damping: 42, delay },
        opacity: { duration: 0.22, delay },
      }}
      style={{ position: "absolute", left: placement.x, top: placement.y, width: placement.width }}
      {...(draggable ? sortable.attributes : {})}
      {...(draggable ? sortable.listeners : {})}
    >
      <ComicCard comic={comic} height={placement.height} onOpen={onOpen} menu={menu} />
    </motion.div>
  );
}
