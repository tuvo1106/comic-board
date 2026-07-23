import type { ComicDTO } from "@/lib/types";

export interface Placement {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface MasonryResult {
  placements: Map<string, Placement>;
  columnWidth: number;
  height: number;
  columns: number;
}

const GAP = 16;
const MIN_CARD_WIDTH = 150; // never let a pinned column count squeeze cards below this
// Every card is the same height, normalized to a standard comic proportion
// (~2:3). Covers fill via object-cover, so odd-ratio ones get a small edge crop.
// Uniform footprints keep rows aligned and make reordering move nothing below.
const CARD_ASPECT = 1.5; // height / width

/** Column count by container width — the auto/responsive default. */
export function columnsForWidth(width: number): number {
  if (width >= 1920) return 6;
  if (width >= 1536) return 5;
  if (width >= 1280) return 4;
  if (width >= 768) return 3;
  if (width >= 480) return 2;
  return 1;
}

/** Most columns that fit at MIN_CARD_WIDTH — caps a user's pinned choice. */
export function maxColumnsForWidth(width: number): number {
  if (width <= 0) return 1;
  return Math.max(1, Math.floor((width + GAP) / (MIN_CARD_WIDTH + GAP)));
}

/**
 * Fixed-column uniform grid. The card at flow position `i` always lives in
 * column `i % columns`, on row `floor(i / columns)`. Every card is the same
 * height (`columnWidth * CARD_ASPECT`), so this is a plain grid — rows stay
 * aligned and columns don't stagger. Covers fill their fixed footprint via
 * object-cover (see CARD_ASPECT above).
 *
 * The name "masonry" is historical: we deliberately do NOT pack into the
 * shortest column. Shortest-column packing would make a card's position depend
 * on the heights of every card before it, so reordering two early cards would
 * reshuffle unrelated cards downstream. Fixed columns + uniform heights keep a
 * reorder local: cards stay in their column and nothing below moves.
 */
export function computeMasonry(
  items: ComicDTO[],
  containerWidth: number,
  columnOverride?: number | null,
): MasonryResult {
  const columns =
    columnOverride != null
      ? Math.max(1, Math.min(columnOverride, maxColumnsForWidth(containerWidth)))
      : columnsForWidth(containerWidth);
  const columnWidth =
    columns > 0 ? (containerWidth - GAP * (columns - 1)) / columns : containerWidth;

  const cardHeight = Math.round(columnWidth * CARD_ASPECT);
  const rowStride = cardHeight + GAP;
  const placements = new Map<string, Placement>();

  items.forEach((item, i) => {
    const col = i % columns;
    const row = Math.floor(i / columns);
    const x = col * (columnWidth + GAP);
    const y = row * rowStride;
    placements.set(item.id, { id: item.id, x, y, width: columnWidth, height: cardHeight });
  });

  // Total height is the number of rows (tallest column) times the row stride,
  // minus the trailing gap. Empty board -> 0.
  const rows = Math.ceil(items.length / columns);
  const height = rows > 0 ? rows * rowStride - GAP : 0;
  return { placements, columnWidth, height, columns };
}

/**
 * The placements whose vertical span intersects the buffered viewport window
 * `[top, bottom]` (container-local coordinates). Used to virtualize the board:
 * only cards near the viewport are mounted, but the container keeps its full
 * height so the scrollbar and layout are unchanged. A card is kept if any part
 * of it — including cards straddling either edge — falls in the window.
 */
export function placementsInRange(
  placements: Iterable<Placement>,
  top: number,
  bottom: number,
): Placement[] {
  const out: Placement[] = [];
  for (const p of placements) {
    if (p.y + p.height >= top && p.y <= bottom) out.push(p);
  }
  return out;
}
