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

Soft delete + a 6s undo toast, swept after 24h. → `CHANGELOG.md`

## 2. Collection features *(independent; pick by taste)*

### 2a. Multi-select + bulk actions — list view shipped (2026-07-29)

List-view multi-select and the bulk action bar shipped. → `CHANGELOG.md`

**Grid-view marquee-select — still open**, deliberately deferred rather than
bundled. The reasoning is unchanged and worth keeping:

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

### 2c. Stats page — *shipped 2026-07-29*

`/stats`: headline totals, publisher and decade bars, a rating histogram, a
release-year timeline, and four leaderboards. Shipped as predicted — a new page
and charts, no new API route. → `CHANGELOG.md`

### 2d. Collector fields — *skipped (decided 2026-07-29)*

Would have added `purchasePrice`, `currentValue`, `grade` (CGC-style),
`condition` on comics — a schema migration + form fields + optional
list-view columns + a total-value stat. Skipped: this is what would have
turned "cover gallery" into "collection tracker," but that's a different
product than the one being built — the app is oriented around *seeing*
covers, not appraising or inventorying them. Revisit only if that framing
changes.

### 2e. Autocomplete the collection search — shipped (2026-07-29)

A typeahead on the top-bar search built from the already-cached `/api/meta`
payload — no new endpoint. Later extended to the provider-search box
(series-only) via the shared headless `Typeahead`. The ranking, dedupe and
keep-series decisions, with the measurements behind them, are in
`CHANGELOG.md`; the two dialog bugs it surfaced (clipped dropdown, Escape
closing the modal) are in `ENGINEERING_NOTES.md`.

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

### 4a. Dockerize the app — *deferred (decided 2026-07-29)*, ~half a day when wanted

Deferred with the plan intact: containerising buys **portable deployment**, and
there's nowhere it needs to deploy right now. Local dev (`npm run dev` on 3939)
already works, the integration suite and browser-check already isolate
themselves via `DATA_DIR`/`DATABASE_PATH`, and nothing currently blocks on this.
Pick it up when there's an actual host to run on.

Two things learned while scoping it that are worth keeping:

- **Local dev survives Docker untouched** — it's additive, not a replacement.
  The one real way it could break local dev: `better-sqlite3` and `sharp` are
  both native, so bind-mounting `node_modules` into the container (or running
  `npm install` inside a container with the repo bind-mounted) overwrites the
  host's darwin/arm64 binaries with linux ones and `npm run dev` then dies on
  `invalid ELF header`. Install deps *inside* the image; never bind-mount
  `node_modules`. Recovery: `rm -rf node_modules && npm install` on the host.
- **A `.dockerignore` has to land with the Dockerfile, not after.** There isn't
  one today, and `data/` is ~67MB of the real collection — without it the build
  context ships the personal database and covers to the daemon, and they can end
  up baked into an image layer.

**Exposing the app anywhere beyond localhost is gated on 4g below** — that's the
part with actual risk, and it's independent of how the app is packaged.

When built, the specifics this app needs:

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

### 4d. Spec-driven behaviors — shipped as a test-coverage pass (2026-07-29)

Reframed on contact: a written spec doc would have restated behaviour the tests
already encode and then drifted from it. Filled the actual coverage gaps
instead, so the assertions *are* the spec. → `CHANGELOG.md`

### 4e. Integration-test-harness flakiness — root-caused and fixed (2026-07-29)

The suite was never flaky: an orphaned server from an interrupted run kept the
port *and* its open file descriptors, so it served an already-deleted database
while the freshly-seeded one sat unused. Fixed with a port pre-flight and
crash-safe teardown. Full write-up in `ENGINEERING_NOTES.md`.

### 4f. Stub the metadata provider in the integration suite — shipped (2026-07-29)

The Metron autofill flow had no UI coverage and structurally couldn't: the panel
self-hides without a configured provider, and CI has no `METRON_API_KEY`. Now
faked at the network boundary. Stubbing turned out to be *better* than the real
API rather than a compromise — deterministic, offline, no quota, and able to
drive states that are awkward to find on demand. It found a real bug on its
first run. → `CHANGELOG.md`

### 4g. Prerequisites before the app is reachable beyond localhost — not started

**Nothing here matters while the app only ever answers on `localhost`, and all
of it matters the moment it doesn't** — a VPS, a tunnel (ngrok/Cloudflare), a
LAN-exposed dev server, or a published container port. Independent of 4a:
packaging isn't what creates the exposure, reachability is. Written down because
this is the kind of thing that gets skipped precisely when it starts to count.

**Must fix first:**

- **No login rate limiting exists anywhere** (`src/lib/auth.ts`,
  `src/middleware.ts` — nothing). A public `/login` with email+password and no
  throttle is an open invitation to credential stuffing, and it's the single
  biggest change in risk on going public. better-auth has rate-limit config;
  alternatives are a proxy-level limit, Cloudflare Access, or fail2ban.

- **Decide the `/images/**` authorization story.** That route has *no* session
  check (zero `getUserId`), and `middleware.ts`'s matcher explicitly excludes
  `images`, so covers are served to anyone with the URL — no session, no expiry.
  The mitigating factor is that paths are `nanoid(14)` over a 36-char alphabet
  (~6×10²¹), so they aren't enumerable. But that's **obscurity, not
  authorization**: URLs leak via browser history, referrers, proxy logs, and
  anyone a link is ever sent to. Already logged as a prerequisite blocker for
  public sharing in §5 — the trap is that going remote makes it internet-facing
  without anyone deciding to.

**Must get right or auth silently breaks:**

- `BETTER_AUTH_URL` must match the public origin exactly — scheme, host *and*
  port. Mismatch gives `Invalid origin` on sign-in; leaving it unset makes
  better-auth derive the origin from the request, which behind a reverse proxy
  is usually wrong (it warns about this on boot).
- **Behind TLS termination, pass `X-Forwarded-Proto`.** The session cookie's
  `secure` flag follows the URL scheme, so an `https` `BETTER_AUTH_URL` with the
  cookie set over internal `http` means login appears to succeed and then
  bounces back to `/login` forever. Same two-sources-of-truth shape as the
  stale-cookie loop in `ENGINEERING_NOTES.md`.
- `BETTER_AUTH_SECRET` must be strong; production already refuses to boot
  without it. Rotating it later signs everyone out.

**Practical alternative that sidesteps all of it:** for remote *development*,
SSH port-forward (`ssh -L 3939:localhost:3939`) instead of publishing the port.
The browser still sees `http://localhost:3939`, so no auth-origin change, no TLS
or proxy setup, and neither risk above is ever internet-facing.

### 4h. Provider observability — not started, trigger-driven

**Triggered by a real question the codebase couldn't answer.** Asked "a lot of
variant covers aren't coming back recently, can we check the logs?", there were
no logs to check: the entire metadata layer contains exactly one `console.*`
(`metron.ts:118`, a rate-limit budget warning). Answering it required live calls
to a rate-limited third-party API, which is precisely what 4f exists to avoid.

**What the investigation found** (2026-07-29), recorded so it isn't repeated:

- Metron returns `variants: []` for the recently-added books — verified on
  *Absolute Batman* #1 and #5, *Action Comics* #1083, *Ultimate Wolverine* #3,
  *The Incredible Hulk* #23.
- **Our integration is correct.** Metron's OpenAPI schema defines
  `IssueRead.variants` as an array of `VariantsIssue { name, image }` — exactly
  the fields `metronCovers` reads — and *Something Is Killing the Children* #1
  (2019) returns 5 variants that render fine. So the pipeline works end to end;
  the data is missing upstream.
- Metron's variant records are community-contributed, so coverage lags new
  releases. A 2019 book has had six years for someone to fill it in; a 2026 book
  has had days. Expect this to keep happening on new comics.
- The response cache is **not** implicated: `cached()` short-circuits entirely
  when `NODE_ENV === "development"` (`cache.ts:22`), so a dev server never caches
  provider responses.

**What to build when it recurs:**

- Log what the provider actually returned — issue ref, cover count, variant
  count, and the rate-limit budget — so this becomes a `grep` rather than an
  investigation. Keep it server-side; the URL carries the API key, which
  `http.ts` already takes care never to leak into error messages.
- Say it in the UI. A record with only a main cover currently looks identical to
  one where variants failed to load. A line like *"Metron lists no variants for
  this issue"* turns a suspected bug into a known limitation — and there's now a
  sanctioned way forward, since **Use details only** (shipped 2026-07-29) lets
  you take the metadata and supply your own scan.

**Not urgent** because the workaround now exists and the cause is upstream. Worth
doing the next time the question is asked, rather than re-running the same
investigation.

## 5. Sharing — *skipped (decided 2026-07-29)*

Would have been public read-only board links. Not wanted. (Its two
prerequisites — `/images/**` having no session check, and the
globally-shared publisher/tag namespace having cross-user rename effects —
are still true of the app as-is; they're just not gating anything anymore.)

Note: the `/images/**` half of that **does** become live again under 4g, i.e. the
moment the app is reachable from anywhere but localhost — no sharing feature
required. Skipping sharing removed the *feature* that depended on it, not the
exposure itself.

## 6. Account settings — shipped (2026-07-29)

Change email/password from an account-menu dialog, on better-auth's built-in
endpoints — no new API route. → `CHANGELOG.md`

---

## Suggested order

What's actually active after review (2026-07-29):

**Nothing is queued on appetite.** With the stats page shipped, every remaining
item is **waiting on a trigger** — which is the point; none of it should be built
speculatively:

- **4a Dockerize** — when there's an actual host to deploy to.
- **4g exposure prerequisites** — *before* the app is reachable from anywhere
  but localhost. Not optional at that point; there's no login rate limiting and
  `/images/**` has no auth check.
- **4c server-side pagination** — only once list view gets janky or search stops
  feeling instant. 4b was skipped.
- **4h provider observability** — the next time "why didn't the provider return
  X?" gets asked. It was asked once already and cost live API calls to answer,
  because the metadata layer logs nothing; that finding is written up in 4h so
  the investigation isn't repeated.
- **Grid-view marquee-select** (the rest of 2a) — a stretch goal, not actively
  planned.
- ~~Sharing~~, ~~2b duplicate detection~~, ~~2d collector fields~~ — skipped,
  each with its reasoning recorded above.

Known and deliberately unfixed: the top bar overflows a ~390px viewport (the
avatar), on every page and predating the stats work. The app is desktop-first
and dark-only by design; fixing it is a header-responsiveness pass, not a
one-liner.

Shipped 2026-07-29: undo delete (1), list-view multi-select + bulk actions (2a),
stats page (2c), autocomplete search (2e), drag tabs to reorder (3), the
spec-driven-behaviors test-coverage pass (4d), the test-harness flakiness fix
(4e), the stubbed metadata provider (4f), and account settings (6).

Also shipped the same day, all from using the app rather than from this list —
which is why none of them were on it: **import provider details without the
cover** (Metron's variant coverage is patchy, so the picker's only exit was a
wrong image or nothing; the metadata was also being silently wiped when you
supplied your own scan), the **detail-modal cover painting behind its own
backdrop**, the **stats page's missing way back** (two attempts — see
`ENGINEERING_NOTES.md`), the **chrome rebuilding on every navigation**, and
**account-settings spacing**. See `CHANGELOG.md` for the detail.
