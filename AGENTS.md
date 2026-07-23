# AGENTS.md

Guidance for AI agents working in this repo. Human-facing docs live in
`README.md`; the review/roadmap docs are `CODE_REVIEW.md`, `DESIGN_REVIEW.md`,
`ROADMAP.md`.

## Working the backlog

`TODO.md` is the ordered work queue. Each item is self-contained: pick the first
unchecked `- [ ]`, do only that, run its **Verify**, tick the box, and commit
with a message naming the item (e.g. `TODO item 19: …`). Locate code by symbol
name, not the line numbers in the source docs — those drift. Don't cold-start
anything in the **Epics** section; each needs its own planning pass.

## Verify commands

- `npx tsc --noEmit` — typecheck
- `npm test` — unit suite (vitest). **Run the whole suite before committing**,
  not just the changed file's subset.
- `npm run test:integration` — browser E2E (puppeteer). Spins up its own
  isolated app on port 3940 with a throwaway sqlite db; safe to run anytime.

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
