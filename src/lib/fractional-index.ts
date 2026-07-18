/**
 * Fractional indexing for board ordering. Each item holds a float `position`;
 * inserting between two neighbors takes their midpoint, so a reorder writes a
 * single row instead of renumbering the whole board.
 *
 * Positions are always compared as numbers. Append uses max + STEP.
 */
export const POSITION_STEP = 1;

/** Position to append after the current maximum (or the first position). */
export function positionAfterMax(max: number | null | undefined): number {
  if (max == null || !Number.isFinite(max)) return POSITION_STEP;
  return max + POSITION_STEP;
}

/** Position before the current minimum. */
export function positionBeforeMin(min: number | null | undefined): number {
  if (min == null || !Number.isFinite(min)) return POSITION_STEP;
  return min - POSITION_STEP;
}

/**
 * Position that places an item between `before` and `after`.
 * Pass null for an open end (dropping at the very start or end).
 */
export function positionBetween(
  before: number | null,
  after: number | null,
): number {
  if (before == null && after == null) return POSITION_STEP;
  if (before == null) return positionBeforeMin(after);
  if (after == null) return positionAfterMax(before);
  return (before + after) / 2;
}

/**
 * True when two adjacent positions are so close that further midpoints would
 * lose float precision — the caller should renumber that board in one pass.
 */
export function needsRenumber(before: number, after: number): boolean {
  return Math.abs(after - before) < 1e-9;
}
