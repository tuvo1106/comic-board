# Changelog

Notable work, newest first, grouped by theme rather than one line per commit —
`git log` has the full detail. This is the record of **what shipped**; see
[`ROADMAP.md`](./ROADMAP.md) for what's planned next.

## 2026-07-31 — Cover upscaling, with preview and revert

- **Upscale a cover from the detail modal, compare it, then keep or discard.**
  Opening the dialog starts the run — there's a single scale, so a confirm step
  would only have said "yes really" — and you land on a before/after slider with
  the two covers at matched display size, which is the only way to see what the
  model actually changed.
  Motivated by the collection's actual shape: the median stored cover is
  **600px wide** and 334 of 392 are under 700px, because most arrived through
  Metron's "Use this cover", whose CDN images are around that size. The app's
  own 1600px cap was never the constraint — only 6% of covers reach it — so
  raising it would have changed nothing.
- **Nothing is committed until you accept.** The preview is a real stored image
  in its own folder that no comic points at, so declining costs a deleted
  folder and the comic is never touched. That property is the one the
  integration test protects hardest; a preview that quietly mutated the cover
  would be the same dead-end class as the two cover bugs fixed earlier today.
- **Every upscale converges on a 2400px ceiling** rather than a raw 4× of
  whatever the source happened to be. 4× a typical 600px cover lands there
  naturally, but as a *cap* it also stops an already-1600px scan becoming a
  6400px file that's slow to produce, heavy to store, and no sharper on screen.
  Shared by the route and the dialog from one constant so the preview can't
  promise a size the server won't store.
- **Accepting is reversible.** `comics.original_image_path` (migration 0006,
  a single additive column) keeps the cover that was replaced, and the detail
  view grows a "Revert to the original cover" action. It's written only when
  still null, so upscaling twice still reverts to the *true* original rather
  than to a generated intermediate — asserted directly, since that's the kind
  of thing that looks right until the second run.
- **Gated on a binary you install** (`UPSCALER_BIN`), exactly as
  `METRON_API_KEY` gates autofill: unset means the action isn't rendered at all,
  rather than present and failing on click. Upstream Real-ESRGAN has no Homebrew
  formula, so `.env.example` points at Upscayl's bundled ncnn binary
  (`brew install --cask upscayl`) — the GUI is just a wrapper, and the binary and
  its models run standalone. Default model is `digital-art-4x`, the illustration
  model in that set. The upscaler sits behind a one-method interface shaped like
  `StorageAdapter`, so a beefier GPU box on the LAN is a drop-in later without
  callers changing.
- **Pixel dimensions are now visible where the decision gets made**: on the
  cover in the detail view, and as a sortable **Size** column in list view.
  Sorting ascending surfaces the smallest covers — the upscale candidates —
  which is not something you can eyeball one cover at a time across 400 of them.
  Ranked by total pixels rather than width, so a wide-but-short scan doesn't
  outrank a properly large one.
- **Shaped by using it on the real collection.** The dialog runs the upscale on
  open and lands on the comparison; a confirm step with one scale only said "yes
  really". The wait is a spinner and the size it's heading for — which upscaler
  is wired up is a deployment detail, and naming it there made the wait read
  like a config screen. Overlay controls on the cover went translucent (they
  were covering artwork) and go opaque on hover. The list header is sticky, so
  the sort controls survive scrolling.
- **The compare view's blurred backdrop shipped invisible first.** The compare
  stack has to sit at the cover's exact aspect ratio for the two images to stay
  in register, so it filled its own box edge to edge with nowhere for the blur to
  show. It's now an outer padded box with the stack floating inside — the same
  relationship the detail modal has between its cover panel and the cover. The
  test that would have caught it is geometric, and deliberately checks that the
  backdrop is a *different element* wrapping the stack: comparing rectangles
  alone wouldn't have worked, since `scale-110` makes even a fully covered layer
  measure larger.
- **The dialog sizes itself to whichever state is showing** — narrow while
  working, wide once there's a comparison worth the room — and animates between
  the two rather than jumping. One width for both had left the spinner marooned
  in a panel sized for something else.
- **Each fact stated once.** The running state dropped its "Upscaling…" caption
  (the dialog is titled *Upscale cover* and a spinner already means "working")
  and its model/backend block, leaving only the size you're getting. The
  comparison dropped its size readout for the same reason. The cover's
  dimensions moved off the artwork entirely, into a file-info line beside the
  revert action: both describe the *image* rather than the comic, neither is
  editable, and three overlays on the art was two too many.
- **Testing:** the flow runs end-to-end in the browser suite against a stub
  binary that honours the real one's `-i/-o/-s` contract and genuinely enlarges
  via sharp — real route, real `processUpload`, real accept/revert, fake pixels.
  A no-op copy would have made "did it actually get bigger?" unassertable, which
  is the single most important thing to prove here. No GPU or model download in
  CI, and no ~5s per image.
- **Honest limitation, noted in the dialog:** at 600px sources these models
  *invent* plausible detail rather than recovering what was lost. For a cover you
  care about, a real high-res scan through **Replace cover** still beats any
  upscale. The caveat lives in a tooltip rather than a paragraph — it's one-time
  context, not something to re-read on every run.

## 2026-07-31 — Add-modal fixes: recoverable image choice, and focus on open

- **Picking the wrong image had no way back.** Reported from real use. The
  details step's dropzone renders only when there's *no* preview, so the first
  image you chose was the one you were stuck with — no clear, no swap, short of
  closing the modal, which threw the metadata away with it. There's now a
  **Choose a different image** control under the preview.
  It swaps only the entry being edited, rather than reusing `addFiles` (which
  starts a fresh batch and would silently drop the rest of a multi-file queue).
  Re-selecting the *same* file after a rejected type/size works too — the input
  clears its value, or the browser reports no change and the retry does nothing.
  This is the same root gap as the details-only bug fixed earlier today: "has an
  image" was treated as "is finished with images".
- **Add now opens with the caret in the search box.** Search is the default mode
  and the first thing you do there, but it took a click first. The provider
  panel takes an opt-in `autoFocus`, passed from the choose step and from
  `ReplaceCoverDialog`'s search tab (which mounts only on an explicit tab
  switch) — but *not* the details step, where you've moved past searching and
  grabbing focus would fight you. `Dialog` already defers to a child's
  `autoFocus` before focusing the panel, and captures its focus-restore target
  during render precisely so a child can't clobber it, so this cooperates with
  the trap rather than racing it.
- Both covered in `metadata-autofill.mjs`. The focus test asserts the caret
  landed *and* that typing with no click reaches the box — focus can be set and
  stolen a frame later, and only the typing check catches that. The image test
  compares `naturalWidth` across the swap rather than trusting that something
  changed, and the multi-file case is now driven for the first time anywhere in
  the suite, since nothing else exercised the modal's queue.

## 2026-07-31 — All server-side logging goes to the log file

- **The Metron diagnostics now land in `data/logs/`, like everything else.**
  They'd been plain `console.*` on the reasoning that "a live diagnostic checked
  during development doesn't need the rotation/retention story". That was
  backwards, and mostly an artifact of sequencing — the Metron logging shipped
  hours before the file logger existed and wasn't revisited when it arrived.
  The question it exists to answer (roadmap 4h: *"variants aren't coming back
  **recently**, can we check the logs?"*) is retrospective and spans days, while
  terminal scrollback dies with the next server restart — so the logging that
  existed still couldn't answer the question it was built for. Metron calls are
  also the scarcest events in the app (a 20-call burst bucket) and so the last
  ones worth dropping, and `burstRemaining` is only meaningful as a trend.
- **Same for the other two runtime `console.*` calls**: the unhandled-500 detail
  in `handle()` (`tag: "api.error"`, with message + stack server-side while the
  client still gets a bare "Internal error") and the startup sweep
  (`tag: "startup"`). No `console.*` remains anywhere in the runtime path.
- **A dev console transport** was the reason none of this had to be either/or —
  outside production every line still prints to the terminal, so moving off
  `console.*` costs nothing at-a-glance. Silent under `NODE_ENV=test` so the
  unit suite doesn't print a wall of JSON.
- **Left alone on purpose:** the `src/db/*` CLI scripts (`db:migrate`,
  `db:seed`, `db:import`). Their stdout *is* their user interface — you run them
  to read the output — and a one-shot CLI invocation shouldn't quietly create
  and rotate log files.
- **Caught while verifying:** the first version of the 500 log used `message` as
  a meta key, which winston reserves — it folded the error text into the log
  line's own message instead of keeping it a separate greppable field. The unit
  test couldn't see it (spying the logger inspects meta *before* formatting);
  only reading real file output did. Renamed to `error`, and the test now
  asserts the meta carries no `message` key so the collision can't come back.

## 2026-07-31 — Fixed: couldn't swap an imported cover for your own

- **"I'll add my own image" did nothing once a cover was already imported.**
  Reported from real use. The details step hosts its own copy of the search
  panel, so the natural flow is: import a provider cover, notice it's the wrong
  variant, search again, pick the record, and choose *Use details only — I'll
  add my own image*. `useDetailsOnly` was just `setStep("details")` — a step you
  were already on — so it never released the held cover. And because the
  dropzone renders only when there's no preview, there was then no way to supply
  the replacement: a dead end that read as the button being broken.
  It now drops the held cover, so the dropzone comes back. Guarded twice: an
  image the **user** chose is never discarded (the provider only filled in
  fields around it, and throwing it away would destroy the one thing this flow
  exists to preserve), and neither is a multi-file batch, where removing one
  entry would renumber the rest mid-queue. Tracked with a new
  `coverFromProvider` flag, since "has an image" and "that image came from the
  provider" are different questions — the same distinction that split `Step`
  from `files.length > 0` when details-only first shipped.
- Covered in `metadata-autofill.mjs`, which had extensive details-only coverage
  that all started from the *choose* step with no cover imported — so the second
  time round, the case actually being reported, was the one path it missed. Both
  directions are asserted now: a provider cover gets cleared, a user's own file
  survives. Verified to fail against the pre-fix component.

## 2026-07-31 — Fixed: the cover-date filter wiped what you typed

- **Typing a date into the Date facet reset the field.** Reported from real use,
  reproduced in a browser: type `01/15/2020` into "Cover date from" and the year
  came back mangled — `0002-01-15` committed to the filter, and in headless
  Chrome the field emptied outright.
  Cause is the interaction of two things that are each fine alone. A
  `type="date"` input reports a **complete** value on nearly every keystroke in
  the year segment — typing `2020` yields `0002`, then `0020`, `0202`, `2020` —
  and filter state lives in the URL, where `router.replace` resolves
  *asynchronously*. The input was bound straight to the filter prop, so the
  first keystroke's `0002-01-15` round-tripped through the router and landed
  back as a prop while the user was still mid-year; React wrote it into the
  input and the accumulated digits were gone.
  Fix: the popover's inputs now own local drafts, making the URL strictly
  downstream while it's open — nothing writes back into a field being typed in.
  Commits on a 400ms settle, which also stops the board flashing through
  `0002`/`0020`/`0202` result sets on the way to the intended year. The drafts
  re-seed on open (the popover unmounts on close), so no prop-sync effect.
- **Checked the other two date inputs; both were already fine.** The list-view
  inline editor and the metadata form hold local React state and never touch the
  router, so there's no async write-back to clobber them — verified directly in
  a browser rather than assumed. The bug was specific to the one input whose
  state round-trips through the URL.
- **Filters had no integration coverage at all** — now they do
  (`tests/integration/features/date-filter.mjs`). It's a real regression test:
  it fails against the pre-fix component. Two things in it are deliberate and
  worth not "tidying" later: the inter-keystroke `delay`, without which the
  round-trip never lands mid-edit and the bug can't reproduce; and the
  upper-bound cutoff being derived from live data, since this runs late in the
  suite after earlier features have edited dates, and a hardcoded year
  eventually stops splitting the set — at which point the range assertions pass
  while proving nothing.

## 2026-07-30 — 1.0.0

Tagged **v1.0.0**. A read-through of the whole repo rather than new features:
everything below is a fix, a consolidation, or a test for something that had
none.

> Headings in this file are dated rather than versioned — it's an engineering
> log, not a semver changelog. Where a release is cut, the version is appended
> to the date so a tag can be traced back to its entry.

- **`authed()` replaces the auth preamble in every route.** All 21 handlers
  across 15 route files opened with the identical
  `const userId = await getUserId(req); if (!userId) return unauthorized();`.
  `src/lib/api.ts` now exports `authed(req, fn)` alongside `handle(req, fn)`:
  it resolves the session once and either hands the id to the handler or
  short-circuits with a 401. Net −61 lines across the routes.
  This also closes something the previous entry flagged and accepted: `handle()`
  attaches `userId` to its log line via *a second* `getUserId` call, so every
  authenticated request paid two session reads. `authed()` reuses the one it
  already did. `handle()` keeps the old behaviour for genuinely anonymous
  routes, and the error mapping both share moved into one `toErrorResponse`.
- **Fixed: `db:import --replace` orphaned replaced covers on disk.** `wipeUser`
  deleted each comic's folder as `covers/<comicId>`, but a comic id only equals
  its cover folder until the first **Replace cover** — after that the live image
  is at `covers/<newImageId>/`, so the wipe deleted an already-gone path and
  left the real folder behind on every restore. It now deletes
  `coverDir(imagePath)`, matching what `sweepDeletedComics` always did.
  This is the same bug class as the `buildBackupZip` fix on 2026-07-28, in the
  sibling code path that was missed; `coverDir` moved to `src/lib/storage.ts`
  so both callers share one definition with the invariant documented on it.
- **Tests for the three things above, plus the untested traversal guard.**
  New `src/lib/storage.test.ts` covers `coverDir`, the `getUrl`/`keyFromUrl`
  round-trip, and — newly — `resolve()`'s path-traversal rejection, which
  guards a route that serves files straight off disk from a user-supplied path
  and had no test at all. The import-orphan case is a real regression test:
  it fails against the old delete-by-comic-id code. 210 → 227 unit tests.
- **Repo hygiene.** `tsconfig.json` had six committed `include` entries for
  `.next-build`, `.next-build2`, `.next-build3` — dist dirs nothing references
  and which don't exist, auto-appended by Next when a build runs with a custom
  `NEXT_DIST_DIR`. AGENTS.md already documents reverting that; `.gitignore` now
  globs `/.next*` (as `eslint.config.mjs` already did) so a stray one can't be
  committed again. Added an `npm run typecheck` script — CI and AGENTS.md both
  spelled out `npx tsc --noEmit` — and dropped two genuinely unused exports
  (`nowMs`, `BoardRow`). `.env.example` now documents `DATA_DIR`,
  `DATABASE_PATH`, the `SEED_USER_*` trio, and `IMPORT_USER_EMAIL`, which were
  real knobs mentioned only in prose.

## 2026-07-30 — Provider observability, and a repo-wide docs cleanup ahead of 1.0

- **Every API route now logs to a daily-rotating file.** Started as "log the
  Metron provider" and grew, mid-implementation, into "log everything —
  comic create, login/out" once the actual ask became clear; confirmed before
  touching the 21 call sites it required. `src/lib/api.ts`'s `handle()`
  wrapper — already the one place all but one route funnels through — now
  logs `{tag:"api", method, path, status, ms, userId}` after every response,
  success or error. `userId` costs one extra session lookup per request (most
  handlers already do one for authorization); negligible at this app's scale,
  and it keeps every route's diff to "pass `req` in" rather than restructuring
  what each handler returns.
  The one route that doesn't go through `handle()` — better-auth's
  `/api/auth/[...all]` catch-all, which owns its whole request/response cycle
  — gets a thin equivalent wrapper, POST-only: every meaningful auth action
  (sign-in, sign-up, sign-out, change-email, change-password) is a POST, and
  this app has no OAuth, so the only GET traffic is `get-session` polling on
  nearly every page load — logging that would drown every real event in noise
  for zero diagnostic value.
  **First logging library in the repo:** `winston` + `winston-daily-rotate-file`,
  chosen over hand-rolling after the ask grew a real "write to disk, roll over
  daily" requirement — exactly the part a maintained library gets right
  (midnight-boundary writes, retention cleanup) that a first attempt often
  doesn't. Files land under `DATA_DIR/logs/<date>.log`, matching the app's
  existing convention for local runtime state (the sqlite db and stored
  covers both already live under `DATA_DIR`); 7 days kept. Verified against a
  real signed-in session, not just unit tests — `data/logs/2026-07-30.log`
  after a real sign-in + two authenticated requests:
  ```
  {"tag":"auth","method":"POST","path":"/api/auth/sign-in/email","status":200,"ms":54}
  {"tag":"api","method":"GET","path":"/api/comics","status":200,"ms":8,"userId":"…"}
  ```
- **Metron `detail()` calls log their own diagnosis.** Separately from the
  above (and shipped first): every call now logs issue ref, whether a main
  cover came back, the variant count, and the remaining rate-limit budget —
  `grep '"tag":"metron.detail"'` answers "why didn't variants come back"
  directly, instead of costing live API calls the way it did the first time
  the question came up (see roadmap 4h). Plain JSON via `console.log`, no
  library — a live diagnostic checked during development doesn't need the
  rotation/retention story a persisted historical log does. Also extended the
  existing low-budget warning from `search()`-only to `detail()` too, since
  both draw on the same 20-call burst bucket.
  **Deliberately not shipped here:** the UI half of 4h (distinguishing "no
  variants exist" from "variants failed to load" in the picker) was written,
  then reverted — the session's ask had narrowed to logging specifically, and
  bundling an unscoped UI change into it wasn't the right call once that was
  plain. Left for whoever picks up the rest of 4h.
- **Repo-wide documentation cleanup**, ahead of 1.0: `ROADMAP.md`'s shipped
  write-ups (225 of 551 lines were duplicating `CHANGELOG.md`) collapsed to a
  one-line summary + pointer each; `PROVIDERS.md` folded into `DESIGN.md` §4.1
  as the only doc that had been living under `src/`; docstrings added to
  API route handlers and other bare exports that actually needed one (most of
  an initial 169-export survey turned out already documented or self-evident
  — icon components, type guards, one-line query hooks — once a detector bug
  that missed single-line `/** */` comments was fixed); narrative comments
  written earlier in the week trimmed to their load-bearing constraint, with
  the story moved to this file or `ENGINEERING_NOTES.md`. The convention this
  enforced is now written down in `AGENTS.md`, so it's a rule to check a
  change against rather than precedent to infer by reading examples.

## 2026-07-29 — Multi-select, account settings, undo delete, search, stats, detail-modal, and board-tabs fixes

- **Fixed: no obvious way back from the stats page.** `/stats` was built without
  the board tab strip, reasoning that tabs are board chrome and stats isn't a
  board. That reasoning was about what the tabs *mean*; the effect was to strip
  the app's primary navigation off the page, leaving only the wordmark (which
  doesn't read as clickable) and a **Stats** header button that silently changed
  its destination to `/` once you were there — a fixed label meaning two
  different things.
  **Stats is now a trailing item in the tab strip itself**, after the `+` and
  behind a divider, taking the normal active highlight; the header button is
  gone, so there's one entry point rather than two. An intermediate fix — render
  the strip on `/stats` with nothing highlighted — was rejected on review: zero
  selection is a state no tab control has and reads as broken, and because every
  board tab carries a count, a row of counts above a page made entirely of counts
  reads as a *scope selector*, so clicking one looked like it would filter the
  stats when it actually navigated away from them. As a peer item, exactly one
  thing is always current and the underline animates in both directions.
  The non-draggable tabs (My Comics, Stats) are now real links rather than
  buttons calling `router.push`, so middle-click and open-in-new-tab work.
- **The header and tab strip persist across navigation.** Switching to Stats
  looked like a full page reload. It never was one — the JS globals survived and
  no second navigation entry was created — but `BoardView` and `StatsView` each
  rendered their *own* `TopBar` and `BoardTabs`, so every transition tore the
  entire chrome down and mounted a fresh copy (measured: the header DOM node
  never survived a navigation). They now live in a `(collection)` route-group
  layout shared by `/`, `/board/[id]` and `/stats`, so only `<main>` swaps —
  header node survives every transition, and the tab underline can finally
  animate, since `layoutId="active-tab"` needs both states in one continuous
  Motion tree and that tree was being destroyed mid-navigation. The search box
  and its debounce moved into the layout too, so what you've typed survives
  switching views. URLs are unchanged (route groups don't affect paths) and the
  `@modal` interceptor is untouched.
- **Import provider details without the provider's cover.** Metron's variant
  coverage is community-contributed and patchy, so the edition you own is often
  missing even when the record is right. The picker's only exit was "Use this
  cover", making the choice a wrong image or nothing — so the workflow degraded
  into "upload a cover, then hunt the comic down later to edit and replace it".
  "Use details only" now sits beside it, offered whether or not covers exist
  (the common case isn't "no covers", it's "the main cover loads fine and is
  still the wrong edition"); on a coverless record it becomes the primary action
  instead of a dead end.
  **The reason manual re-entry was unavoidable was a bug:** `addFiles` reset the
  form unconditionally, so even the workaround — pick the record, switch to the
  upload tab, drop your own scan — silently destroyed everything the provider
  had just filled in. `UploadModal` also gained an explicit `step` machine,
  since the step had been derived from `files.length > 0` and "has an image" is
  no longer the same question as "past the picking step".
- **Fixed: the detail-modal cover sat behind its own blurred backdrop.** The
  backdrop and scrim are `absolute` while the cover was statically positioned,
  and static content paints *below* positioned siblings — so the cover rendered
  under a blur and a 50% black scrim and read as not rendering at all. It looked
  right while opening, which is why it shipped: Motion applies a transform during
  the layout animation, promoting the image, and only once the animation settled
  did the cover drop behind the scrim. Fixed with `relative z-10` — which then
  pushed it above the unlayered "Replace cover" button and broke *that*, caught
  by the existing replace-cover test failing to find its file input.
  The backdrop was also reworked: painted from the ~300-byte, ~16px
  `blurDataUrl`, it had no detail to reveal at any blur radius, so it now layers
  the real thumbnail (already fetched for the cover) at a lighter blur over that
  instant placeholder, with the scrim softened to `black/30`.
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
  Dropping the series field entirely was considered, since it's the field that
  most often duplicates a character name — but character-priority dedupe already
  means a series row only survives when the title *isn't* also a character, i.e.
  exactly when it adds information. Measured against the seed data, dropping it
  would lose "Something is Killing the Children" (`some`), "Supergirl and the
  Legion of Super-Heroes" (`legion`), "Batman: The Gargoyle of Gotham"
  (`gargoyle`) and both `absolute` titles — all long names worth not typing —
  while only trimming `bat` from 5 rows to 3. Accepted tradeoff: a term that's a
  major series but a minor character ranks by the smaller character count.
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
