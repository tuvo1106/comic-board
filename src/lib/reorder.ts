/**
 * Drag-to-reorder uses *swap* semantics: the dragged card and its drop target
 * trade exact `position` values; every other card stays put. (Insert/shift
 * semantics moved the drop target "down the row", which read as a bug.)
 *
 * Swapping existing position values is exact — no fractional midpoint, so no
 * precision drift — and while filtered it touches only the two visible cards,
 * leaving hidden (filtered-out) comics' positions alone.
 */

export interface ReorderUpdate {
  id: string;
  position: number;
}

export interface SwapResult<T> {
  /** The full list re-sorted by position after the swap. */
  items: T[];
  /** The two position writes to persist. */
  updates: ReorderUpdate[];
  orderedIds: string[];
}

/**
 * Swap the dragged card (`activeId`) with its drop target (`overId`). Returns
 * `null` for a no-op drop — same card, or either id not present in `items`.
 */
export function swapReorder<T extends { id: string; position: number }>(
  items: T[],
  activeId: string,
  overId: string,
): SwapResult<T> | null {
  if (activeId === overId) return null;
  const a = items.find((c) => c.id === activeId);
  const b = items.find((c) => c.id === overId);
  if (!a || !b) return null;

  const swapped = items
    .map((c) => {
      if (c.id === a.id) return { ...c, position: b.position };
      if (c.id === b.id) return { ...c, position: a.position };
      return c;
    })
    .sort((x, y) => x.position - y.position);

  return {
    items: swapped,
    updates: [
      { id: a.id, position: b.position },
      { id: b.id, position: a.position },
    ],
    orderedIds: swapped.map((c) => c.id),
  };
}
