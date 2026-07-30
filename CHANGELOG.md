# Changelog

Notable work, newest first, grouped by theme rather than one line per commit —
`git log` has the full detail. This is the record of **what shipped**; see
[`ROADMAP.md`](./ROADMAP.md) for what's planned next.

## 2026-07-29 — Multi-select, account settings, undo delete, search, stats, detail-modal, and board-tabs fixes

- **Stats page** (`/stats`) — headline totals, bars by publisher and decade, a
  rating histogram, a release-year timeline, and leaderboards for series, cover
  artists, authors and characters. No new API route: the maths is a pure module
  (`src/lib/stats.ts`) reducing over the comics list `useComics()` has already
  cached, so arriving from the board is instant and an upload refreshes the
  numbers through the same invalidation as everything else.
  **The time axis is `coverDate`, not `createdAt`** — when a comic was uploaded
  is an artifact of data entry; uploading a 1965 issue today is a 1965 data
  point. Per-year counts rather than a cumulative line, since a running total of
  release years would only restate the collection size.
  **Every breakdown sums to the collection**: comics with no publisher, cover
  date or rating land in their own bucket and a truncated top-N carries the rest
  in "Other", because bars that silently don't add up can't distinguish a small
  collection from missing metadata. Asserted as an invariant in the unit tests.
  Bars are drill-through links built through `filtersToParams`, so they can't
  drift from the URL contract the board parses; the rating histogram is
  deliberately unlinked, as there's no rating filter to send anyone to.
  No charting dependency — Recharts measured at 117 KB gzipped and would have
  earned it on one card, while the other three visuals are label+bar+count rows
  where hand-rolled markup is *better*, each row being a real `<a>`.
  **Two bugs the screenshots caught that the DOM assertions couldn't:** a
  single-point timeline drew a diagonal ramp from zero — inventing a growth
  story the data never told, where the honest render is a flat line — and muted
  buckets used `bg-border`, so "Unrated: 25" rendered as an invisible outline on
  the surface colour. Same lesson as the clipped typeahead dropdown: structural
  assertions can't see what a chart *implies*.
- **Stubbed the metadata provider in the integration suite**, so the Metron
  autofill flow finally has UI coverage. It structurally couldn't before: the
  panel self-hides without a configured provider and CI has no
  `METRON_API_KEY`, so a headline feature was only ever checked by hand against
  a rate-limited API. Now faked at the network boundary with
  `page.setRequestInterception` across four routes (config, search, detail,
  cover proxy) — deterministic, offline, and runnable in CI.
  **It found a real bug on its first run:** the picked-cover card keyed its
  status off `coverLoading || !cover`, so a *failed* cover fetch (done loading,
  but `cover` still null) showed "Loading cover…" forever — the error toast is
  transient, so the only lasting signal was a spinner that would never resolve.
  Most likely trigger is the `ALLOWED_COVER_HOSTS` allowlist (currently just
  `static.metron.cloud`), which would fail every cover the day Metron adds a CDN
  host. Fixed with a distinct `coverError` state and a persistent message.
- **Series typeahead on the provider-search box too.** The upload panel's
  "Series and issue" field now suggests series you already own — the common case
  being "add the next issue of a run I collect". Suggestions come from the local
  cached `/api/meta`, never the provider: a remote typeahead would fire a
  rate-limited third-party call per keystroke. Series-only (that's the grain the
  external API searches), so the field label is dropped as redundant while the
  count — issues of that run already owned — is kept. Picking leaves a trailing
  space so the caret is ready for the issue number, which also self-hides the
  list once a digit is typed.
  The shared behaviour moved into `Typeahead.tsx` (`useTypeahead` +
  `SuggestionList`), headless so the two very different layouts keep their own
  markup. Two bugs fixed in the process: the list is now **portalled** — in
  place it was silently clipped by `Dialog`'s `overflow-hidden`, slicing the
  first row in half (found by looking at it, now asserted structurally) — and
  Escape stops propagating so dismissing the list no longer closes the whole
  upload dialog.
- **Search autocomplete.** The top-bar search now has a typeahead dropdown of
  terms that actually exist in the collection, built entirely from the
  already-cached `/api/meta` payload — no new endpoint. Suggestion sources
  mirror the free-text haystack exactly (series, publisher, authors, artists,
  characters, tags; `issueNumber` excluded from both, deliberately). Ranked
  prefix-matches-first, then by how many comics carry the value, then
  alphabetically; capped at 5. Values appearing in several fields collapse to
  one row — "Batman" is both a series and a character, and both would run the
  identical search — with the survivor chosen by a stated field priority
  (character first) so the outcome is predictable. Case-insensitive throughout,
  including the dedupe key. Picking a suggestion fills the box and applies
  immediately, bypassing the typing debounce; it deliberately does *not* jump to
  applying the value as a facet filter. Full keyboard support (arrows, Enter,
  Escape) with `aria` combobox/listbox wiring — new work, since the existing
  `Autocomplete` component has no keyboard navigation at all.
- **Fixed two `react-hooks` lint errors** in `BoardView`'s search re-sync: it
  read a ref during render, which isn't safe under concurrent rendering (the
  value can come from a render that was thrown away). The "last value I pushed"
  tracker is now state, written only from event handlers. These had gone
  unnoticed because `AGENTS.md` wrongly claimed the repo had no working linter —
  that note is corrected, and it now also records that CI does *not* run lint.

- **Root-caused the "flaky" integration suite (item 4e): it was testing a
  deleted database.** Interrupting a run orphaned the test server (teardown
  lived only in a `finally`, which signals skip); the orphan kept port 3940
  and its open sqlite fds, so it served the *previous* run's database even
  after the next run deleted and re-seeded — while that run's own server died
  of `EADDRINUSE` into an undrained stdio pipe, and `waitForServer()` (which
  only checked for a 200) accepted the orphan. Hardened
  `tests/integration/lifecycle.mjs`: pre-flight the port and fail in 0.1s with
  the fix command, drain and surface server output, bail early if the server
  exits, kill the whole process group, and tear down on
  `SIGINT`/`SIGTERM`/`SIGHUP`.
- **Split `tests/integration.mjs` into per-feature files** —
  `tests/integration/{env,lifecycle,helpers}.mjs` plus one file per feature
  area under `tests/integration/features/`, with the entry point reduced to
  setup/teardown and run order. Pure reorganization; same single build,
  server, and browser page, same assertions.
- **Test-coverage gap fill (item 4d, reframed from a planned spec doc).**
  Rather than write a separate markdown spec, treated the test suites
  themselves as the spec and audited for behaviors with no test at all. Added
  6 new tests: `navOrder.neighbors()` unit coverage, and integration coverage
  for detail-modal click-to-edit-per-field, modal arrow-key prev/next
  navigation, add/remove board membership (single + bulk), the cover-replace
  flow, and the sign-up flow. `GET /api/export` is now exercised directly via
  `fetch` rather than the real UI control, since clicking the account menu's
  export button triggers a real page navigation to a binary response that
  crashes headless Chrome. Found and fixed one real bug along the way: a bulk
  "remove from board" test left a board empty that a later, unrelated test
  depended on being non-empty. See `ENGINEERING_NOTES.md` for the fuller
  story.
- **List-view multi-select + bulk actions.** A leading checkbox column with
  shift-click range-select, and a bulk action bar for add to board / remove
  from board / set publisher / add tag / delete — each looping an existing
  single-comic mutation rather than a new batch endpoint. Bulk delete reuses
  the undo-delete toast, restoring all of them from one "Undo." Bulk tag is
  additive (unions into each comic's existing tags, doesn't overwrite them).
  Grid-view marquee-select was deliberately left for later.
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
