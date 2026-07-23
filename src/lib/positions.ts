/**
 * Board ordering positions. Each item holds a float `position`; new items are
 * appended after the current maximum. Reordering is done by swapping the
 * positions of two rows, so there is never a need to insert *between* neighbors
 * — positions stay integer-spaced and never lose precision.
 *
 * Positions are always compared as numbers. Append uses max + STEP.
 */
export const POSITION_STEP = 1;

/** Position to append after the current maximum (or the first position). */
export function positionAfterMax(max: number | null | undefined): number {
  if (max == null || !Number.isFinite(max)) return POSITION_STEP;
  return max + POSITION_STEP;
}
