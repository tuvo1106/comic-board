# Roadmap

What's planned next, in recommended order. Effort estimates are rough
single-dev figures. For what's already shipped, see
[`CHANGELOG.md`](./CHANGELOG.md).

Each numbered item below is a multi-file feature with product/architecture
decisions still to make — open a planning pass (scope, schema, API shape, UI
flow) before writing code; don't cold-start one from a bare item description
(see `AGENTS.md`).

---

## 1. Undo delete — ~half a day

Delete is confirm-dialog-or-nothing. Replace with soft delete:

- Add `deletedAt` to `comics`; scope every query in `src/db/queries.ts` to
  `deletedAt IS NULL` (they already all go through a few list/get functions).
- Toast "Cover deleted — Undo" for ~6s (toast system already exists); undo
  clears `deletedAt`.
- Defer file deletion (`storage.delete`) to a sweep of rows deleted >24h ago,
  run opportunistically at startup.

## 2. Collection features *(independent; pick by taste)*

### 2a. Multi-select + bulk actions — ~1–2 days

Select several covers (click-drag or shift-click) → add to board / tag / set
publisher / delete. All the mutations exist; this is selection UI plus a
small action bar.

### 2b. Duplicate detection at upload — ~1 day

Store a perceptual hash (dHash off a 9×8 grayscale downsample — sharp does
this in one pipeline step) per comic. On upload, compare against the user's
hashes and warn "this looks like a cover you already have" with a
side-by-side. Pure additive: one column, one comparison, one dialog.

### 2c. Stats page — ~1 day

Counts by publisher / decade / artist, rating distribution, growth over time.
`getMeta` already computes most aggregates; cover-date decades and
`createdAt` growth are simple additions. One page of charts; makes the
collection browsable in a new way.

### 2d. Collector fields — ~1 day

`purchasePrice`, `currentValue`, `grade` (CGC-style), `condition` on comics.
Schema migration + form fields + optional list-view columns + a total-value
stat. This is what turns "cover gallery" into "collection tracker."

### 2e. Autocomplete the collection search — ~half a day

The top-bar search ("Search series, artists, characters…") is plain
free-text. Add a typeahead dropdown suggesting matches from the **current
collection** — `getMeta` already returns the series / publisher / author /
artist / character lists, so this is entirely client-side (no API): filter
those on input, show a grouped suggestion list, and selecting one sets the
search term. Can reuse the existing `Autocomplete` component. Keyboard nav +
click-to-select.

## 3. Board interaction

- **Drag tabs to reorder boards**; drag a card onto a tab to add it to that
  board.
- **Smart boards** — a board backed by a stored filter query instead of a
  point-in-time snapshot (`Board.query` JSON column), so it stays live as the
  collection changes.

## 4. Infrastructure *(design-for, don't build yet)*

- **Cloud storage** via the existing `StorageAdapter` — local FS today, S3/R2
  is meant to be a drop-in.
- **Server-side filtering + pagination** for very large collections — the
  board is already client-side virtualized (bounded DOM), so this is only
  needed once the full-board payload itself (all comics in memory) gets too
  big; at that point facet counts, global sort, and search move server-side
  too.
- **Spec-driven behaviors** — convert the current feature set + ad-hoc test
  flows into structured per-feature behavior specs the unit + integration
  suites map onto.

## 5. Sharing — bigger; decide deliberately

Public read-only board links are the natural evolution of boards, but they
force two things to be resolved first:

- **`/images/**` auth** — the route does no session check today (comic ids
  are unguessable 14-char nanoids, fine for a personal app, but a leaked URL
  serves the cover to anyone forever). Shared boards need cover access for
  anonymous viewers — likely signed URLs or a per-board access check.
- **The globally-shared publisher/tag namespace** — renames currently have
  cross-user effects (any user who owns one comic with a publisher can rename
  the globally-shared row, repointing every user's comics). Fine single-user;
  real multi-user sharing needs per-user or copy-on-write name tables.

Sequence this after the items above, not before.

---

## Suggested order

1. Undo delete (1) — the remaining data-safety gap.
2. Collection features (2a–2e) by appetite.
3. Board interaction (3).
4. Infrastructure (4) only once something in 2–3 actually needs it.
5. Sharing (5) only with its two prerequisites resolved.
