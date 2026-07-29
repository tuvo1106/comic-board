---
name: browser-check
description: Launch a throwaway Comic Board instance (its own port + SQLite db) and drive it with the claude-in-chrome tools for a visual/manual check — grid, list view, upload, detail modal, filters, drag-reorder. Use this whenever a change needs eyeballing in a real browser instead of just passing tsc/tests. Never touches the user's real dev server or database.
---

# Browser-driven manual check

Packages the recipe in `AGENTS.md` → "Running / verifying the app in a
browser" together with the claude-in-chrome tool-loading and interaction
steps, so a fresh session doesn't have to rediscover either.

**Hard rule (from `AGENTS.md`): never launch `next dev` against the real dev
db (`data/comic-board.db`) or reuse the port the user's own `npm run dev`
is on (3939) for this.** That database holds the user's real, hand-edited
collection. Always stand up the isolated instance below instead — same
approach `tests/integration.mjs` uses.

## 1. Stand up the throwaway instance

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
```

Then start the dev server **in the background** (Bash tool `run_in_background:
true`, or append `&` and disown) on port 3941 — it must stay up while you
drive the browser:

```bash
npx next dev -p 3941
```

Confirm it's actually listening before moving on (`lsof -i :3941 -sTCP:LISTEN`
or just try the health check below) rather than sleeping a fixed amount.

## 2. Load the browser tools

They're deferred — load the core set plus anything this check obviously
needs (form_input for forms, read_console_messages for debugging) in one
call:

```
ToolSearch query: "select:mcp__claude-in-chrome__tabs_context_mcp,mcp__claude-in-chrome__navigate,mcp__claude-in-chrome__computer,mcp__claude-in-chrome__read_page,mcp__claude-in-chrome__tabs_create_mcp,mcp__claude-in-chrome__find"
```

## 3. Open a tab and sign in

```
tabs_context_mcp { createIfEmpty: true }
navigate { url: "http://localhost:3941" }   # note: http, not https — no TLS locally
```

Use the **`SEED_USER_EMAIL`/`SEED_USER_PASSWORD`** from step 1 on the login
form. If the port was reused from an earlier throwaway run, a leftover
`httpOnly` session cookie signed with a different `BETTER_AUTH_SECRET` can
freeze the app on endless loading skeletons (401s retried forever, and JS
can't clear an `httpOnly` cookie) — this is the "stale-cookie 401 freeze"
gotcha in `AGENTS.md`. If the board never loads past skeletons after sign-in,
that's almost certainly what's happening; the login form's own sign-in
overwrites the cookie with a fresh valid session, so simply signing in again
(reload `/login`, submit) resolves it — a fresh `rm -rf "$DATA_DIR"` doesn't
fix this one since the cookie lives in the browser, not the db.

**1Password (or similar password-manager) extension overlay:** on this
profile, `computer` clicks/types on the email/password fields can fail with
`Cannot access a chrome-extension:// URL of different extension` — the
extension injects an icon/tooltip into the field that the automation can't
click through. Workaround: `read_page { filter: "interactive" }` to get refs
for the email/password inputs, then `form_input { ref, value }` to set them
directly (bypasses the overlay), and click "Sign in" by coordinate or ref
afterward.

## 4. Drive it

Standard claude-in-chrome usage: `computer` for clicks/typing/screenshots,
`find` to locate an element by description when coordinates aren't obvious,
`read_page` for the accessibility tree. Take a screenshot after each
meaningful step — don't assume an action landed without looking.

Common flows in this app:
- **Grid → detail modal**: click a cover card.
- **Click-to-edit fields** (as of 2026-07-29): clicking a display field in the
  detail modal (series, issue #, publisher, cover date, author, cover
  artists, characters, tags) enters edit mode with that field focused.
- **List view**: toggle via the grid/list control in the board toolbar.
- **Upload**: "+ Add" in the top bar opens the dropzone dialog.
- **Filters**: facet pills in the toolbar row below the tabs.

## 5. Clean up

Always tear down when done, even if the check found a bug:

```bash
lsof -ti tcp:3941 | xargs kill 2>/dev/null
rm -rf data/manual-check .next-manual
git checkout tsconfig.json 2>/dev/null   # next dev with a custom NEXT_DIST_DIR
                                          # auto-appends dist-type entries here
```

The `git checkout tsconfig.json` step matters — leaving it modified pollutes
the next `git status`/diff with an unrelated change.
