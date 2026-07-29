# Roadmap

What's planned next, in recommended order. Effort estimates are rough
single-dev figures. For what's already shipped, see
[`CHANGELOG.md`](./CHANGELOG.md).

Each numbered item below is a multi-file feature with product/architecture
decisions still to make — open a planning pass (scope, schema, API shape, UI
flow) before writing code; don't cold-start one from a bare item description
(see `AGENTS.md`).

---

## 1. Undo delete — shipped (2026-07-29)

Soft delete via `comics.deletedAt`; every read query excludes it. A "Cover
deleted" toast with an "Undo" action for 6s (`ComicCardMenu.tsx`,
`ComicDetail.tsx`); undo clears `deletedAt`. Actual row + file removal is
deferred to `sweepDeletedComics` (rows deleted >24h ago), run once per server
start via `src/instrumentation.ts`. See `CHANGELOG.md`.

## 2. Collection features *(independent; pick by taste)*

### 2a. Multi-select + bulk actions — list view shipped (2026-07-29)

List-view multi-select shipped: a leading checkbox column, shift-click
range-select, and a bulk action bar (`BulkActionBar.tsx`) for add to board /
remove from board / set publisher / add tag / delete — each looping an
existing single-comic mutation, no new API route. Bulk delete reuses the
undo-delete toast (soft-delete + a single "N comics deleted — Undo" that
restores all of them). Bulk tag is additive (unions into each comic's
existing tags), not an overwrite. See `CHANGELOG.md`.

Grid-view marquee-select was intentionally deferred (see phasing decision
below, still accurate) — not started.

- **Selection UX differs a lot by view.** List view (`ListView.tsx`) is the
  easy case: unvirtualized, every row always mounted, order is array index —
  a leading checkbox column + shift-click range-select is straightforward.
  Grid view is virtualized (only on-screen cards are mounted), but the
  layout geometry (`masonry-layout.ts`'s `layout.placements`) is computed for
  the *entire* list regardless of what's mounted, so a marquee-select
  rectangle can hit-test against that full coordinate map without needing
  every card in the DOM — not the blocker it looks like. The real friction:
  dnd-kit's drag sensor already claims pointerdown+drag on every card (for
  reorder), so a marquee gesture needs to start only from empty canvas, or
  coexist carefully with the existing reorder gesture. Treat grid-view
  marquee-select as a stretch goal, not bundled with this.
- **No pagination exists to complicate "select all"** — `GET
  /api/comics?board=<id>` returns the whole board in one response (no
  `limit`/`offset`), and the full set already lives in memory client-side
  (grid virtualization only bounds the DOM, not the data). This would change
  if server-side pagination (item 4c) ever lands first.

### 2b. Duplicate detection at upload — *skipped (decided 2026-07-29)*

Would have stored a perceptual hash (dHash) per comic and warned on upload
if a new cover looked like one already owned. Skipped: a dHash can't tell
"accidental re-upload" apart from "uploading a higher-res scan of a comic I
already own" — resolution doesn't change the downsampled fingerprint, so a
genuine resolution upgrade would trigger the same warning as a mistake. That
upgrade case already has a dedicated path (**Replace cover**, shipped
2026-07-28), so the warning would mostly add friction to a real workflow
rather than catch real duplicates. Revisit only if accidental re-uploads
turn out to be an actual recurring problem.

### 2c. Stats page — ~1 day

Counts by publisher / decade / artist, rating distribution, growth over time.
One page of charts; makes the collection browsable in a new way.

**What's reusable vs. new:** `getMeta` (`src/db/queries.ts:586`) already runs
real `GROUP BY … count(*)` queries for series/publisher/author/artist/
character/tag, scoped to the user — publisher- and artist-count charts are
close to just rendering that existing output instead of a filter dropdown.
Not computed anywhere yet: rating distribution, cover-date decades, and
growth-over-time (`createdAt`) — none of those group by a date or the
numeric `rating` field today.

- **Client-side bucketing, not new SQL.** The app already computes
  everything view-related (filters, sort, facet counts) client-side against
  the full in-memory comics list, because "My Comics" fetches the user's
  entire collection in one shot with no pagination (see 2a's notes on this).
  Decade-bucketing (`Math.floor(year/10)*10` off `coverDate`, with an
  "unknown date" bucket for comics missing one) and a rating histogram (10
  half-star buckets + an "unrated" bucket) are both cheap array reduces over
  data that's already loaded — consistent with that pattern, and needing no
  new API route. Growth-over-time (comics added per month/year, off
  `createdAt`) is the same shape.
- **Net result:** this can plausibly ship as "new page + charts" only —
  `getMeta` covers the name-valued counts as-is, and the date/rating buckets
  are pure client-side logic off data the board already fetches.

### 2d. Collector fields — *skipped (decided 2026-07-29)*

Would have added `purchasePrice`, `currentValue`, `grade` (CGC-style),
`condition` on comics — a schema migration + form fields + optional
list-view columns + a total-value stat. Skipped: this is what would have
turned "cover gallery" into "collection tracker," but that's a different
product than the one being built — the app is oriented around *seeing*
covers, not appraising or inventorying them. Revisit only if that framing
changes.

### 2e. Autocomplete the collection search — ~half a day

The top-bar search (`TopBar.tsx`, wired through `BoardView.tsx`'s debounced
search) is plain free-text. Add a typeahead dropdown suggesting matches from
the **current collection** — `getMeta` already returns the series /
publisher / author / artist / character / tag lists (the same source that
already powers `MetadataForm`'s per-field autocomplete), so this is entirely
client-side: filter those on input, show a grouped suggestion list, and
selecting one sets the search term. No view-splitting complexity like 2a —
`TopBar` is the one shared search input for both grid and list view.

- **Not a drop-in reuse of `Autocomplete.tsx`.** That component is built for
  a single flat list of same-type strings bound to one field (e.g. just
  series names). This wants a dropdown that searches *across* five or six
  categories at once and shows them grouped ("Series: Batman", "Author: Bill
  Finger") — a different shape of dropdown. What's reusable is the
  underlying pattern (filtered-list-of-8, `onMouseDown preventDefault` so a
  click doesn't lose to the input's blur, keyboard nav), not the component
  itself as-is — this is realistically a new component built the same way.
- **Picking a suggestion should just fill the search box**, running the same
  free-text search as if typed — not jump straight to applying that facet
  as a filter. The facet-jump alternative is more powerful but is exactly
  the "one control, two different behaviors depending on what you clicked"
  ambiguity that was already flagged and fixed once (list-view chips vs.
  modal chips).
- **Include tags in the suggestion set.** Free-text search already matches
  tags and issue number; if the dropdown only suggests from
  series/publisher/author/artist/character, it under-suggests relative to
  what search actually matches. Keep the two in sync.

## 3. Board interaction

**Drag tabs to reorder boards — shipped** (2026-07-29, drag a card onto a
tab was skipped — not wanted). See `CHANGELOG.md`.

### Smart boards — *skipped for now (decided 2026-07-29)*

Would have been a board backed by a stored filter query (e.g. "Publisher =
DC, Tag = Key Issue") instead of a fixed membership list — its contents
recomputed live against the current collection every time it's opened,
rather than frozen at creation time like today's "save view as board." The
real complication wasn't storage (`Filters` is already plain JSON and
round-trips through the URL) but that every board-membership affordance
today — manual reorder, add/remove individual cards — assumes a
`board_comics` join row per member, which a filter-driven board wouldn't
have; those would need to be conditionally disabled for a smart board.
Revisit if boards going stale after creation becomes an actual annoyance.

## 4. Infrastructure

### 4a. Dockerize the app — ~half a day

A multi-stage `Dockerfile` (deps → build → runtime) so the app runs as one
portable container instead of a local Node install. Specifics this app
needs:

- Pin the base image to **Node 22** — matches `.nvmrc`; Next 16's in-build
  TypeScript-check worker crashes on Node 25 (see `README.md` "Requirements").
- `better-sqlite3` is a native module — rebuild it for the container's
  platform in the build stage (or use a prebuilt binary matching the base
  image) rather than copying a host-built `node_modules`.
- Volume-mount the data dir (sqlite db + `data/covers/`) so collection data
  survives container restarts/rebuilds — this is exactly what
  `AGENTS.md`'s throwaway-instance pattern already isolates via `DATA_DIR`/
  `DATABASE_PATH`, so the same env vars drive the volume path.
- Env vars for `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` (must match the
  published port — see the README gotcha), `DATA_DIR`, `DATABASE_PATH`.
- Run `db:migrate` on container start (not `db:seed` — that's dev-only and
  destructive against real data).
- A `docker-compose.yml` for single-command local up is a natural add-on,
  not required for the base image to be useful.

### 4b. Cloud storage — *skipped (decided 2026-07-29)*

Would have swapped the `StorageAdapter`'s local-FS implementation for S3/R2.
No stated need for it; local FS is fine for a personal, single-machine
collection. Revisit only if the app ever needs to run somewhere without a
persistent local disk (e.g. certain hosting platforms), which Dockerizing
(4a) doesn't by itself force — a container can still mount a local volume.

### 4c. Server-side filtering + pagination *(design-for, don't build yet)*

For very large collections — the board is already client-side virtualized
(bounded DOM), so this is only needed once the full-board payload itself
(all comics in memory) gets too big; at that point facet counts, global
sort, and search move server-side too.

**The concrete signal, not a comic count:** at current scale (hundreds of
comics) there's no issue. The first place this would actually show up is
**list view**, since — unlike grid view — it has no DOM virtualization at
all (`ListView.tsx` mounts every row unconditionally); a very large
collection would render thousands of `<tr>`s at once there before grid view
felt any different. The second signal would be **typing in search/filters
starting to feel laggy** — `applyFilters`/`sortComics`/`computeFacets` all
recompute over the *entire* in-memory list on every keystroke/filter change
(grid virtualization only bounds what's mounted in the DOM, not how much
gets recomputed). So: if list-view scrolling gets janky, or search stops
feeling instant, that's the actual trigger — not a specific number of
comics, since it depends on how much metadata (authors/tags/etc.) each
comic carries.

**Why not build it now "just in case":** this isn't free optimization —
building it early has a real cost, not a neutral one. The whole app's
interaction model depends on having the full dataset in memory: filtering,
sorting, faceting, and search are all instant precisely *because* they're
pure client-side functions over data already in hand, which is what makes
DESIGN.md's stated quality bar — "fluidity: every interaction animates
smoothly with no layout jank" — achievable at all. Moving any of that
server-side turns "instant animated reflow" into "network round-trip, then
reflow," a real UX regression, not a neutral architecture swap. It also
raises design questions that don't have answers yet and shouldn't be
guessed at: does drag-reorder (`swapReorder`) work across a page boundary,
and what does dropping onto an unloaded item even mean? Building broad
server-side infrastructure now means guessing at the shape of a bottleneck
that doesn't exist yet — real usage would reveal *which piece* actually
needs it (maybe only list view, maybe only facet counts, maybe search but
not sort), and building ahead of that risks solving the wrong piece. Wait
for one of the two signals above.

### 4d. Spec-driven behaviors — reframed as a test-coverage pass (shipped 2026-07-29)

Originally scoped as a separate markdown spec file the test suites would map
onto. Reframed: a spec file that just restates what the tests already check
is redundant with the tests themselves — the integration/unit suites *are*
the executable spec (each `ck(...)` and `it(...)` names a behavior in plain
language). So instead of writing a spec doc, this became a coverage audit —
find behaviors with no test at all, not behaviors with an undocumented test —
which surfaced 13 real gaps. The 6 high-priority ones were filled:

- `navOrder`'s `neighbors()` (`src/lib/nav-order.test.ts`, new unit tests) —
  middle/first/last/not-found/empty/single-item cases.
- Detail-modal click-to-edit-per-field (integration): clicking a display
  field focuses that field in edit mode.
- Modal arrow-key prev/next navigation (integration): `ArrowRight`/
  `ArrowLeft` move between comics and the URL reflects it.
- Add-to-board / remove-from-board, single and bulk (integration).
- Cover-replace flow (integration): uploading a new file changes the comic's
  `imageUrl` and shows a toast.
- `GET /api/export` (integration): tested the route directly via `fetch`
  rather than the real UI control, since clicking the account menu's export
  button does a real `window.location.href` navigation to a binary response —
  headless Chrome has no download behavior configured, and that navigation
  crashed the whole Puppeteer session. The actual gap was route coverage
  (auth + headers + content), not proving the click fires.
- Sign-up flow (integration): a brand-new account lands on an empty board,
  not the seed data.

Along the way, found and fixed one real bug: a bulk "remove from board" test
emptied a board a later, unrelated test depended on being non-empty
(`BoardView.tsx` swaps to a no-toolbar empty state at 0 members) — state
pollution between tests, fixed by restoring the board's original membership
after the test. See `ENGINEERING_NOTES.md` for the fuller story, including a
separate, pre-existing flakiness issue (an unrelated facet-count assertion
varying across repeated full-suite runs) that was investigated and
determined *not* to be caused by this work, then deliberately not chased
further.

Splitting `tests/integration.mjs` into per-feature files was considered as a
followup to this reframing, deferred at first, then done right after: the
single ~950-line script is now `tests/integration.mjs` (a thin orchestrator —
env setup/teardown + run order) plus `tests/integration/{env,lifecycle,
helpers}.mjs` and one file per feature area under
`tests/integration/features/` (auth, account settings, export, board view,
detail modal, board membership, comic lifecycle, list view, bulk actions,
board tabs). Pure reorganization, not a behavior change — the suite shares
one Next build, one server, and one browser page across all of it, since
later features depend on state earlier ones leave behind (the modal's `cid`,
the board's `N`, list view leaving the page in list mode for bulk-actions to
continue from); each feature file documents its own preconditions/what it
returns for the next one rather than pretending to be fully isolated.

### 4e. Integration-test-harness flakiness — root-caused and fixed (2026-07-29)

The suite wasn't flaky; it was intermittently testing **a different server
serving an already-deleted database**. Interrupting a run (Ctrl-C on a failing
test) orphaned the `next-server`, because teardown lived only in a `finally`
block that signals skip. The orphan kept port 3940 *and* its open
`better-sqlite3` file descriptors, so it went on serving the previous run's
database even after the next run deleted `data/test` and re-seeded — POSIX
keeps an unlinked inode alive while an fd references it. The next run's own
server then failed with `EADDRINUSE` into an undrained stdio pipe (invisible),
and `waitForServer()` — which only checked "does the port answer 200?" —
happily accepted the orphan. Mutations accumulated across runs in a deleted
database, and assertion counts drifted.

Fixed in `tests/integration/lifecycle.mjs`:

- `assertPortFree()` pre-flights the port *before* the build and fails in
  ~0.1s with the `lsof` command to fix it, rather than burning a full build
  cycle to produce wrong answers.
- `startServer()` drains stdout/stderr into a bounded tail (the previous
  unread `stdio: 'pipe'` was also a latent deadlock at ~64KB) and runs
  `detached` so teardown can signal the whole `npx` → `npm exec` →
  `next-server` group instead of just the direct child.
- `waitForServer()` bails immediately with the server's output if it exited,
  instead of looping 60s and reporting a bare "did not become ready".
- `installSignalTeardown()` handles `SIGINT`/`SIGTERM`/`SIGHUP`, so
  interrupting a run — the thing that created every orphan — cleans up.

Verified: the port guard fires in 0.1s; a mid-run SIGINT now leaves no
orphan and no leftover dirs; the full suite still reports the same 74 passes.
See `ENGINEERING_NOTES.md` for the forensics (an `lsof` showing six open fds
to a database directory that `ls` said didn't exist).

## 5. Sharing — *skipped (decided 2026-07-29)*

Would have been public read-only board links. Not wanted. (Its two
prerequisites — `/images/**` having no session check, and the
globally-shared publisher/tag namespace having cross-user rename effects —
are still true of the app as-is; they're just not gating anything anymore.)

## 6. Account settings — shipped (2026-07-29)

Change email/password via a new "Account settings" dialog off the account
menu (`AccountSettingsDialog.tsx`), backed by better-auth's built-in
`changeEmail`/`changePassword` endpoints — no new API route was needed,
just `src/lib/auth.ts`'s `user.changeEmail` config flag (see `CHANGELOG.md`).

---

## Suggested order

What's actually active after review (2026-07-29), in order:

1. **Stats page** (2c), **autocomplete search** (2e) — by appetite; 2b and 2d
   were skipped. Grid-view marquee-select (the rest of 2a) is a stretch goal,
   not actively planned.
2. **Dockerize** (4a) whenever portable deployment matters — doesn't depend
   on anything else here. **Server-side pagination** (4c) only once one of
   its two concrete signals shows up (list view gets janky, or search stops
   feeling instant). 4b was skipped.
3. ~~Sharing~~ — skipped.

Undo delete (1), drag tabs to reorder (3), account settings (6), list-view
multi-select + bulk actions (2a), and the spec-driven-behaviors test-coverage
pass (4d) shipped 2026-07-29.
