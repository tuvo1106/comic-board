# Comic Board — Design Document

A Pinterest-style app for collecting and browsing comic book covers. Users upload
cover images with metadata, organize them into **boards** shown as tabs, arrange
covers via drag-and-drop, open a shared-element detail view, sort and filter by
any field, and rate their collection. The quality bar is **fluidity**: every
interaction animates smoothly with no layout jank.

This doc tracks both what is **built today** and the **roadmap** toward 1.0.
Sections tagged _(built)_ describe shipped behavior; _(planned)_ describes work
not yet implemented.

---

## 1. Status

**Built (v0.x):** upload + metadata, uniform-grid masonry board, multiple boards
as tabs (create/rename/delete, membership, save-view-as-board), drag-reorder with
fractional indexing (per board, works while filtered), shared-element detail
modal with edit/delete, filtering + search + facets scoped per board, sort
control, column-density control, portal-based overlays, unit + integration tests.

**Planned toward 1.0:** user accounts (email/password), per-user ownership of
comics & boards, 1–5 star ratings + sort-by-rating, an editable list view, and CI.

Single-user today: every comic/board is global. Auth (§9) introduces ownership.

---

## 2. Tech stack

| Layer | Choice | Notes |
|---|---|---|
| Framework | **Next.js 16 (App Router) + React 19 + TypeScript** | One deployable unit: UI + API routes + image serving. |
| Styling | **Tailwind CSS v4** | Design tokens in `src/app/globals.css` (dark, gallery-like). |
| Animation | **Motion (Framer Motion) v12** | `layout` for reflow, `layoutId` for the card→detail shared element. |
| Drag & drop | **@dnd-kit** (core + sortable) | Reorder on drop; pointer-precise collision. |
| Database | **SQLite via Drizzle ORM** (better-sqlite3) | Zero-ops; migrates cleanly to Postgres later. |
| Image storage | **Local filesystem** behind a `StorageAdapter` | S3/R2 is a drop-in later. |
| Image processing | **sharp** | full webp + ~500px thumb + tiny blur placeholder on upload. |
| Validation | **zod** | Shared request schemas. |
| Data fetching | **TanStack Query** | Optimistic reorder/edit; cache invalidation. |
| Tests | **vitest** (unit) + **puppeteer-core** (integration) | `npm test`, `npm run test:integration`. |

Node 22 LTS pinned in `.nvmrc` (runs on 25 with `typescript.ignoreBuildErrors`
since Next 16's in-build TS checker crashes there; `tsc` runs separately).

---

## 3. Data model

Current tables plus planned additions (marked _(planned)_).

```
Comic
  id            TEXT (nanoid) PK
  userId        TEXT FK → User        (planned; scopes ownership)
  series        TEXT NOT NULL
  issueNumber   TEXT                  -- "300", "Annual 1"
  publisher     TEXT                  -- filterable like series
  coverDate     TEXT (ISO yyyy-mm-dd) -- full date; day-level
  rating        INTEGER               (planned; 1–5, nullable = unrated)
  imagePath, thumbPath, blurDataUrl TEXT NOT NULL
  width, height INTEGER NOT NULL      -- aspect-ratio reservation
  position      REAL NOT NULL         -- My Comics drag order
  createdAt     INTEGER NOT NULL

Board            (id PK, userId FK→User [planned], name, tabPosition REAL, createdAt)
BoardComic       (boardId FK, comicId FK, position REAL, addedAt) PK(boardId,comicId)

Author           (id PK, name, nameKey UNIQUE)   ComicAuthor    (comicId FK, authorId FK)
Artist           (id PK, name, nameKey UNIQUE)   ComicArtist    (comicId FK, artistId FK)   -- cover artists
Character        (id PK, name, nameKey UNIQUE)   ComicCharacter (comicId FK, characterId FK)
Tag              (id PK, name, nameKey UNIQUE)    ComicTag       (comicId FK, tagId FK)       -- facsimile, homage, key issue, variant…

User             (planned; id PK, email UNIQUE, passwordHash, createdAt)
Session          (planned; id PK, userId FK, expiresAt)
```

Notes:
- **"My Comics" is virtual** — every comic belongs to it implicitly, ordered by
  `Comic.position`, so it can never be deleted or desynced. Custom boards store
  their own ordering in `BoardComic.position`.
- **Author, Cover Artist, Character, Tag are normalized** (own tables + join +
  case-insensitive `nameKey` dedupe) because they drive filter facets with counts.
- **Publisher** is a plain column, filterable by distinct value (like series).
- **Notes** and the boolean **facsimile** field were removed; facsimile is now a
  Tag, and free-text notes were dropped in favor of structured catalog metadata.
- Deleting a board removes only its `BoardComic` rows; deleting a comic cascades
  out of every join table and deletes its image files.

---

## 4. API

Next route handlers under `/api`; zod-validated, 400 with field errors on failure.

| Method & path | Purpose |
|---|---|
| `GET /api/comics?board=<id>` | List comics (joined authors/artists/characters/tags + board memberships), ordered by position. |
| `POST /api/comics` | Multipart upload: image + metadata JSON (+ optional `boardIds`). |
| `PATCH /api/comics/:id` | Update metadata (series, issue, publisher, coverDate, authors, artists, characters, tags[, rating]). |
| `DELETE /api/comics/:id` | Delete row + memberships + image files. |
| `PATCH /api/comics/:id/position` | `{ position, boardId? }` — single-row reorder. |
| `GET/POST /api/boards`, `PATCH/DELETE /api/boards/:id` | Board CRUD (POST accepts `comicIds` for save-view). |
| `PUT/DELETE /api/boards/:id/comics/:comicId` | Add / remove membership. |
| `GET /api/meta` | Global distinct values + counts — powers **form autocomplete**. |
| `GET /images/[...path]` | Serve stored covers, `Cache-Control: immutable`. |
| `POST /api/auth/signup`, `/login`, `/logout` | _(planned)_ email/password + session cookie. |

**Facet counts vs. autocomplete:** filter dropdown facets are computed
**client-side from the current board's comics** (`computeFacets`) so counts match
what's on screen; `/api/meta` supplies the **global** suggestion list for the
upload/edit form. Filtering/sorting run client-side for instant animated reflow;
the `board` param scopes the list server-side.

---

## 5. UI & interaction (built)

- **Board tabs** — pinned "My Comics" + custom boards + "+"; sliding active
  indicator (`layoutId`); per-tab "…" menu (Rename/Delete) rendered in a portal so
  the scrollable/blurred tab strip can't clip it. Routes: `/`, `/board/[id]`.
- **Masonry** — **fixed-column** layout (`i % columns`), not shortest-column, so
  reordering never reshuffles unrelated cards. Cards are a **uniform height**
  (standard comic ratio, object-cover) for aligned rows; positions animate via
  transforms. Column count is responsive with a user **density control** (Auto/3/4/5/6).
- **Cards** — blur placeholder → thumb crossfade; hover shows series + issue and a
  "…" menu (add-to-board checklist, remove-from-board, delete).
- **Drag reorder** — dnd-kit, 8px activation, reorder **on drop** (stable on a
  variable board), pointer-precise collision, per-board fractional-index
  persistence with optimistic cache update. Works **while filtered** (drops
  relative to visible neighbors; hidden comics keep their positions).
- **Detail modal** — route-backed intercepting modal with shared-element cover,
  clickable facet chips (apply filter), boards membership, ←/→ nav, inline-confirm
  delete, and **edit mode** (the metadata panel becomes the shared `MetadataForm`).
- **Filter + search + sort** — facet dropdowns (Publisher, Author, Cover Artist,
  Character, Tag), a **date-range calendar**, debounced search; URL-backed
  (shareable). **Sort**: Manual / Cover date / Date added / Series — default is
  **Cover date on My Comics** and **Manual on custom boards**; drag enabled only in
  Manual. Animated reflow via Motion `layout` + `AnimatePresence`.
- **Upload** — drag-drop zone, local preview, multi-file queue carrying
  series/publisher/authors/artists/boards forward, board pre-selection.
- **Overlays** — `Dialog` and `Menu` render through React portals to `document.body`
  so ancestor `overflow`/`backdrop-filter` never clips or mis-positions them.

### Fluidity acceptance criteria
Only animate transform/opacity; no CLS from image loads (dimensions reserved);
click vs. drag never misfires; shared-element open/close is continuous; springs
for movement, durations for fades.

---

## 6. Testing

- **Unit (`npm test`, vitest):** pure logic — `applyFilters`, `computeFacets`,
  filter URL round-trip, `sortComics`, fractional indexing, masonry math, id/name
  helpers.
- **Integration (`npm run test:integration`, puppeteer):** drives the real app in
  a headless browser against an **isolated** db (`./data/test`), port 3940, and
  build dir (`.next-itest`), all torn down after — never touches dev data. Covers
  filter-click rendering, board-scoped facet counts, drag persistence, the detail
  modal, edit persistence, per-board sort defaults, and portal overlays.
- **CI** _(planned, §9):** GitHub Actions running install → `tsc` → unit tests → build.

---

## 7. Project structure

```
src/
  app/            page.tsx (My Comics), board/[id], comic/[id],
                  @modal/(.)comic/[id] (intercepted), api/*, images/[...path]
  components/     board/ (Masonry+layout, ComicCard(+Menu), BoardTabs, BoardView,
                          Sort/Column selectors), detail/ (ComicDetail),
                  filters/ (FilterBar, MultiSelect), upload/ (UploadModal),
                  forms/ (MetadataForm), ui/ (Dialog, Menu, TagInput, Autocomplete,
                          Toast, icons)
  db/             schema, client, queries, migrations, seed
  lib/            storage, images, fractional-index, filters, sort, use-* hooks,
                  schemas (zod), types (DTOs)
tests/            integration.mjs
data/             sqlite + covers/ (gitignored)
```

---

## 8. Roadmap toward 1.0

Ordered; each is a self-contained slice.

### 8.1 Accounts & ownership (email/password) — _done_
- **better-auth** (email/password) with the Drizzle/sqlite adapter; `user`,
  `session`, `account`, `verification` tables. Sessions in an HTTP-only cookie.
- Nullable `userId` FK on `comics` and `boards`. **The seed creates the owner
  first** (known creds via `SEED_USER_EMAIL`/`SEED_USER_PASSWORD`, defaults in
  `seed.ts`) and seeds the whole collection under them. A
  `databaseHooks.user.create.after` hook remains as a safety net: the first
  account claims any genuinely unowned rows (e.g. a real pre-auth migration).
- **Scoping:** every query in `db/queries.ts` takes a `userId` and filters/sets by
  it (a null userId = the unowned pool for seeding). API routes resolve the
  session (`getUserId`) and 401 when absent.
- **UI:** `/signup` and `/login` pages, a user menu with logout in the top bar,
  `middleware.ts` optimistic cookie gate redirecting unauthenticated page views to
  `/login`, and a client 401 → `/login` redirect.

### 8.2 Ratings (1–5 stars)
- `Comic.rating` INTEGER (1–5, null = unrated). `PATCH /api/comics/:id` accepts it.
- **UI:** a star control in the detail modal + editable list view; clicking sets/clears.
- **Sort:** add **"Rating (high→low)"** to the sort options (unrated sinks last),
  plus a rating facet/filter is a later nicety.

### 8.3 List view with inline row editing — _done_
- A **grid ⇄ list** view toggle in the board toolbar (`useView`, persisted in
  localStorage like column density). Column density control hides in list mode.
- List view: a table of rows (thumbnail → detail, series, issue, publisher, cover
  date, authors, cover artists, tags, **rating stars**, row "…" menu). Every field
  is **editable in place** — click-to-edit text/date cells, inline `TagInput` for
  the multi-value fields, always-live `StarRating` — saving through
  `PATCH /api/comics/:id` with the modal edit's optimistic-cache flow. No modal.
- Sorting/filtering/search apply identically to both views (both render `filtered`).

### 8.4 CI
- GitHub Actions on push/PR: Node 22, `npm ci`, `tsc --noEmit`, `npm test`, `npm run build`.
- Integration tests optional in CI (needs a headless Chrome); gate behind a job
  that installs Chrome, or keep local-only initially.

### 8.5 Later (design-for, don't build yet)
- **Spec-driven behaviors** — convert the current feature set + ad-hoc test flows
  into structured specs (per-feature behavior specs / BDD-style test descriptions)
  the unit + integration suites map onto. Formalize eventually.
- **Cloud storage** via the existing `StorageAdapter`.
- **Smart boards** — a board backed by a stored filter query (live counterpart to
  save-view snapshots); `Board.query` JSON column.
- **Drag card → tab** to add to a board; **drag tabs** to reorder.
- **ComicVine autofill** on upload (field structure already matches).
- **Server-side filtering + virtualization** for very large collections.
- Sharing / public boards.

---

## 9. Release

- **1.0** = accounts + ownership (§8.1 ✓), ratings (§8.2 ✓), list view (§8.3 ✓),
  CI (§8.4 ✓), on top of the shipped board experience — **all landed**.
- On `main`, CI green. Ready to tag `v1.0.0`.
