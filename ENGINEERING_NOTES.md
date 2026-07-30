# Engineering notes

Personal reference for technical interviews — the system-design decisions and
bugs from building this app that are worth telling a story about, kept while
they're fresh instead of reconstructed from memory later. **Not project
documentation** (that's `CHANGELOG.md` for what shipped, `DESIGN.md` for the
architecture) — this is narrative, opinionated, and only needs to make sense
to me.

Add an entry whenever something notable comes up: a bug whose root cause was
non-obvious, a design decision with a real tradeoff, a performance fix with a
measurable before/after. Small is fine — a few sentences beats not capturing
it.

**Entry shape:** problem → the interesting part (root cause / insight /
tradeoff) → outcome. Optimized for "tell me about a time…" — the bold line is
the elevator pitch, the rest is what I'd say if asked to go deeper.

**Sections:** `Patterns` first — synthesis across several bugs, for "what have
you learned" rather than "what did you fix"; that's the stronger answer and the
one worth leading with. Then `Bugs` and `Design decisions`, the individual
stories it draws on. When a new entry rhymes with an existing one, add it to the
relevant pattern too — the connection is the valuable part and it's the first
thing to go stale in memory.

---

## Patterns

Synthesis across the individual entries below. More useful in an interview than
any single war story: it answers "what have you learned" rather than "what did
you fix."

### Two sources of truth that agree in the happy path

**Six bugs in this project turned out to be the same bug. Two things that
normally agree, and nobody handled the case where they don't.** Individually
each check was correct, and often *necessarily* different from its counterpart —
the disagreement space just went unconsidered. (Only some have their own entry
below; the rest are in `CHANGELOG.md`.)

Three flavours, which matter because the fix differs:

**a) Two checks of the same fact at different layers.** They can't be unified —
the layers have different capabilities — so the fix is to handle disagreement
explicitly, not to make them agree.

- Page middleware checked auth-cookie *presence* (all the edge can do cheaply);
  the API checked its *signature*. A rotated secret makes a cookie present but
  invalid → 401 → redirect to `/login` → the gate sees the cookie and bounces
  back. Infinite loop, and `httpOnly` means client JS can't break out. Fix: the
  401 path clears the cookie server-side. → [see below](#a-stale-but-present-auth-cookie-caused-an-infinite-redirect-loop-2026-07-22)
- The integration harness checked the server's *liveness* ("does the port answer
  200?") but not its *identity* ("is this the server I started?"). An orphan
  from an interrupted run answers 200 perfectly well — while serving a database
  that had already been deleted. Fix: pre-flight the port, and make teardown
  crash-safe so orphans stop being created.

**b) Two variables holding one piece of state, with a reachable combination —
or a stale copy — unhandled.** The fix is usually a third state, an enum, or a
way to tell "mine" from "theirs".

- `coverLoading` and `cover` were read as `coverLoading || !cover` → "loading".
  On success: `false` + set. On *failure*: `false` + still null — the same cell
  as "loading", so a failed fetch rendered a spinner that could never resolve,
  with only a transient toast to say otherwise. Fix: an explicit `coverError`.
- Same file, same day, different cell: the early-return branch cleared `cover`
  but not `coverLoading`, so deselecting mid-load left the spinner stuck.
- The search box keeps local input state *and* mirrors it into the URL. Both
  hold the same value, and the re-sync couldn't tell "the URL changed because
  the user hit back" from "the URL changed because my own debounced write
  landed" — so a late echo clobbered newer keystrokes. Purest form of the
  pattern: not two *checks* disagreeing but two *copies* diverging. Fix: track
  what this component last wrote, and only adopt changes that aren't its own.
  → [see below](#debounced-search-silently-dropped-fast-typed-characters-2026-07-29)

**c) A hardcoded mirror of external reality, which drifts.** The fix is a loud
failure and a note about what would invalidate it.

- `ALLOWED_COVER_HOSTS` is exactly `{"static.metron.cloud"}` — necessary as an
  SSRF guard, but it silently becomes wrong the day the provider adds a CDN
  host, and then *every* cover fails at once. Config drift that breaks for
  everyone simultaneously, same shape as the secret rotation in (a).
- Non-code instance: `AGENTS.md` claimed the repo had no working linter. True
  once, then false, and nothing detects a stale doc — so two `react-hooks`
  errors shipped because the docs said not to look. Docs are state too.

**The reusable move:** for any two things that "obviously agree," enumerate the
product of their states and ask which cells are unhandled. It's a mechanical
design-review question — cheap to ask, and it would have caught all six before
they were written.

### The bug class picks the tool that finds it

**None of these were found by the obvious method, and each needed a different
one.** Worth saying because "write more tests" is the wrong lesson.

| how it was found | what only that method could see |
|---|---|
| code review | the auth-cookie loop — invisible until a secret rotation, which then hits every signed-in user at once |
| `lsof` forensics | the orphaned server holding six fds to a database directory `ls` said didn't exist |
| a stubbed provider | the failed-cover spinner — I had read that function twice and missed it |
| a screenshot | the dropdown clipped by the dialog; every DOM assertion passed, because `getBoundingClientRect` can't see overflow clipping |
| a screenshot, again | a chart that *implied* something false — valid SVG, unit-tested data, and it still drew a trend the data never had |
| a user, days later | the cover painting *behind* its own backdrop — the element existed, had the right src and size and full opacity; only its compositing was wrong, and it looked correct for the ~300ms the animation was running |
| a user, days later | metadata silently wiped by combining two individually-correct features — each path was covered, their intersection wasn't |

The middle two are the sharpest pair: in *the same component*, careful reading
found one stuck-spinner bug and walked straight past a second one four lines
away — and the stub that caught the second was itself structurally incapable of
seeing the clipped dropdown, because assertions on the DOM can't observe
overflow clipping at all. Each layer is blind to a whole class the next one
sees; knowing which layer to reach for is the actual skill.

The stats page then produced a *new* flavour of the screenshot case, and it's
the one I'd actually tell. The clipped dropdown was at least a broken-looking
picture. This one looked perfect: a collection uploaded in a single day rendered
as a smooth diagonal ramp, because interpolating a line across a single data
point has to start it somewhere and zero is the obvious somewhere. The path was
valid, the component rendered, the bucketing had 28 passing unit tests — and the
chart told a story of gradual accumulation that never happened. There was no
assertion to write, because nothing was *wrong* in any layer I could query;
"this chart implies something the data doesn't say" only exists at the level of
a person looking at it. Charts fail in a way most UI doesn't: they can be
entirely correct and still lie. The fix (draw a lone point level across the
width) was three lines; noticing was the whole job.

---

## Bugs

### A dead end, then a false affordance: two wrong fixes before the right one (2026-07-29)

**I shipped a stats page you couldn't get out of, "fixed" it in a way that was
arguably worse, and only got there after asking for an outside review of my own
change.** Worth keeping because the failure mode is a specific one: reasoning
about what a control *means* instead of what it *signals*.

The app navigates between boards with a tab strip — `My Comics 25 | Vintage
Vault 6 | All In 4 | +`. I built `/stats` without it, on the argument that tabs
are boards you can rename, reorder and delete, and stats is none of those. The
argument is true and irrelevant: the effect was to strip the app's primary
navigation off the page. The only exits left were a wordmark that doesn't read
as clickable, and a "Stats" button that silently retargeted to `/` once you were
already on stats — a fixed label with a changing destination, which is worse
than no back button because you have to guess.

Fix attempt one: render the strip on `/stats` with nothing highlighted. This
felt principled — none of those tabs *is* the current view, so highlighting one
would be a lie. An impartial reviewer took it apart in two moves. First, **every
tab carries a count, and the stats page is made entirely of counts**, so a row
of counts directly above the charts reads as a scope selector; clicking "Vintage
Vault" expecting stats for those 6 covers instead throws you out of stats
altogether. A dead end is annoying, but a mis-signalled control loses your place
— strictly worse. Second, **zero-selection is a state no tab control has**, so
it reads as broken rather than as "none of these", and it strands the
`layoutId="active-tab"` shared-layout underline, which then pops instead of
sliding on the way back.

The right answer was the one my original framing had ruled out: make Stats a
*peer item inside the strip*, after the `+`, behind a divider, taking the normal
highlight. Exactly one item is always current, the underline animates both ways,
and "My Comics" is where it always is. My objection — stats isn't a board — was
already answered by the `+` button, a non-board member of that strip that had
been sitting there the whole time.

The lesson I'd actually give: **a control's affordance is set by what it looks
like next to its neighbours, not by the category you've assigned it in your
head.** And when you're the author of the thing under review, you are the worst
available reviewer of it — the argument that justified the original design is
exactly what keeps you from seeing the alternative.

**Postscript, and the better debugging story.** With the tab fixed, the report
became "the first time I switch to Stats, it looks like the whole page
reloaded." Two plausible causes, wanting opposite fixes, so I measured instead
of guessing — a JS global plus a `data-` marker on the header node, checked
after each transition:

```
                 time    JS global   header node   navigation entries
first  → Stats   503ms   survived    REBUILT       1
second → Stats    52ms   survived    REBUILT       1
```

The global surviving and the single navigation entry prove it was never a
reload. But two real effects were hiding behind one symptom. The 503ms→52ms drop
on the *same route* is Next compiling on demand — dev-only, gone in production,
and the reason it was "the first time" specifically. The header node being
rebuilt on *every* transition was the actual bug, and mine: `BoardView` and
`StatsView` each rendered their own `TopBar` and `BoardTabs`, so navigating
between them destroyed the whole chrome and built a new one. Hoisting it into a
shared route-group layout flipped `headerNodeSurvived` to true everywhere.

It also explains something I'd wrongly attributed to the tab layout: the
underline couldn't animate because `layoutId` needs both states in one
continuous Motion tree, and the tree was being destroyed mid-navigation. Two
symptoms, one cause, and neither would have been found by reasoning — "looks
like a reload" is a feeling, and the only way through it was to define exactly
what a reload *would* do and test for each part separately.

### Two bugs a green test suite couldn't see, and why (2026-07-29)

**Both were reported by a user against a suite of 198 unit tests and 144
integration assertions that was passing. Neither was a missing assertion of the
kind "we forgot to test that" — each sat in a category the tests structurally
could not express.**

**1. The cover painted behind its own blurred backdrop.** The modal's backdrop
and scrim are `absolute`; the cover image was statically positioned. Static
content paints below positioned siblings in the same stacking context, so the
cover rendered under a blur and a 50% black scrim.

Why the suite was green: it asserted the cover *exists* — `img[src*='full.webp']`
resolves — which it did, at the right size, at full opacity, with the right src.
Every property the DOM exposes was correct. Only compositing was wrong, and
"exists" is not "is perceivable".

The nastier part is that it was **timing-masked**. Motion applies a `transform`
during the layout animation, and a transformed element is promoted above static
siblings — so for the ~300ms the modal was opening, the cover was on top and
looked perfect. It only fell behind once the animation settled and the transform
returned to `none`. A screenshot taken at the moment most tests would take one
shows the correct image. The fix is one class (`relative z-10`); noticing it
requires deliberately waiting for the animation to *end* before looking.

Paint order is, unlike overflow clipping, observable from the DOM —
`document.elementFromPoint(centre)` answers "what would the user actually touch
here?". That's the regression assertion now.

**2. Metadata silently wiped by combining two correct features.** Picking a
provider record fills the form; `addFiles` reset the form on every file add, to
clear leftovers from a previous batch. Both behaviours were right in isolation
and both were covered. The bug lived only where they crossed — import a record's
details, then supply your own image — and no test crossed them, because the
autofill test always took the provider's cover and the upload test never had
provider metadata to lose.

This is the combinatorial gap, and it's the one that scales badly: coverage of
every feature individually says nothing about the paths *between* them, and
there are quadratically many of those. The mitigation isn't more coverage, it's
noticing which pairs of features write to the same state — here, both wrote
`form` — and testing that seam specifically.

**The postscript is the best part.** Fixing #1 with `z-10` pushed the cover above
the "Replace cover" button, which is `absolute` with no explicit layer, making it
unclickable. That regression *was* caught immediately — by a test that knows
nothing about z-index and simply tries to open the replace dialog and use its
file input. It failed with `Cannot read properties of null (reading
'uploadFile')`. Assertions written against user-visible outcomes keep catching
causes their author never imagined; assertions written against implementation
details only catch what you already thought of.


### The flaky test suite was testing a deleted database (2026-07-29)

**A "flaky" integration suite turned out to be deterministic all along — it
was just talking to the wrong server, which was serving a database that no
longer existed on disk.**

Symptom: an assertion in an untouched, early part of the suite ("DC-published
comics" count) returned different numbers on different runs — 14, then 13,
then 12 — while re-running the seed step in isolation was perfectly
deterministic (always 14). Classic "must be a timing thing" shape, and easy
to write off as slow-CI flakiness.

It wasn't timing. The harness had three small gaps that compounded into one
big one:

1. **`waitForServer()` only asked "does the port answer 200?"** — it never
   verified the answering server was the one it had just started.
2. **`spawn()` used the default `stdio: 'pipe'` with nothing reading it**, so
   when the real `next start` failed with `EADDRINUSE`, the error went into a
   pipe no one drained — completely invisible. (That unread pipe is also a
   latent deadlock: fill ~64KB and the child blocks on write forever.)
3. **Teardown lived only in `finally`**, which a signal skips entirely. Ctrl-C
   on a failing test — the single most routine thing you do while iterating —
   orphaned the server instead of killing it.

Chain it together: interrupt one run → orphaned `next-server` keeps port 3940
→ next run deletes `data/test`, re-seeds a fresh db, starts its own server,
which fails silently on the taken port → `waitForServer` gets its 200 from the
**orphan** → the whole suite runs against the orphan. And the orphan is still
serving the *old* database, because `better-sqlite3` holds open file
descriptors and POSIX keeps an unlinked inode alive as long as an fd
references it. So each interrupted run's mutations accumulated in a database
that had already been deleted, and the counts drifted.

The satisfying part was the forensics: `lsof -p <orphan>` showed six open fds
to `data/test/test.db`, `-wal`, and `-shm` while `ls data/test` reported no
such directory — a live process reading and writing a directory that doesn't
exist. The `-wal` had grown to 3.5MB of accumulated mutations. That single
command turned "probably flaky" into a proven mechanism. (The orphan had also
been pegged at 100% CPU for two and a half hours, which is its own reason to
care.)

Fixes, in order of how much they'd have saved: pre-flight the port and refuse
to run if it's taken (fails in 0.1s with the `lsof` line to fix it, instead of
a full build cycle producing wrong answers); drain the server's stdio into a
bounded buffer and surface it when the server dies or never becomes ready;
tear down on `SIGINT`/`SIGTERM`/`SIGHUP`, not just in `finally`; and kill the
whole process *group* (`process.kill(-pid)`), since `spawn("npx", …)` builds a
three-level tree (`npx` → `npm exec` → `next-server`) and signalling only the
direct child can leave the actual server behind.

Two general lessons worth stating out loud in an interview: **"flaky" is a
hypothesis, not a diagnosis** — here the data was deterministic and the
*plumbing* was non-deterministic, which is a different bug in a different
place than where everyone looks. And **a readiness check that doesn't verify
identity isn't a readiness check** — "something answered" is not "the thing I
started answered," and that gap is where a whole class of test-infrastructure
bugs lives.

- Where: `tests/integration/lifecycle.mjs` (`assertPortFree`, `startServer`,
  `waitForServer`, `killServerTree`, `installSignalTeardown`)
- See also: the entry below, written while this was still unexplained — kept
  as-is, since the isolation technique it describes is what eventually
  cornered this.

### Isolating "is this my bug or the environment's?" under a flaky test harness (2026-07-29)

**A new test failed intermittently, and the fastest way to find out whose
fault that was turned out to be running the exact same seed step in
isolation, outside the suite.**

While adding integration coverage for bulk board-membership actions, an
unrelated, pre-existing check ("DC-published comics" count) started
returning a different number on different runs of the *same, untouched*
early section of the suite — 14, then 13, then 12 — even though nothing in
that code path had changed. The tempting move is to assume your own new code
caused it (recency bias — it's the thing that just changed). Instead:
`npm run db:migrate && npm run db:seed` against a disposable throwaway DB,
outside the full browser-driven suite entirely, and query the result
directly with a one-off `better-sqlite3` script — same seed script, zero
browser/network/animation involved. It came back deterministic every time
(14, exactly). That isolates the variable precisely: the *data* is
deterministic; whatever's non-deterministic is downstream of it — something
about running a full `next build` + fresh headless Chrome launch back-to-back,
rapidly, repeatedly (which is exactly what iterating on a failing integration
test does). The interesting part isn't the root cause (never fully chased
down — that's a separate investigation) but the isolation *technique*: strip
away every layer that isn't strictly necessary to reproduce the discrepancy,
one at a time, until only one variable is left that could explain it.

Separately, in the same pass, I *did* introduce one real bug: a bulk
"remove from board" test emptied a board that a later, unrelated test
depended on being non-empty (`BoardView.tsx` swaps to a no-toolbar empty
state at zero members) — state pollution between tests, not flakiness. Fix:
capture the board's original membership before mutating it, restore it
after. Two different problems that looked identical at first ("a test I
touched now fails") — one was mine, one wasn't, and the fix for each was
completely different.

- Where: `tests/integration.mjs` (bulk board-membership block)

### Debounced search silently dropped fast-typed characters (2026-07-29)

**A 150ms search debounce had a feedback loop with its own echo, and the fix
for it looked reasonable and was still wrong the first time.**

The search input kept its own local state (`searchInput`) so keystrokes never
waited on the debounce — standard pattern. A separate effect re-synced that
local state from the URL's `?q=` param, to handle back/forward navigation and
"clear filters." The bug: that re-sync couldn't tell the difference between
"the URL changed because the user hit back" and "the URL changed because *my
own* debounced `update()` call finally landed." If you typed fast enough that
a second keystroke landed before the first keystroke's URL echo came back,
the echo would arrive *after* the newer keystroke and stomp it — visually, a
dropped character, and only under a specific timing window, which is exactly
why it read as "sometimes."

Root cause pattern: **a component reacting to a side effect it caused itself,
with no way to distinguish that from an external cause.** The fix wasn't more
debouncing or a bigger delay (which just narrows the window, doesn't close
it) — it was tracking the last value the component itself pushed, and only
treating a URL change as "external" (worth adopting) when it didn't match
that. Classic self-inflicted race condition; the tell was that it correlated
with typing *speed* relative to the debounce interval, not typing volume.

- Where: `src/components/board/BoardView.tsx` (search debounce + URL sync)
- Commit: `8266044`

### A stale-but-present auth cookie caused an infinite redirect loop (2026-07-22)

**Found by code review, not a bug report — the kind of bug that's invisible
until the one condition that triggers it (a secret rotation) happens to
everyone signed in at once.**

The page-level middleware gated routes on cookie *presence* only (an
edge-safe check — no way to verify a signature at the edge without the
secret). The API layer validated the cookie's *signature*. Those two checks
normally agree. But after a `BETTER_AUTH_SECRET` rotation, a stale cookie is
present (passes the page gate) but invalid (fails the API check) — the API
401s, client code redirects to `/login`, and the page gate sees the same
(still-present, still-bad) cookie and bounces back. Infinite loop, and
because the cookie is `httpOnly`, client JS can't even clear it to break out.

The interesting part for an interview: this is a **two-layer-validation
consistency bug** — each layer's check was individually correct and
necessary (the edge genuinely can't do full validation cheaply), but their
disagreement space was never handled. The fix was making the 401 path clear
the bad cookie server-side so the loop can't sustain itself, rather than
trying to make the two checks agree (they can't, by design).

- Where: `src/middleware.ts`, `src/lib/client-api.ts`
- Commit: `f17a296`

---

## Design decisions

### Swap-on-drop instead of fractional-index reordering (2026-07-19)

**Traded a more "clever" data structure for one with a smaller blast
radius.**

Drag-reorder needs a way to persist "this card moved between these two
others" without renumbering the whole list on every drop. The textbook
answer is fractional indexing (insert at the midpoint of the two neighbors'
positions). This app does something simpler: dragging a card **swaps** its
`position` with the drop target's — two single-row writes, and every other
card's position is untouched. New cards append after the current max.

Why not fractional indexing: it needs a renumber pass once positions get
dense enough to run out of floating-point precision between neighbors, which
is a whole extra piece of machinery (a `needsRenumber` check + a renumber
mutation) for a personal collection app where the access pattern is "reorder
one card among a few hundred," not "insert into a densely-packed list
millions of times." Swap semantics also mean it works correctly **while
filtered** — the two visible cards trade positions and nothing hidden moves,
which wouldn't be true for an insert-at-midpoint scheme where a hidden card
could sit at the computed midpoint.

The dead fractional-index code (positionBetween/positionBeforeMin/
needsRenumber) was deleted later once nothing called it — worth mentioning
as the "don't build for a scale you don't have" half of the story.

- Where: `src/lib/reorder.ts` (`swapReorder`), `src/lib/positions.ts`
- Commits: `ce33a5f` (swap reorder), `f61de86` (dead-code removal)

### Fixed-column masonry, not shortest-column packing (2026-07-19)

**Picked a slightly "worse" packing algorithm because the better one had a
UX side effect that mattered more than the packing efficiency.**

Standard masonry (Pinterest-style) places each new item in the *shortest*
column so far — better visual balance, but it means a card's column
assignment depends on everything before it. Drag one card to a new position
and every card after it can shift columns, which reads as unrelated cards
"jumping" during a reorder that only touched one thing.

This app fixes each flow position to `i % columns` instead — deterministic,
not balance-optimal, but a drag only ever affects the two cards involved in
the swap. Given cards are uniform height (not variable, unlike real
Pinterest content), shortest-column packing wasn't even buying real visual
balance — the "masonry" look here is closer to a stable grid, so giving up
shortest-column cost nothing and bought reorder stability.

- Where: `src/components/board/masonry-layout.ts`
- Commit: `ce33a5f`

### Virtualizing the board while keeping full-board features working (2026-07-19)

**The constraint was "virtualize the DOM without virtualizing the logic" —
filters, sort, facet counts, and drag all still need the *whole* dataset.**

With a few hundred comics, mounting every card was fine; virtualization
became worth it once the DOM node count (each card = image + hover menu +
motion wrappers) started costing more than the data itself. The approach:
compute the full masonry layout (all positions) as before, but only *mount*
cards whose computed position intersects a buffered viewport window
(`placementsInRange`); the container div still reports its full computed
height so the scrollbar and overall page layout behave exactly as if
everything were mounted. Filtering, sorting, facet counts, and drag-and-drop
all still operate on the full in-memory list — only the render step is
windowed.

The tradeoff being made explicit: this bounds DOM nodes, not memory or
compute — it's a rendering optimization, not a data-scale one. Worth stating
that boundary out loud in an interview, since "we virtualized it" invites the
follow-up "so how do you filter/sort if it's virtualized?"

- Where: `src/components/board/masonry-layout.ts` (`placementsInRange`)
- Commit: `ce33a5f`

### Globally-shared name tables, deliberately not per-user (2026-07-19, revisit if multi-user)

**A normalization choice that's correct for the shipped product (single
account per household) and explicitly flagged as wrong for a different one
(real multi-tenant).**

Publishers, authors, artists, characters, and tags are normalized into their
own tables with a case-insensitive `nameKey` for dedupe, shared **across all
users** rather than scoped per-user. That's what makes "rename a publisher"
a single-row update instead of a per-user fan-out, and what makes facet
counts cheap. The explicit cost: any user who owns one comic with a given
publisher can rename that globally-shared row, and if the new name collides
with an existing one, the merge repoints *every* user's comics with that
publisher — a real cross-user side effect.

This was a conscious, documented tradeoff (not an oversight) — fine for the
app's actual use case, called out in review as a blocker specifically for
the "public shared boards" roadmap item, which would need per-user or
copy-on-write name tables instead. Good interview material for "how do you
make a normalization decision, and how do you keep it from becoming a silent
landmine" — the answer here was: make the tradeoff, then write down exactly
what would force revisiting it.

- Where: `src/db/queries.ts` (`upsertPublisher`, `renamePublisher`)
- See: `ROADMAP.md` §5 (sharing prerequisites)
