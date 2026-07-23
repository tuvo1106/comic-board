# Comic Board

A Pinterest-style board for collecting and browsing comic book covers. Upload
covers with metadata (series, issue, cover date, artists, characters), organize
them into boards shown as tabs, drag to reorder, click for a shared-element
detail view, and filter by any field with animated reflow.

Built to the spec in [`DESIGN.md`](./DESIGN.md).

## Stack

- **Next.js 16** (App Router) + React 19 + TypeScript
- **Tailwind CSS v4** — design tokens in `src/app/globals.css`
- **Motion** (Framer Motion) — layout animations, shared-element transitions
- **@dnd-kit** — accessible drag-and-drop reorder
- **SQLite + Drizzle ORM** (`better-sqlite3`) — zero-ops local persistence
- **better-auth** — email/password accounts + HTTP-only session cookie
- **sharp** — thumbnail + blur-placeholder generation on upload
- **TanStack Query** — data fetching with optimistic updates
- **zod** — shared request validation

## Requirements

- Node 22 LTS is pinned in `.nvmrc`. The app also runs on Node 25, with one
  caveat: Next 16's in-build TypeScript-check worker crashes on Node 25, so
  `next build` is configured to skip that step (`typescript.ignoreBuildErrors`)
  and we run `tsc --noEmit` separately. On Node 22 you can drop that flag.

## Getting started

```bash
npm install
npm run db:migrate   # create the SQLite schema
npm run db:seed      # load sample covers (uses real images in ./images)
npm run dev          # http://localhost:3000
```

The app requires sign-in. The seed creates an owner account — log in with
`SEED_USER_EMAIL` / `SEED_USER_PASSWORD` (defaults in `src/db/seed.ts`), or
register a new one at `/signup`. In production, set `BETTER_AUTH_SECRET` (the
app refuses to boot without it).

Uploaded images and the SQLite database live under `./data` (gitignored).

## Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` / `npm run start` | Production build / serve |
| `npm run db:migrate` | Apply Drizzle migrations |
| `npm run db:generate` | Generate a migration after editing `src/db/schema.ts` |
| `npm run db:seed` | Reset + seed sample data |
| `npm test` | Unit tests (vitest) |
| `npm run test:integration` | Browser E2E against an isolated DB (puppeteer) |

## How it's organized

```
src/
  app/
    page.tsx                    # My Comics board
    board/[id]/page.tsx         # a custom board
    comic/[id]/page.tsx         # full-page detail (deep link)
    @modal/(.)comic/[id]/       # intercepted detail modal (shared-element)
    login/, signup/             # auth pages
    api/                        # route handlers (comics, boards, meta, images, auth)
  middleware.ts                 # optimistic cookie gate for page routes
  components/
    board/    # Masonry (layout + dnd), ComicCard, BoardTabs, BoardView, ListView
    detail/   # ComicDetail modal
    filters/  # FilterBar, MultiSelect, save-as-board
    upload/   # UploadModal (drag-drop, multi-file queue)
    forms/    # MetadataForm (shared by upload + edit)
    auth/     # AuthForm (login/signup)
    ui/       # Dialog, Menu, TagInput, Autocomplete, StarRating, Toast, icons
  db/         # Drizzle schema (+ auth-schema), client, queries, migrations, seed
  lib/        # storage adapter, image processing, reorder (swap), filters, auth
```

## Notes on key decisions

- **"My Comics" is virtual** — every comic belongs to it implicitly (ordered by
  `Comic.position`), so it can never be deleted or fall out of sync. Custom
  boards store their own ordering in `board_comics.position`.
- **Fixed-column masonry** — each flow position maps to a fixed column
  (`i % columns`) rather than shortest-column packing, so drag-reordering a card
  never reshuffles unrelated cards into different columns.
- **Swap reorder** — dragging a card swaps its `position` with the drop
  target's (two single-row writes); every other card stays put, so there's no
  board-wide renumber. New cards append after the current max position.
- **Storage is abstracted** behind `StorageAdapter` (local FS today) so S3/R2 is
  a drop-in later. All DB access goes through the API layer, and every query is
  scoped to the signed-in user's id, so UI code stays out of ownership concerns.

## Roadmap

Accounts + ownership, half-star ratings, the editable list view, and CI have all
shipped (see [`DESIGN.md`](./DESIGN.md) §8). Next:

- Drag tabs to reorder boards; drag a card onto a tab to add it.
- "Smart boards" (a saved filter query instead of a snapshot).
- Cloud storage via the existing `StorageAdapter`.
- ComicVine autofill on upload.
