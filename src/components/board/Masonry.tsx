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
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { useMeasureWidth } from "@/lib/use-measure";
import { positionBetween } from "@/lib/fractional-index";
import type { ComicDTO } from "@/lib/types";
import { computeMasonry, type Placement } from "./masonry-layout";
import { ComicCard } from "./ComicCard";

export interface ReorderResult {
  movedId: string;
  newPosition: number;
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
  const { ref, width } = useMeasureWidth<HTMLDivElement>();
  const [items, setItems] = useState<ComicDTO[]>(comics);
  const [activeId, setActiveId] = useState<string | null>(null);

  // Keep local order in sync with props, except while a drag is in progress.
  useEffect(() => {
    if (!activeId) setItems(comics);
  }, [comics, activeId]);

  const layout = useMemo(
    () => (width > 0 ? computeMasonry(items, width, columns) : null),
    [items, width, columns],
  );

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
  // the pointer and settle everything in a single reflow when released.
  const onDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = items.findIndex((c) => c.id === active.id);
    const to = items.findIndex((c) => c.id === over.id);
    if (from === -1 || to === -1) return;

    const reordered = arrayMove(items, from, to);
    setItems(reordered);
    const before = to > 0 ? reordered[to - 1].position : null;
    const after = to < reordered.length - 1 ? reordered[to + 1].position : null;
    const newPosition = positionBetween(before, after);
    onReorder?.({
      movedId: String(active.id),
      newPosition,
      orderedIds: reordered.map((c) => c.id),
    });
  };

  const grid = (
    <div ref={ref} className="relative w-full" style={{ height: layout?.height ?? 0 }}>
      {layout && (
        <AnimatePresence initial={false} mode="popLayout">
          {items.map((comic, i) => {
            const p = layout.placements.get(comic.id);
            if (!p) return null;
            const delay = stagger ? Math.min(i * 0.012, 0.25) : 0;
            return (
              <CardShell
                key={comic.id}
                comic={comic}
                placement={p}
                delay={delay}
                draggable={draggable}
                dimmed={activeId === comic.id}
                onOpen={() => onOpen?.(comic)}
                menu={renderMenu?.(comic)}
              />
            );
          })}
        </AnimatePresence>
      )}
    </div>
  );

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

/** One positioned card. When draggable, wires dnd-kit listeners onto the wrapper. */
function CardShell({
  comic,
  placement,
  delay,
  draggable,
  dimmed,
  onOpen,
  menu,
}: {
  comic: ComicDTO;
  placement: Placement;
  delay: number;
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
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: dimmed ? 0.4 : 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
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
