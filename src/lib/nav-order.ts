/**
 * The board records the currently-visible, ordered comic ids here before
 * opening a detail view, so the modal's ←/→ navigation follows the same order
 * the user is looking at (respecting the active board + filters). On a cold
 * deep-link this is empty and the modal falls back to no prev/next.
 */
let order: string[] = [];

export const navOrder = {
  set(ids: string[]) {
    order = ids;
  },
  get(): string[] {
    return order;
  },
  neighbors(id: string): { prev: string | null; next: string | null } {
    const i = order.indexOf(id);
    if (i === -1) return { prev: null, next: null };
    return {
      prev: i > 0 ? order[i - 1] : null,
      next: i < order.length - 1 ? order[i + 1] : null,
    };
  },
};
