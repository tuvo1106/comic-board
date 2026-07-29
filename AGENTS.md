# AGENTS.md

Guidance for AI agents working in this repo. Human-facing docs live in
`README.md`; what's shipped is `CHANGELOG.md`; what's planned is `ROADMAP.md`.

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

- `npx tsc --noEmit` — typecheck
- `npm test` — unit suite (vitest). **Run the whole suite before committing**,
  not just the changed file's subset.
- `npm run test:integration` — browser E2E (puppeteer). Spins up its own
  isolated app on port 3940 with a throwaway sqlite db; safe to run anytime.

**There is no working linter — don't try to run one.** `npm run lint` (and
`next lint`) is dead: Next.js 16 removed the `lint` command, so it parses
`lint` as a directory and errors with `no such directory: …/lint`. There's
also no flat `eslint.config.js`, so bare `npx eslint` fails too. Rely on
`npx tsc --noEmit` for static checking; don't burn time re-diagnosing lint.

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

- Dark-mode-only UI by design; the codebase uses `[color-scheme:dark]` — don't
  half-add a light theme.
- Filter facets share a pill+popover pattern (`MultiSelect`, `DateRangeFilter`)
  with a click-outside/Escape hook and an active-count badge; match it for new
  facet controls.
- Match the surrounding code's naming, comment density, and idiom.
