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

Select several covers (click-drag or shift-click) → add to board / remove
from board / tag / set publisher / delete.

**What's reusable vs. new:** every action maps to a mutation that already
exists per-comic (`useAddToBoard`, `useRemoveFromBoard`, `useUpdateComic`,
`useDeleteComic` in `src/lib/client-api.ts`) — no new API route is *required*
to make this work, a bulk action can loop the existing hook once per selected
id. The actual net-new work is selection state, which doesn't exist anywhere
in the app today (no shift-click, no marquee, no checkboxes).

- **Loop client-side vs. a batch endpoint:** looping is simpler and needs no
  server work, but is N HTTP round-trips, no atomicity (a mid-loop failure
  leaves some comics changed and some not), and wants manual cache-batching
  so it doesn't refetch N times. A real `PATCH /api/comics {ids, patch}`
  fixes all that but is new route + `db/queries.ts` work. Start with the
  loop; only build a batch endpoint if it's actually slow at real scale.
- **Tag/publisher aren't the same shape of edit.** Publisher is single-value
  per comic, so "bulk set publisher" is a plain overwrite. Tags (and
  authors/artists/characters) are a list per comic — reusing
  `useUpdateComic`'s patch naively would *replace* each comic's whole list,
  wiping existing tags. Bulk tagging needs to be additive: union the new tag
  into each comic's existing list, not overwrite it. Today's single-comic tag
  editing always submits the complete list it's showing, never a delta, so
  this additive path doesn't exist yet and needs its own logic.
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
  coexist carefully with the existing reorder gesture.
- **Suggested phasing:** ship list-view multi-select first (cheap, no
  gesture conflict); treat grid-view marquee-select as a stretch goal rather
  than bundling both into one pass.
- **No pagination exists to complicate "select all"** — `GET
  /api/comics?board=<id>` returns the whole board in one response (no
  `limit`/`offset`), and the full set already lives in memory client-side
  (grid virtualization only bounds the DOM, not the data). So a "select all
  N filtered comics" action is just operating on the in-memory filtered
  array — no special casing needed for an unloaded remainder. This would
  change if server-side pagination (item 4c) ever lands first.

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

### 4d. Spec-driven behaviors *(design-for, don't build yet)*

Convert the current feature set + ad-hoc test flows into structured
per-feature behavior specs the unit + integration suites map onto.

## 5. Sharing — *skipped (decided 2026-07-29)*

Would have been public read-only board links. Not wanted. (Its two
prerequisites — `/images/**` having no session check, and the
globally-shared publisher/tag namespace having cross-user rename effects —
are still true of the app as-is; they're just not gating anything anymore.)

## 6. Account settings — change email/password — ~half a day

Currently there's no way to change either. Confirmed by checking the code,
not assuming: no `changeEmail`/`changePassword` call anywhere in the app,
and the account menu (`TopBar.tsx`) only has "Export backup" and "Sign out"
— no settings surface exists at all.

**Both endpoints already exist server-side — this is UI work, not backend
work.** better-auth ships `changePassword` and `changeEmail` as core
endpoints (`node_modules/better-auth/dist/api/routes/update-user.mjs`),
already served by the existing `ALL /api/auth/[...all]` catch-all — no new
API route needed. `src/lib/auth-client.ts`'s `createAuthClient()` exposes
both as base client methods with no plugin required.

- **`changePassword` needs zero config changes.** Just `currentPassword` +
  `newPassword` from a form, calling `authClient.changePassword(...)`.
- **`changeEmail` needs one explicit config addition**, or it 400s. Its
  handler requires `user.changeEmail.enabled: true` (not set in
  `src/lib/auth.ts` today) and, since there's no email verification in this
  app at all (confirmed earlier — `emailVerified` is always `false`, never
  checked), it also needs `updateEmailWithoutVerification: true` — without
  *some* verification path enabled, the endpoint refuses to run at all. The
  config addition is small:
  ```ts
  user: {
    changeEmail: { enabled: true, updateEmailWithoutVerification: true },
  },
  ```
  Worth naming the coupling: `updateEmailWithoutVerification` only behaves
  this way *because* `emailVerified` is always false here. If real email
  verification is ever added later (see the "no email verification exists"
  finding from this session), this flag would need revisiting — it doesn't
  mean "always skip verification," it means "skip verification for
  not-yet-verified users," which today is everyone.
- **No UI surface exists for this at all** — needs a new "Account settings"
  entry point (a menu item off the existing account menu → a dialog or
  page) with two forms.

---

## Suggested order

What's actually active after review (2026-07-29), in order:

1. **Undo delete** (1) — the remaining data-safety gap.
2. **Account settings** (6) — change email/password; a real, basic gap, and
   most of it (both endpoints) already exists server-side.
3. **Multi-select + bulk actions** (2a), **stats page** (2c), **autocomplete
   search** (2e) — by appetite; 2b and 2d were skipped.
4. **Dockerize** (4a) whenever portable deployment matters — doesn't depend
   on anything else here. **Server-side pagination** (4c) only once one of
   its two concrete signals shows up (list view gets janky, or search stops
   feeling instant); **spec-driven behaviors** (4d) whenever process
   overhead is justified. 4b was skipped.
5. ~~Sharing~~ — skipped.

Drag tabs to reorder (3) shipped 2026-07-29.
