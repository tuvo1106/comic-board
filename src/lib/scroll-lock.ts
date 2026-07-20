/**
 * Counter-based body scroll lock.
 *
 * Multiple overlays can be open at once — e.g. a confirm Dialog nested above the
 * comic detail modal. Each holds a lock; the background stays locked until the
 * last holder releases. A single boolean/direct `body.overflow` write would let
 * the inner overlay's cleanup unlock scrolling while the outer one is still
 * open, so both callers must go through here.
 */
let count = 0;
let prevOverflow = "";

export function lockScroll(): void {
  if (count === 0) {
    prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  }
  count++;
}

export function unlockScroll(): void {
  if (count === 0) return;
  count--;
  if (count === 0) {
    document.body.style.overflow = prevOverflow;
  }
}
