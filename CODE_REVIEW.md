# Code review — 2026-07-19

Broad review of the whole repo (src, API routes, db layer, components, tests).
Organized by severity: bugs first, then security/robustness, refactoring
opportunities, performance, and test gaps. File references use `path:line`
where the line is exact, otherwise `path` + symbol name.

Overall: the codebase is in good shape. Ownership scoping is applied
consistently in the query layer *and* covered by tests, comments explain intent
(and past regressions) unusually well, and the integration suite exercises the
flows that actually broke historically. Everything below is incremental.

---

## Bugs

### 1. Board rename/delete failures are silently swallowed (unhandled rejection)
`src/components/board/BoardTabs.tsx` — `doRename` / `doDelete`

Both `await updateBoard.mutateAsync(...)` / `deleteBoard.mutateAsync(...)`
without try/catch. On a server error the promise rejects unhandled: no toast,
dialog stays open, user gets no feedback. `CreateBoardDialog` in the same file
does catch and toast — make the other two match.

### 2. Nested scroll-lock clobber (latent)
`src/components/ui/Dialog.tsx` — cleanup sets `document.body.style.overflow = ""`
unconditionally, while `ComicDetail` (`src/components/detail/ComicDetail.tsx:90`)
saves and restores the previous value. If a `Dialog` ever opens above the
comic modal, closing it will unlock background scroll behind the still-open
modal. No current UI path stacks them, so this is latent — but it's a one-line
trap for the next feature (e.g. a confirm dialog inside the detail modal).
Consider a tiny shared scroll-lock helper with a counter.

### 3. `~` in a facet value breaks filter URLs
`src/lib/filters.ts` — `filtersToParams` joins multi-select values with `"~"`,
`filtersFromParams` splits on it. A series/artist/tag containing `~` splits
into two bogus filter values after a reload/share. Either encode the values
(e.g. `encodeURIComponent` per value before joining) or use repeated params
(`?tag=a&tag=b` — `getAll` already half-supports this).

### 4. List view date cell PATCHes on every keystroke
`src/components/board/ListView.tsx` — `EditDate` commits in `onChange`. Typing
a date via keyboard fires a PATCH per segment (day/month/year), each of which
also runs the full `invalidateComicWorld` refetch. Commit on blur/Enter like
`EditText`, or debounce.

### 5. Non-image upload returns 500 instead of 400
`src/app/api/comics/route.ts` — the server never validates the file type; a
corrupt/non-image file makes `sharp` throw inside `processUpload`, which
`handle()` maps to a 500 with an internal message. Catch the sharp failure (or
sniff magic bytes) and return `badRequest("Not a valid image")`. Only the
client checks MIME today, and that's advisory.

### 6. Board search debounce timer leaks on unmount
`src/components/board/BoardView.tsx` — the 150 ms `setTimeout` in `onSearch`
is never cleared on unmount; a pending timer can call `update()` (router
navigation) after the view is gone. Add a cleanup effect clearing
`timer.current`.

---

## Security / robustness

### 7. `/images/**` is unauthenticated
`src/app/images/[...path]/route.ts` does no session check, and
`src/middleware.ts` deliberately excludes `images` from the auth gate. Comic
ids are 14-char nanoids so URLs are unguessable, but any leaked URL serves the
cover to anyone, forever (`Cache-Control: immutable`). Fine for a personal
app; if multi-user matters, add the `getUserId` + ownership check (the comic id
is the first path segment, so the lookup is cheap).

### 8. Internal error messages leak to clients
`src/lib/api.ts` — `handle()` returns `err.message` in the 500 body. Sqlite
and sharp errors can expose paths/schema details. Log the real error (already
done) but return a generic `"Internal error"`.

### 9. Insecure auth-secret fallback also applies in production
`src/lib/auth.ts` — `secret: process.env.BETTER_AUTH_SECRET || "dev-only-…"`.
A production deploy that forgets the env var silently runs with a known
secret. Throw at startup when `NODE_ENV === "production"` and the var is
missing.

### 10. Publisher rename/merge has cross-user side effects (by design — recheck if multi-user)
`src/db/queries.ts:623` — documented and tested: any user who owns one comic
with a publisher can rename the globally-shared row, and a rename-onto-collision
repoints *every* user's comics (`queries.ts:656`). Consistent with the shared
authors/artists/tags model and fine single-user; flagging so it's a conscious
choice if accounts ever become real.

---

## Refactoring opportunities

### 11. Transactions that reach around their own `tx`
`src/db/queries.ts:50`, `:68`, `:677` — `upsertNames`, `upsertPublisher`, and
`getComicTx`→`loadRelations` all use the module-level `db` while running
inside `db.transaction((tx) => …)` (`createComic`, `updateComic`,
`renamePublisher`). It works only because better-sqlite3 runs everything on
one connection, so the statements happen to join the open transaction. The
`DBOrTx` type already exists (`queries.ts:26`) — thread `tx` through these
helpers so atomicity doesn't depend on a driver implementation detail.

### 12. Dead fractional-indexing API
`src/lib/fractional-index.ts` — `positionBetween`, `positionBeforeMin`, and
`needsRenumber` have no callers since reorder moved to swap semantics
(ce33a5f); the file header still describes the midpoint strategy the app no
longer uses. Keep `positionAfterMax` (used for appends), delete the rest, and
rewrite the header — or the next reader will assume midpoint inserts still
happen.

### 13. Masonry doc/code drift + vestigial column math
`src/components/board/masonry-layout.ts` — `computeMasonry`'s doc comment says
"Each card keeps its cover's aspect ratio, so columns stagger like a Pinterest
board", but `CARD_ASPECT = 1.5` forces uniform card heights (the constant's own
comment is the accurate one). With uniform heights the per-column
`colHeights` bookkeeping is vestigial — `y = Math.floor(i / columns) * (cardHeight + GAP)`
is the whole layout. Simplify, or at least fix the comment.

### 14. Stale storage-key comments
`src/lib/storage.ts:10` and `:35` say keys look like `covers/<id>/orig.webp`;
the real key is `full.webp` (`src/lib/images.ts:54`). This exact drift cost
time during the issue-#1 diagnosis (a selector written from the comment
matched nothing).

### 15. Near-duplicate UI blocks
- `BoardsField` in `ComicDetail.tsx` and the board-toggle list in
  `ComicCardMenu.tsx` render the same checkbox-board-list with the same
  add/remove mutations — extract one `BoardMembershipList`.
- `EditPublisher` in `ListView.tsx` reimplements `ui/Autocomplete.tsx`
  (same filter/slice(0,8)/mousedown-preventDefault dropdown) plus edit-mode
  state — compose instead.
- `loadRelations` (`queries.ts:142-172`) is four copies of the same
  join loop; a `[joinTable, nameTable, targetMap]` table would collapse it.

### 16. Minor dead code
- `src/db/queries.ts:598` — `series.filter((s) => s.count > 0)`: a GROUP BY
  row can't have count 0.
- `BoardTabs.tsx` — `{pinned && null}` renders nothing by construction.

---

## Performance (all small at current scale)

### 17. `listBoards` counts scan every user's memberships
`src/db/queries.ts:413` — the count query groups all of `boardComics`
unscoped, then the map is only read for the caller's boards. Join through
`boards.userId` to keep it O(own data).

### 18. `processUpload` decodes the source four times
`src/lib/images.ts` — metadata probe + full + thumb + blur each construct a new
`sharp(input)` pipeline. `sharp(input).rotate()` once and `.clone()` for each
output roughly halves CPU per upload.

### 19. Blunt cache invalidation
`src/lib/client-api.ts` — `invalidateComicWorld` refetches all comics lists,
all open details, boards, and meta after *any* comic mutation (including a
half-star rating click, which also happens per-keystroke via #4). Fine at
hundreds of comics; if it ever feels sluggish, patch the specific list entry
with `setQueryData` and only invalidate `meta` when names actually changed.

---

## UX / accessibility

### 20. Overlays aren't accessible
`Menu.tsx` / `Dialog.tsx` have Escape + outside-click but no focus trap, no
focus restore, no `role="dialog"`/`aria-modal`/`role="menu"`, and menu items
aren't keyboard-navigable (arrow keys). `StarRating` does have per-button
aria-labels. Worth a pass if a11y matters to the project.

### 21. Search doesn't cover tags or issue #
`src/lib/filters.ts` — `applyFilters`' haystack is series/publisher/authors/
artists/characters. Tags and issue number are excluded, which surprises when a
tag is visible on the card you're searching for. Either add them or it's a
deliberate scope choice worth a comment.

### 22. Stale/invalid session cookie causes a login redirect loop
`src/middleware.ts` gates page routes on cookie **presence** only
(`getSessionCookie`, "edge-safe"), while the API validates the **signature/
session**. When a cookie is present but invalid — after a `BETTER_AUTH_SECRET`
rotation, a server-side session revocation, or a sessions-table reset — it
passes the gate, then `/api/comics` 401s, `jsonFetch` (`src/lib/client-api.ts`)
does `window.location.href = "/login"`, and the gate bounces `/login → /`
because the bad cookie is still there. Result: an infinite `/` ⇄ `/login` loop
the user can't escape (the cookie is `httpOnly`, so JS can't clear it). Steady
state is fine; a prod secret rotation would loop every signed-in user at once.
Fix by clearing/expiring the cookie on the 401 path (sign-out redirect, or an
expiring `Set-Cookie` on the 401). Surfaced 2026-07-22 while verifying TODO #20.

---

## Test gaps

Existing coverage is genuinely good (ownership scoping, publisher merge,
partial-update regression, URL round-trip, swap invariants, masonry windowing,
plus the browser-level integration suite). Gaps worth closing:

- **Filter round-trip with hostile values** — a value containing `~` currently
  fails round-trip (#3); add the failing case alongside the fix.
- **Upload rejects non-images with 400** — integration or route-level test,
  once #5 is fixed (today it would assert a 500).
- **Board rename/delete failure UX** — after #1, a test that a failed rename
  shows a toast and keeps the dialog open (the integration harness can stub a
  500 via request interception).
- **`/images` auth policy** — whichever way #7 lands, pin it with a test so
  the middleware matcher and the route stay in agreement.
