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
 * Fixed-column masonry. The card at flow position `i` always lives in column
 * `i % columns`, stacked vertically within it. Each card keeps its cover's
 * aspect ratio, so columns stagger like a Pinterest board.
 *
 * We deliberately do NOT pack into the shortest column: that makes a card's
 * column depend on the heights of every card before it, so reordering two early
 * cards would reshuffle unrelated cards downstream. With fixed columns a
 * reorder keeps cards in their column, and because comic covers are all roughly
 * portrait the columns stay well balanced.
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

  const colHeights = new Array(columns).fill(0);
  const placements = new Map<string, Placement>();

  const cardHeight = Math.round(columnWidth * CARD_ASPECT);

  items.forEach((item, i) => {
    const col = i % columns;
    const x = col * (columnWidth + GAP);
    const y = colHeights[col];
    placements.set(item.id, { id: item.id, x, y, width: columnWidth, height: cardHeight });
    colHeights[col] = y + cardHeight + GAP;
  });

  const height = Math.max(0, ...colHeights) - GAP;
  return { placements, columnWidth, height: Math.max(height, 0), columns };
}
