# AGENTS.md

Guidance for AI agents working in this repo. Human-facing docs live in
`README.md`; what's shipped is `CHANGELOG.md`; what's planned is `ROADMAP.md`.
Before a first change, read `ARCHITECTURE.md` — it's short, and it's where the
layering rule and the cross-file invariants are written down.

## Working the backlog

There's no standing `TODO.md` right now — the last review pass (a full code
review + a screenshot-driven UI/UX review, 2026-07-19) is fully resolved; see
`CHANGELOG.md`. Forward-looking work lives in `ROADMAP.md`.

When a future review pass produces a work queue — a `TODO.md` of self-contained,
checkbox items — work it like this:

1. Read the whole file, then pick the **first unchecked `- [ ]`** item. Do
   only that one.
2. Run its **Already-done check** first. If already satisfied, tick the box
   and stop — don't redo it.
3. Make the change in the listed files. Locate code by **symbol name**, not
   line numbers in the source docs — those drift as items land.
4. Run **Verify**. It must pass.
5. Tick the box `- [x]`, commit with a message naming the item (e.g.
   `TODO item 19: …`), stop.
6. `[dep: N]` means item N must be done first — confirm its result exists in
   the code before starting. `- [-]` marks an item **deliberately skipped**
   (reason noted inline); treat it as done-for-now, don't redo it.
7. **Never cold-start an Epics-section item** (or a bare `ROADMAP.md` item) —
   each is a multi-file feature with unmade product/architecture decisions;
   it needs its own planning session first.

## Verify commands

- `npm run typecheck` — typecheck (`tsc --noEmit`)
- `npm test` — unit suite (vitest). **Run the whole suite before committing**,
  not just the changed file's subset.
- `npm run test:integration` — browser E2E (puppeteer). Spins up its own
  isolated app on port 3940 with a throwaway sqlite db; safe to run anytime.
  It refuses to start if something is already listening on 3940 and prints the
  `lsof`/`kill` commands to clear it — that guard exists because a leftover
  server silently serving a *deleted* database was the cause of a long-running
  "flaky suite" mystery (see `ENGINEERING_NOTES.md`).
- `npm run lint` — ESLint (`eslint .`), config in `eslint.config.mjs`.
  **Run it on the files you touch before committing.**

### About the linter

`npm run lint` works. (An earlier version of this file claimed it was dead —
that predated `eslint.config.mjs` being added and the `lint` script being
repointed from the removed `next lint` to plain `eslint .`. The stale note had
a real cost: it told agents not to lint, so `react-hooks` errors landed on
`main` unnoticed. If a command here looks broken, verify before believing it.)

**CI runs it** (`.github/workflows/ci.yml`, in the `build` job alongside
`tsc --noEmit`), and the repo is currently **completely clean — zero errors,
zero warnings**. So any problem you see is yours; don't hunt for a baseline.

The `react-hooks` rules are on and they catch real bugs — refs read during
render, and `setState` inside an effect where deriving during render would do.
When one fires, prefer the fix this codebase already uses: adjust state during
render guarded by a `prev` state value, not an effect. Three worked examples:
`BoardView.tsx`'s search re-sync, `SearchBox.tsx`'s highlight reset, and
`MetadataSearch.tsx`'s cover reset.

`no-unused-vars` is configured to ignore `_`-prefixed names (args, vars, caught
errors) — that's the repo's signal for "deliberately unused", so prefix rather
than disabling the rule.

## Database safety — read this

**Never run `npm run db:seed` or otherwise reset/reseed the dev database without
explicit user confirmation.** The dev db (`data/comic-board.db`) holds the
user's real, hand-edited collection; reseeding wipes it irrecoverably.

## Running / verifying the app in a browser

To drive the real app for a visual check, **do not** launch `next dev` against
the dev db and log in as the user. Instead stand up a throwaway instance on its
own port + db (the same approach `tests/integration.mjs` uses), so the user's
data is never touched:

```bash
export DATA_DIR="$PWD/data/manual-check"
export DATABASE_PATH="$DATA_DIR/manual.db"
export BETTER_AUTH_URL="http://localhost:3941"
export BETTER_AUTH_SECRET="manual-check-secret"
export NEXT_DIST_DIR=".next-manual"
export SEED_USER_EMAIL="check@example.com"
export SEED_USER_PASSWORD="checkpass123"
rm -rf "$DATA_DIR"; mkdir -p "$DATA_DIR"
npm run db:migrate && npm run db:seed      # throwaway db only — safe
npx next dev -p 3941                        # background it
```

Then, in the browser, authenticate **before** loading the board.

### Gotchas

- **Dev port must match `BETTER_AUTH_URL`.** `.env` sets
  `BETTER_AUTH_URL=http://localhost:3939`, and better-auth only accepts sign-in
  from that exact origin. `npm run dev` runs on 3939 to match — don't launch the
  dev server on another port (e.g. bare `next dev` → 3000), or login fails with
  `Invalid origin: http://localhost:3000`. The throwaway instance above sets its
  own `BETTER_AUTH_URL` to whatever port it uses, so keep those two in sync too.
- **Stale-cookie 401 freeze.** Better Auth's session cookie is `httpOnly` and
  scoped to `localhost:<port>`. A leftover cookie from an earlier run on the
  same port (signed with a different `BETTER_AUTH_SECRET`) passes the middleware
  redirect but fails API auth → `/api/comics` and `/api/boards` return 401,
  react-query retries forever, and the renderer freezes on endless skeletons.
  JS can't clear an httpOnly cookie. Fix: sign in fresh via the API, which
  overwrites the cookie with a valid session —
  `POST /api/auth/sign-in/email` with `{email, password}` — then reload `/`.
- **`tsconfig.json` auto-edit.** Running a build/dev with a custom
  `NEXT_DIST_DIR` makes Next.js append `"<dist>/types/**/*.ts"` entries to
  `tsconfig.json`. Revert that (`git checkout tsconfig.json`) after tearing the
  instance down.
- **Cleanup.** `lsof -ti tcp:3941 | xargs kill`, then
  `rm -rf data/manual-check .next-manual`.

## Conventions

- Commit messages: [Conventional Commits](https://www.conventionalcommits.org/)
  (`type(scope): subject`); no `Co-Authored-By` trailer. Enforced by a
  `commit-msg` hook — run `lefthook install` once after cloning. See
  [CONTRIBUTING.md](CONTRIBUTING.md) for the full commit/PR/ADR process.
- **Never commit directly to `main`.** One PR per feature. Branch prefixes:
  `feat/<slug>`, `fix/<slug>`, `chore/<slug>`, `docs/<slug>`, `spike/<slug>`.
- **Build as if this repo were public.** No secrets, credentials, tokens, or
  real user data committed — ever, not "temporarily," not in a branch you plan
  to squash. A `no-secrets` pre-commit hook backs this up but isn't a
  substitute for not doing it in the first place.
- Dark-mode-only UI by design; the codebase uses `[color-scheme:dark]` — don't
  half-add a light theme.
- Filter facets share a pill+popover pattern (`MultiSelect`, `DateRangeFilter`)
  with a click-outside/Escape hook and an active-count badge; match it for new
  facet controls.
- Match the surrounding code's naming, comment density, and idiom.

### Where a piece of documentation belongs

Four places, each with a different lifespan. Writing something in the wrong one
is how `ROADMAP.md` grew to 551 lines (225 of them duplicating `CHANGELOG.md`)
and why individual files drifted to a 36%-comment density before the 2026-07-30
cleanup — not from any single bad call, but from nobody having a rule to check
against. Before adding a comment or a doc, ask which of these it actually is:

1. **Inline comment, at the line it constrains.** Only for a *durable* fact
   about the code as it stands: a non-obvious invariant, a workaround for a
   specific constraint, something a future edit could silently break. Test it
   with "would removing this comment make someone reading the code get it
   wrong?" — if yes, keep it; if it just restates what the code already says,
   cut it. A comment should tell an editor what breaks if they change this, not
   how the feature came to be built this way — that's the next item.
   Compare `src/lib/api.ts`'s `handle()` doc (a durable contract: which errors
   map to which status) against what `CollectionChrome.tsx`'s doc used to be
   before trimming (a multi-paragraph debugging story) — the story moved to
   ENGINEERING_NOTES, and what's left is one sentence: *why this must stay in
   the layout*.
2. **`CHANGELOG.md`**, for *what shipped and why*, once it has. This is where
   the narrative goes: the alternatives considered, the measurements taken
   (bundle sizes, before/after timings), the tradeoffs accepted. If you're
   about to write two paragraphs above a function explaining a decision that's
   already made and shipped, it likely belongs here instead.
3. **`ENGINEERING_NOTES.md`**, for *root causes and durable lessons* — bugs
   whose cause wasn't obvious, patterns that recur across several bugs, design
   decisions with a real tradeoff. Personal and narrative on purpose (see its
   own header); doesn't need to read as project documentation.
4. **`ROADMAP.md`**, for *what's still open* — not what shipped. A finished
   item collapses to one line plus a pointer (`→ CHANGELOG.md`), not a
   write-up. If you're editing a "shipped" section and it's growing rather
   than shrinking, that content is drifting into CHANGELOG's job.
5. **`docs/adr/`**, for a decision made *during* implementation that's hard to
   reverse, non-obvious, or rejected a plausible alternative — and doesn't fit
   any of the above. See ADR-0001.

**No CI checks any of this** — it's a norm to self-police, not a lint rule.
When a PR touches several files' worth of comments or crosses into the
project-doc files, take one pass afterward and ask whether anything landed in
the wrong tier before committing.
