# Work orders — built for a cleared context between items

Each item below is self-contained: a fresh Claude with no memory of this
session can pick the first unchecked box and execute it from the item alone.
Detail lives in `CODE_REVIEW.md` / `DESIGN_REVIEW.md` / `ROADMAP.md`; refs like
`[CR#4]` `[DR#3]` `[RM 1a]` point back there.

## Operating protocol (read first)

1. Read this whole file, then pick the **first unchecked `- [ ]`** item. Do
   only that one.
2. Run its **Already-done check** first. If already satisfied, tick the box and
   stop — don't redo it.
3. Make the change in the listed **Files**. Line numbers in the source docs
   drift as items land — locate by **symbol name**, not line number.
4. Run **Verify**. It must pass. UI items say which viewport to screenshot and
   what to confirm (use the `run` skill to launch the app).
5. Tick the box `- [x]`, commit with a message naming the item, stop.
6. `[dep: N]` means item N must be done first — confirm its result exists in the
   code before starting.
7. **Do NOT start anything in the Epics section from a cold context.** Each is a
   multi-file feature with unmade decisions; it needs its own planning session.

Baseline verify commands used below: `npx tsc --noEmit` (typecheck),
`npm test` (unit), `npm run test:integration` (browser E2E, after item 1).

---

## Phase 1 — Safety net

- [x] **1. Integration suite in CI** — `[RM#2]`
  - Files: `.github/workflows/ci.yml`
  - Change: add a job/step running `npm run test:integration`. It needs Chrome;
    on ubuntu set `CHROME_PATH` to the runner's Chrome (e.g. a
    `browser-actions/setup-chrome` step, then `CHROME_PATH=$(which chrome)`), or
    document why not. **Decision to surface:** which Chrome-provisioning
    approach.
  - Done when: CI runs the integration suite and it passes on a PR.
  - Verify: `npm run test:integration` locally is green; `ci.yml` invokes it.
  - Already-done check: grep `ci.yml` for `test:integration`.

- [x] **2. Fail startup on missing prod auth secret** — `[CR#9]`
  - Files: `src/lib/auth.ts`
  - Change: before `betterAuth({…})`, throw if
    `process.env.NODE_ENV === "production" && !process.env.BETTER_AUTH_SECRET`.
    Keep the dev fallback for non-prod.
  - Done when: prod without the env var throws at import; dev still boots.
  - Verify: `npx tsc --noEmit`; reason through both branches.
  - Already-done check: grep `auth.ts` for a throw referencing `BETTER_AUTH_SECRET`.

- [x] **3. Generic 500 response bodies** — `[CR#8]`
  - Files: `src/lib/api.ts` (`handle`)
  - Change: the 500 branch returns `{ error: "Internal error" }`; keep the
    existing `console.error`.
  - Done when: 500s no longer echo `err.message` to the client.
  - Verify: `npx tsc --noEmit`; read `handle`.
  - Already-done check: read `handle` — 500 branch returns a constant string.

## Phase 2 — Correctness bugs

- [x] **4. Board rename/delete error handling** — `[CR#1]`
  - Files: `src/components/board/BoardTabs.tsx` (`doRename`, `doDelete`)
  - Change: wrap each `mutateAsync` in try/catch → `toast((e as Error).message,
    "error")`, mirroring `CreateBoardDialog` in the same file. Leave the dialog
    open on failure.
  - Done when: a failed rename/delete shows a toast and the dialog stays open.
  - Verify: `npx tsc --noEmit`. Optional: integration test stubbing a 500.
  - Already-done check: both functions have try/catch.

- [x] **5. `~` in a facet value breaks filter URLs** — `[CR#3]`
  - Files: `src/lib/filters.ts` (`filtersToParams`, `filtersFromParams`),
    `src/lib/filters.test.ts`
  - Change: stop using a raw `~` join delimiter — `encodeURIComponent` each
    value before joining (and decode on read), or switch to repeated params.
    Add a round-trip test for a value containing `~`.
  - Done when: a filter value with `~` survives `toParams`→`fromParams`; test added.
  - Verify: `npm test`.
  - Already-done check: `filters.test.ts` has a `~`/hostile-value case.

- [x] **6. Non-image upload returns 400, not 500** — `[CR#5]`
  - Files: `src/app/api/comics/route.ts` (POST)
  - Change: wrap `processUpload` (or pre-sniff magic bytes); on a sharp decode
    failure return `badRequest("Not a valid image")`.
  - Done when: POSTing a non-image file yields 400 with a clear message.
  - Verify: `npm test` / integration; a route test asserting 400.
  - Already-done check: the route catches the sharp failure and returns 400.

- [x] **7. List-view date cell: commit on blur, not per keystroke** — `[CR#4 = DR#3d]`
  - Files: `src/components/board/ListView.tsx` (`EditDate`)
  - Change: hold a local draft; PATCH once on blur/Enter (like `EditText`),
    not in `onChange`.
  - Done when: typing a date fires at most one PATCH, on commit.
  - Verify: `npx tsc --noEmit`; via `run`, edit a date and confirm one request
    in the network panel.
  - Already-done check: `EditDate` commits on blur/Enter, not `onChange`.

- [ ] **8. Search debounce timer leak on unmount** — `[CR#6]`
  - Files: `src/components/board/BoardView.tsx` (`onSearch`, timer ref)
  - Change: add a cleanup effect clearing `timer.current` on unmount.
  - Done when: unmounting mid-debounce fires no late `update()`.
  - Verify: `npx tsc --noEmit`.
  - Already-done check: a cleanup effect clears the timer.

- [ ] **9. Shared scroll-lock helper** — `[CR#2]`
  - Files: new `src/lib/scroll-lock.ts`; `src/components/ui/Dialog.tsx`;
    `src/components/detail/ComicDetail.tsx`
  - Change: counter-based lock/unlock helper; both callers use it so nesting a
    dialog over the modal doesn't prematurely restore `body.overflow`.
  - Done when: opening then closing a dialog above the modal leaves scroll
    still locked until the modal closes.
  - Verify: `npx tsc --noEmit`; manual nested open/close.
  - Already-done check: both files import the shared helper.

## Phase 3 — Touch & mobile

- [ ] **10. Extract `BoardMembershipList`** — `[CR#15a]`
  - Files: new `src/components/board/BoardMembershipList.tsx`; refactor
    `BoardsField` in `src/components/detail/ComicDetail.tsx` and the board list
    in `src/components/board/ComicCardMenu.tsx` to use it.
  - Change: one component renders the checkbox board list + add/remove
    mutations; both call sites delegate. Behavior unchanged.
  - Done when: the checkbox list exists once; both call sites render via it.
  - Verify: `npm run test:integration` (modal + card-menu flows still pass).
  - Already-done check: grep for `BoardMembershipList`.

- [ ] **11. Touch access to card menu + label** — `[DR#1]`  `[dep: 10]`
  - Files: `src/components/board/ComicCard.tsx`, `ComicCardMenu.tsx`
  - Change: on coarse pointers (`@media (pointer: coarse)` or a `matchMedia`
    hook) show the "…" button and the title/issue label without hover.
  - Done when: at a 390px touch viewport the menu button is visible/reachable
    without hover.
  - Verify: via `run`, screenshot the grid at 390px; confirm the "…" button and
    label are visible.
  - Already-done check: grep for `pointer: coarse` / coarse-pointer handling in
    the card.

- [ ] **12. Collapsible mobile filter bar** — `[DR#2]`
  - Files: `src/components/filters/FilterBar.tsx`
  - Change: below a breakpoint, collapse the facet pills + date range into a
    single "Filters (n)" button opening a bottom sheet. **Decisions to surface:**
    breakpoint, sheet vs modal.
  - Done when: at ≤640px the filters sit behind one button, expandable.
  - Verify: `run`, screenshot at 390px before/after; confirm ≤1 row of chrome.
  - Already-done check: `FilterBar` renders a collapsed control under a breakpoint.

- [ ] **13. Modal prev/next arrows overlap panel on mobile** — `[DR#5c]`
  - Files: `src/components/detail/ComicDetail.tsx` (`NavArrow`)
  - Change: reposition inside the panel, or hide arrows on small screens
    (keyboard/swipe still navigate).
  - Done when: at 390px the next arrow doesn't overlap panel content.
  - Verify: `run`, open a comic at 390px, screenshot; no overlap.
  - Already-done check: `NavArrow` has small-screen handling.

- [ ] **14. Star rating touch targets** — `[DR#5d]`
  - Files: `src/components/ui/StarRating.tsx`
  - Change: on touch, use whole-star taps (or ≥44px targets); keep half-star on
    fine pointers.
  - Done when: interactive star targets are ≥44px (or whole-star) on touch.
  - Verify: `run`, inspect target size at mobile viewport.
  - Already-done check: `StarRating` branches on pointer type / target size.

## Phase 4 — List & filter refinement

- [ ] **15. List-view chip: distinguish edit from filter** — `[DR#3a]`
  - Files: `src/components/board/ListView.tsx`
  - Change: list-view author/artist/tag chips currently *edit* while
    identical-looking modal chips *filter*. Make list editing a distinct
    affordance (e.g. pencil on row-hover) or move editing behind the row menu.
    **Decision to surface:** which direction.
  - Done when: in the list view, editing vs filtering read as different actions.
  - Verify: `run`, screenshot a list row; confirm the affordance.
  - Already-done check: list chips no longer look identical to filtering chips.

- [ ] **16. Sortable header affordance** — `[DR#3b]`
  - Files: `src/components/board/ListView.tsx` (`SortHeader`)
  - Change: sortable headers (Series/#/Publisher/Cover date/Rating) show a
    faint sort glyph on hover; non-sortable ones don't.
  - Done when: hovering a sortable header reveals a sort cue.
  - Verify: `run`, hover a header, screenshot.
  - Already-done check: `SortHeader` renders a hover glyph.

- [ ] **17. Don't render 5 empty stars per unrated row** — `[DR#3c]`
  - Files: `src/components/board/ListView.tsx`, `src/components/ui/StarRating.tsx`
  - Change: for unrated rows render nothing (or a small dot) at rest; reveal
    settable stars on row hover.
  - Done when: unrated rows aren't full of empty star outlines at rest.
  - Verify: `run`, screenshot the list; unrated rows are quiet.
  - Already-done check: unrated list rows render no star row at rest.

- [ ] **18. Facet counts respect other active filters** — `[DR#4b]`
  - Files: `src/lib/filters.ts` (`computeFacets`), `src/components/filters/FilterBar.tsx`,
    `src/lib/filters.test.ts`
  - Change: compute each facet's counts against the currently-filtered set,
    excluding that facet's own selections (standard faceted search). Add a test.
  - Done when: with Publisher=DC active, Author counts reflect only DC comics.
  - Verify: `npm test`.
  - Already-done check: `computeFacets` takes active filters / a test covers it.

- [ ] **19. Date-range filter as a pill+popover** — `[DR#4a]`
  - Files: `src/components/filters/FilterBar.tsx`
  - Change: wrap the two native date inputs in a "Date" pill that opens a small
    popover, matching the other facet dropdowns.
  - Done when: the date range presents as a pill consistent with other facets.
  - Verify: `run`, screenshot the filter bar.
  - Already-done check: date inputs live in a pill/popover, not inline.

- [ ] **20. Active-filter chip provenance** — `[DR#4c]`
  - Files: `src/components/filters/FilterBar.tsx` (`ActiveChips`)
  - Change: prefix each chip with its facet ("Publisher: DC") or add a facet
    icon, so a value shared across facets isn't ambiguous.
  - Done when: chips indicate which facet they belong to.
  - Verify: `run`, apply two facets, screenshot the chip row.
  - Already-done check: chips render a facet prefix/icon.

- [ ] **21. Label the column-count control** — `[DR#4d]`
  - Files: `src/components/board/ColumnSelector.tsx`
  - Change: add a columns glyph before the `Auto 3 4 5 6` group or a tooltip.
  - Done when: the control's purpose is clear without clicking.
  - Verify: `run`, screenshot the toolbar.
  - Already-done check: `ColumnSelector` has an icon/tooltip.

- [ ] **22. Consistent "My Comics" tab count** — `[DR#4e]`
  - Files: `src/components/board/BoardTabs.tsx`
  - Change: either show a count on "My Comics" like custom boards, or drop
    counts from custom tabs — pick one.
  - Done when: count presence is consistent across all tabs.
  - Verify: `run`, screenshot the tab strip.
  - Already-done check: tabs are consistent.

- [ ] **23. Search covers tags + issue #** — `[CR#21]`
  - Files: `src/lib/filters.ts` (`applyFilters`), `src/lib/filters.test.ts`
  - Change: add `tags` and `issueNumber` to the search haystack (or add a
    comment documenting the exclusion). Add a test.
  - Done when: searching a tag or issue number matches; test added.
  - Verify: `npm test`.
  - Already-done check: haystack includes tags/issue; test present.

## Phase 5 — Polish & accessibility

- [ ] **24. Global focus-visible ring** — `[DR#8]`
  - Files: `src/app/globals.css`
  - Change: a `:focus-visible` outline rule so buttons, cards, menu items, and
    chips show keyboard focus.
  - Done when: tabbing through the board shows a visible focus ring.
  - Verify: `run`, keyboard-tab, screenshot a focused control.
  - Already-done check: `globals.css` has a `:focus-visible` rule.

- [ ] **25. Overlay a11y (roles + focus trap)** — `[CR#20]`  *(larger; read CR#20)*
  - Files: `src/components/ui/Menu.tsx`, `src/components/ui/Dialog.tsx`
  - Change: `role="dialog"`/`aria-modal` + focus trap + focus restore on Dialog;
    `role="menu"`/`menuitem` + arrow-key nav on Menu.
  - Done when: Dialog traps & restores focus; Menu is arrow-navigable; roles present.
  - Verify: manual keyboard-only pass through a dialog and a menu.
  - Already-done check: both have roles + focus handling.

- [ ] **26. Skeleton matches the real masonry** — `[DR#7]`
  - Files: `src/components/board/BoardView.tsx` (`BoardSkeleton`),
    `src/components/board/masonry-layout.ts`
  - Change: generate the skeleton from `computeMasonry` placeholders (same
    columns/geometry) so load→content doesn't reflow.
  - Done when: the skeleton uses the real column geometry; no visible jump.
  - Verify: `run`, throttle, screenshot load then content.
  - Already-done check: `BoardSkeleton` uses `computeMasonry`.

- [ ] **27. Clickable series title in the modal** — `[DR#5a]`
  - Files: `src/components/detail/ComicDetail.tsx`
  - Change: make the header series title filter the board by series (like the
    other facet chips).
  - Done when: clicking the modal title filters to that series.
  - Verify: `run`, click the title, confirm the board filters.
  - Already-done check: the title is a filter link.

- [ ] **28. Show "date added" in the modal** — `[DR#5b]`
  - Files: `src/components/detail/ComicDetail.tsx`
  - Change: surface `createdAt` in the detail metadata (it's a sort option but
    invisible in the UI).
  - Done when: the modal shows the date added.
  - Verify: `run`, open a comic, confirm the field.
  - Already-done check: modal renders `createdAt`.

- [ ] **29. Rating in the grid hover label** — `[DR#9]`
  - Files: `src/components/board/ComicCard.tsx`
  - Change: add the rating to the hover-revealed label (otherwise invisible in
    grid view).
  - Done when: hovering a rated card shows its rating.
  - Verify: `run`, hover a rated card, screenshot.
  - Already-done check: the hover label includes rating.

- [ ] **30. Password visibility toggle** — `[DR#9]`
  - Files: `src/components/auth/AuthForm.tsx`
  - Change: a show/hide toggle on the password field.
  - Done when: the password field can be revealed.
  - Verify: `run`, toggle on the login page.
  - Already-done check: the password field has a toggle.

- [ ] **31. Cap / dedupe toasts** — `[DR#9]`
  - Files: `src/components/ui/toast.tsx`
  - Change: cap concurrent toasts (e.g. last N) and/or dedupe identical
    messages so a batch upload can't build a tower.
  - Done when: rapid identical toasts don't stack unbounded.
  - Verify: `npx tsc --noEmit`; trigger several toasts quickly.
  - Already-done check: `ToastProvider` caps/dedupes.

- [ ] **32. Declare dark-only deliberate** — `[DR#9]`
  - Files: `src/app/globals.css`
  - Change: a comment stating dark-only is intentional (so nobody half-adds a
    light mode against the `[color-scheme:dark]` sprinkles).
  - Done when: the comment exists.
  - Verify: read the file.
  - Already-done check: comment present.

## Phase 6 — Internal cleanup (low urgency; pair with nearby work)

- [ ] **33. Thread `tx` through query helpers** — `[CR#11]`
  - Files: `src/db/queries.ts` (`upsertNames`, `upsertPublisher`, `getComicTx`→`loadRelations`)
  - Change: accept a `DBOrTx` param and pass `tx` from `createComic`/
    `updateComic`/`renamePublisher`, so atomicity doesn't rely on the
    single-connection driver detail.
  - Done when: those helpers take a db/tx handle; transaction callers pass `tx`.
  - Verify: `npm test` (`queries.test.ts`).
  - Already-done check: helper signatures take a handle.

- [ ] **34. Delete dead fractional-index API** — `[CR#12]`
  - Files: `src/lib/fractional-index.ts`, `src/lib/fractional-index.test.ts`
  - Change: remove `positionBetween`, `positionBeforeMin`, `needsRenumber`
    (no callers since swap-reorder); keep `positionAfterMax`; rewrite the
    header to describe append-only; drop tests for the removed fns.
  - Done when: only `positionAfterMax` remains; header accurate; tests pass.
  - Verify: `npm test`; grep confirms no other references.
  - Already-done check: the three functions are gone.

- [ ] **35. Fix masonry doc + vestigial column math** — `[CR#13]`
  - Files: `src/components/board/masonry-layout.ts`
  - Change: correct `computeMasonry`'s "keeps aspect ratio" comment (heights are
    uniform); optionally simplify `colHeights` to
    `y = floor(i/columns)*(cardHeight+GAP)`.
  - Done when: comment matches reality; `masonry-layout.test.ts` passes.
  - Verify: `npm test`.
  - Already-done check: the doc comment reflects uniform heights.

- [ ] **36. Fix stale storage-key comments** — `[CR#14]`
  - Files: `src/lib/storage.ts`
  - Change: `orig.webp` → `full.webp` in the comments (matches `images.ts`).
  - Done when: comments name `full.webp`.
  - Verify: grep `storage.ts` for `orig.webp` (none).
  - Already-done check: no `orig.webp` in the file.

- [ ] **37. Dedupe `EditPublisher` + `loadRelations`** — `[CR#15b,c]`
  - Files: `src/components/board/ListView.tsx` (`EditPublisher`),
    `src/components/ui/Autocomplete.tsx`, `src/db/queries.ts` (`loadRelations`)
  - Change: `EditPublisher` composes `Autocomplete` instead of reimplementing
    it; `loadRelations` loops over a `[joinTable, nameTable, targetMap]` config
    instead of four copy-pasted join loops.
  - Done when: both duplications collapsed; tests pass.
  - Verify: `npm test`; `npm run test:integration` (list edit still works).
  - Already-done check: `EditPublisher` renders `Autocomplete`; `loadRelations`
    is table-driven.

- [ ] **38. Remove minor dead code** — `[CR#16]`
  - Files: `src/db/queries.ts` (`series.filter((s) => s.count > 0)`),
    `src/components/board/BoardTabs.tsx` (`{pinned && null}`)
  - Change: delete both (a GROUP BY row can't have count 0; the JSX renders
    nothing).
  - Done when: both removed.
  - Verify: `npm test`; `npx tsc --noEmit`.
  - Already-done check: neither expression present.

- [ ] **39. Scope the `listBoards` count query** — `[CR#17]`
  - Files: `src/db/queries.ts` (`listBoards`)
  - Change: join the count through `boards.userId` instead of grouping all of
    `boardComics`.
  - Done when: the count query only touches the caller's data.
  - Verify: `npm test`.
  - Already-done check: the count query filters by user.

- [ ] **40. `clone()` the sharp pipeline** — `[CR#18]`
  - Files: `src/lib/images.ts` (`processUpload`)
  - Change: `sharp(input).rotate()` once, then `.clone()` per output instead of
    constructing four pipelines.
  - Done when: one decode feeds full/thumb/blur.
  - Verify: `npm run test:integration` (upload path) or a manual upload.
  - Already-done check: `processUpload` uses `.clone()`.

- [ ] **41. Targeted cache invalidation for rating** — `[CR#19]`
  - Files: `src/lib/client-api.ts`
  - Change: for a rating-only mutation, patch the list entry with `setQueryData`
    and only invalidate `meta` when names actually changed, instead of the blunt
    `invalidateComicWorld`.
  - Done when: a star click doesn't refetch every list + all details.
  - Verify: `run`, click a star, confirm minimal refetching in the network panel.
  - Already-done check: rating path uses `setQueryData`, not full invalidation.

---

## Epics — plan each in its own session (do NOT cold-start)

Each is a multi-file feature with product/architecture decisions. Open a
planning pass (scope, schema, API shape, UI flow) before writing code. Detail
in `ROADMAP.md`.

- **Export / backup** `[RM 1a]` — highest-value epic; do early. `GET /api/export`
  zips `collection.json` + covers; CLI import re-creates via `createComic`.
  Makes every later change reversible; defuses the reseed footgun.
- **Undo delete** `[RM 1b]` — `deletedAt` column, scope all queries to
  `IS NULL`, "Undo" toast, deferred file sweep. Touches the whole query layer.
- **Metadata autofill** `[RM#3]` — the headline feature. Proxy route to
  Comic Vine / Metron / GCD; prefill the upload form. Decisions: which API, key
  handling, caching.
- **Multi-select + bulk actions** `[RM 4a]`  *(needs item 10 done)* — selection
  UI + an action bar reusing existing board/tag/delete mutations.
- **Duplicate detection at upload** `[RM 4b]` — perceptual hash per comic; warn
  on near-matches.
- **Stats page** `[RM 4c]` — counts by publisher/decade/artist, rating
  distribution, growth. `getMeta` already computes most aggregates.
- **Collector fields** `[RM 4d]` — price/value/grade/condition; schema + form +
  optional list columns + a total-value stat.
- **Public read-only board links** `[RM#5]` — **gated:** first resolve `/images`
  auth `[CR#7]` and the shared publisher/tag namespace `[CR#10]`. Sequence last.

---

### Fast path
If you only run the next few: **1** (CI) → **2, 3** (security) → **4–9** (bug
batch) → **10, 11** (touch menu). That gets the app regression-guarded,
hardened, correct, and usable on a phone before any feature work — then start
the **Export/backup** epic with its own plan.
