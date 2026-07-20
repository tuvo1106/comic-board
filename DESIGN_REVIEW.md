# UI/UX review — 2026-07-19

Based on rendered screenshots of the real app (login, board grid, filter
dropdown, active chips, list view, upload modal, and 390/820px viewports)
plus the component code. Companion to `CODE_REVIEW.md` (engineering) and
`ROADMAP.md` (features).

## What works

The core identity is strong: a dark, chrome-minimal gallery that lets cover
art carry the page. Uniform 2:3 cards read as a curated wall rather than a
file manager; the label-on-hover choice keeps the grid quiet. The pill/chip
language is applied consistently (filters, facet values, tags, boards), the
motion design (staggered entrance, spring tab underline, shared-element modal
open) feels intentional, and empty/no-match states with a "Clear filters"
action exist. This is a coherent design system, not assembled parts.

The critiques below are ordered by how much they'd improve daily use.

---

## 1. Touch devices can't reach the card menu — highest priority
`ComicCard`/`ComicCardMenu` — the "…" button is `opacity-0 group-hover:opacity-100`,
and the title/issue label is hover-revealed too. On a phone or tablet there
is no hover: the menu is unreachable from the grid (add-to-board/delete
require opening the modal), and cards are unlabeled art with no way to peek.
Fix: on coarse pointers (`@media (pointer: coarse)` or a `matchMedia` hook),
show the menu button always (or on first tap) and consider always-on labels.

## 2. Mobile chrome eats the viewport
At 390px the header + tabs + filter bar stack wraps to ~5 rows (filter pills
wrap to three lines, then the date-range row) — roughly half the screen
before any content. The filter bar should collapse to a single "Filters (n)"
button opening a bottom sheet on small screens. The desktop version has the
same tendency in milder form: three stacked sticky bars (~160px) — consider
auto-hiding tabs/filters on scroll-down, reappearing on scroll-up.

## 3. List view: same chip, opposite meaning
In the detail modal, clicking an author/artist/tag chip *filters the board*.
In the list view, the identical-looking chip *opens an inline editor*. One
visual affordance, two opposite behaviors — whichever a user learns first
makes the other surprising. Options: distinct edit affordance in list view
(pencil on row-hover, click-to-filter on the chip), or make list chips filter
and move editing behind the row menu.

Also in the list view:
- Sortable headers (Series/#/Publisher/Cover date/Rating) are visually
  identical to non-sortable ones (Author/Cover Artist/Tags) — no affordance
  until you happen to click. Add a subtle sort glyph on hover.
- A native date input renders in every row (calendar icon, `mm/dd/yyyy`
  chrome) — the one form control in an otherwise text table, and it PATCHes
  per keystroke (CODE_REVIEW #4). Render as plain text, swap to input on click.
- Five muted star outlines repeat in every row — a lot of texture for mostly
  unrated comics. Render nothing (or a tiny dot) when unrated; show stars on
  row hover for setting.

## 4. Filter bar details
- **Date range is raw**: two native date inputs with `mm/dd/yyyy` placeholder
  chrome sit among the clean pill dropdowns. Wrap them in a "Date" pill that
  opens a small popover, matching the other facets.
- **Facet counts ignore other active filters**: `computeFacets` runs on the
  whole board, so with Publisher=DC active the Author dropdown still shows
  counts including non-DC comics. Either compute counts against the
  currently-filtered set (except the facet's own selections — the standard
  faceted-search convention) or expect occasional "why does it say 3 but show
  1" confusion.
- **Ambiguous chips**: active-filter chips show only the value ("DC",
  "Peach Momoko"). Once several facets are active, provenance is guesswork —
  and an author and a tag can share a name. Prefix ("Publisher: DC") or add a
  small facet icon.
- **Unlabeled column pills**: `Auto 3 4 5 6` means nothing until clicked.
  A columns glyph before the group or a tooltip fixes it cheaply.
- **Tab count inconsistency**: custom board tabs show counts; "My Comics"
  doesn't. Either both or neither.

## 5. Modal niceties
- The series title in the modal header is plain text while publisher/author/
  character/tag are all clickable filters — series is a facet too, and it's
  the most likely "show me the rest of this run" action. Make it a link.
- No "date added" anywhere in the detail view, though it's a sort option.
- Prev/next arrows float mid-viewport at the panel's edge; at 390px the next
  arrow overlaps the panel content. Inside-the-panel placement (or
  swipe/keyboard only on mobile) would be cleaner.
- Star rating tap targets are ten half-star zones ≈14px each on mobile —
  below the ~44px touch guideline. Consider whole-star taps + long-press or
  a slider for halves on touch.

## 6. Upload flow gaps
The dropzone-in-a-dialog is clean, but:
- **No drop-on-board**: dragging files onto the grid itself is the natural
  gesture for a "board" app — wire `dragover` on the board to open the modal
  pre-loaded.
- **Batch flow is forward-only**: "Save & next" cannot go back or skip a
  file, and there's no strip showing what's queued/done. A small thumbnail
  rail with state (done/current/pending) plus Back/Skip would make multi-file
  uploads feel safe.
- Selecting files *replaces* the current selection (`addFiles` does
  `setFiles(incoming)`) — adding a second batch mid-flow silently drops the
  rest of the first.

## 7. Skeleton doesn't match the real layout
`BoardSkeleton` uses CSS multi-columns with varied heights; the real grid is
absolutely-positioned uniform cards (up to 6 columns). The handoff visibly
reflows. Generate the skeleton from `computeMasonry` with placeholder items —
same geometry, no jump.

## 8. Keyboard/focus visibility
Inputs get `focus:border-accent`, but buttons, cards, menu items, and chips
have no visible focus ring — keyboard navigation works (cards are tabbable
with Enter/Space handlers) but is invisible. A global
`:focus-visible { outline: … }` in `globals.css` is most of the fix; pairs
with the overlay-a11y finding (CODE_REVIEW #20).

## 9. Small polish
- Login: no password-visibility toggle; "Sign in" disabled state is the only
  wrong-credentials friction feedback until the error line appears.
- Dark-only is a fine identity choice, but it's implicit (`[color-scheme:dark]`
  sprinkled on date inputs) — worth one comment in `globals.css` declaring it
  deliberate so nobody half-adds a light mode.
- Grid hover label shows series/issue only — rating would be nice there since
  it's otherwise invisible in grid view.
- Toasts stack without cap or dedupe; a rapid batch upload can queue a tower.

---

## Suggested order

1. Touch access to card menu + labels (#1) — functionality, not polish.
2. Mobile filter sheet (#2).
3. List-view chip semantics + header affordances (#3).
4. Filter bar details (#4) — several are one-liners.
5. The rest opportunistically alongside feature work.
