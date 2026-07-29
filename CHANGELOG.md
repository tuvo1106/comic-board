# Changelog

Notable work, newest first, grouped by theme rather than one line per commit —
`git log` has the full detail. This is the record of **what shipped**; see
[`ROADMAP.md`](./ROADMAP.md) for what's planned next.

## 2026-07-29 — Account settings, undo delete, search, detail-modal, and board-tabs fixes

- **Account settings.** A new "Account settings" dialog off the account menu
  lets you change your email and password — the first settings surface this
  app has had. Both actions were already core better-auth endpoints
  (`changeEmail`/`changePassword`), served by the existing auth catch-all
  route with no new API needed; `changeEmail` just needed one config flag
  (`updateEmailWithoutVerification`, since this app has no email-verification
  flow at all). Extracted the shared `Field` input component (label + input +
  optional trailing control) out of the login/signup form so both use it.
- **Undo delete.** Deleting a comic now soft-deletes it (`comics.deletedAt`) —
  every read query excludes it, so it disappears immediately, but a "Cover
  deleted" toast with an "Undo" action (6s) restores it. Actual row + cover
  file removal is deferred to a sweep of comics deleted more than 24h ago
  (`sweepDeletedComics`), run once per server start
  (`src/instrumentation.ts` — new: this app had no prior server-startup hook).
- **Click-to-edit in the comic detail modal.** Clicking a display field
  (series, issue #, publisher, cover date, author, cover artists, characters,
  tags) now enters edit mode with that field focused, instead of requiring
  the separate Edit button first. The "Replace cover" control is always
  visible on the cover image rather than only showing once already editing.
- **Blurred cover backdrop in the detail modal**, replacing the flat black
  background — reuses the existing tiny `blurDataUrl` placeholder asset
  (same one the board grid already uses), scaled up with a dark tint for
  contrast, instead of CSS-blurring the full-res image.
- **Drag tabs to reorder boards.** The backend (`boards.tabPosition` and its
  full API/mutation stack) already existed; this wires up `BoardTabs.tsx`
  with the same swap-on-drop semantics (`src/lib/reorder.ts`) card
  drag-reorder already uses. Dragging a card onto a tab was considered and
  not pursued.
- **Fixed dropped keystrokes when typing fast in the search bar.** A race
  between the 150ms search debounce and its URL echo could let a stale echo
  clobber newer local input; the component now tracks what it last pushed and
  only re-syncs from the URL on genuinely external changes.
- Stopped autofilling the artist field from Metron cover credits.

## 2026-07-28 — Replace an existing comic's cover (PR #4, #6)

- **Replace cover**, from an upload or a Metron pull (search + variant
  picker) — regenerates full/thumb/blur and repoints the comic without
  touching metadata or board memberships.
- Fixed the exported cover path and folder cleanup on replace/delete.
- Kept the tag autocomplete dropdown fully visible (PR #6).

## 2026-07-27 — Metadata autofill from Metron (PR #3)

- **One smart search box** in the upload flow (parses the issue number out of
  the query, e.g. "black cat 4"), results sorted newest-series-year-first,
  prefilling series/issue/cover date/publisher/creators and importing the
  cover (main + labeled variants). Comic Vine was evaluated and dropped for
  weaker search.
- Test coverage for the metadata I/O layer: Metron provider search/detail
  fetch, proxy, cache, config.

## 2026-07-26 — Export / backup (PR #2)

- **Collection export/backup.** `GET /api/export` zips a `collection.json`
  manifest plus every cover; `npm run db:import <zip> -- --replace` restores
  via the normal upload pipeline (ids/thumbnails/blur placeholders
  regenerate). One click before any risky operation; defuses the
  "reseed wiped my edits" failure mode.

## 2026-07-19 – 2026-07-23 — Code & design review pass

A full-repo code review and a screenshot-driven UI/UX review produced a
42-item work queue, executed end-to-end:

- **Safety net:** CI runs the integration suite; production refuses to boot
  without `BETTER_AUTH_SECRET`; 500 responses no longer leak internal error
  messages to clients.
- **Correctness:** board rename/delete errors toast instead of failing
  silently; a `~` in a filter value no longer breaks the URL round-trip;
  non-image uploads return 400 not 500; the list-view date cell commits on
  blur instead of per keystroke; the search-debounce timer no longer leaks on
  unmount; nested dialogs share a counter-based scroll lock.
- **Touch & mobile:** the card menu and title are reachable without hover on
  coarse pointers; the filter bar collapses into a bottom sheet under 640px;
  modal nav arrows no longer overlap the panel on small screens; star-rating
  touch targets are whole-star on touch.
- **List & filter refinement:** list-view chips no longer look identical to
  the modal's filter chips (resolved an edit-vs-filter ambiguity); sortable
  headers get a hover glyph; unrated rows are quiet until hover; facet counts
  respect other active filters; the date range is a pill+popover;
  active-filter chips are prefixed with their facet; a stale/invalid session
  cookie no longer causes a login redirect loop; search covers tags; the
  column-count control is labeled; "My Comics" shows a count like other tabs.
- **Polish & accessibility:** a global focus-visible ring; dialogs trap/
  restore focus and menus are arrow-navigable; the load skeleton matches the
  real masonry geometry (no reflow on load); the grid hover label shows
  rating; a password-visibility toggle on login; toasts are capped/deduped;
  dark-only declared deliberate in a comment.
- **Internal cleanup:** transactions thread `tx` through query helpers
  instead of relying on the single-connection driver; dead
  fractional-indexing code removed (`fractional-index.ts` renamed to
  `positions.ts`); masonry doc/code drift and stale storage-key comments
  fixed; `EditPublisher`/`loadRelations` de-duplicated; dead code removed;
  `listBoards`'s count query scoped to the caller; the sharp pipeline decodes
  once via `.clone()`; comic-rating mutations use targeted cache patches
  instead of a full refetch.
- Two review findings were deliberately skipped: a clickable series title in
  the modal (would need a Series filter chip that doesn't exist yet) and a
  "date added" field in the modal (low value) — see git history for the
  reasoning.
- Also landed alongside the review: ESLint wired up with react-hooks rules;
  README/DESIGN synced to shipped state.

## 2026-07-19 — List view, virtualization, modal polish

- **Editable list view** — grid⇄list toggle, every field editable in place
  (click-to-edit text/date, inline tag input, always-live star rating).
- **Virtualized the masonry board**; drag-reorder became a swap (two
  single-row writes) instead of a full renumber.
- Sortable list-view column headers; autocomplete on the publisher cell.
- Fixed a board reshuffle when opening a comic and a scroll jump to the
  bottom when a modal opens.
- Several rounds of modal-cover-loading tuning (blur placeholder → thumbnail
  placeholder → preload-on-hover → opaque during fly-in) settled on: start
  from the decoded thumbnail, preload the full image on hover, stay opaque
  through the shared-element transition.
- Publisher normalized into a managed, renameable set.
- Backend query-layer tests (authorization scoping + regressions),
  upload-path tests, integration coverage for modal scroll behavior; CI runs
  the integration suite in headless Chrome.

## 2026-07-18 — Foundation

- Initial board/boards/detail/upload/drag-and-drop build.
- Accounts + per-user ownership (better-auth, email/password).
- Half-star ratings (0.5–5) + sort; fixed a partial-update bug that wiped
  metadata.
- CI pipeline; pinned TypeScript 5.x.

## 2026-07-17 — Project start
