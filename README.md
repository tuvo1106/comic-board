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
- **Real-ESRGAN** (optional, external binary) — cover upscaling; see below
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
npm run dev          # http://localhost:3939
```

The app requires sign-in. The seed creates an owner account — log in with
`SEED_USER_EMAIL` / `SEED_USER_PASSWORD` (defaults in `src/db/seed.ts`), or
register a new one at `/signup`. In production, set `BETTER_AUTH_SECRET` (the
app refuses to boot without it).

> **Port must match `BETTER_AUTH_URL`.** better-auth only accepts sign-in from
> the origin in `BETTER_AUTH_URL` (`.env`), so the dev server has to run on that
> same port or login fails with `Invalid origin`. Both default to **3939**
> (`npm run dev` passes `-p 3939`); if you change one, change the other.

Uploaded images and the SQLite database live under `./data` (gitignored).

## Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` / `npm run start` | Production build / serve |
| `npm run db:migrate` | Apply Drizzle migrations |
| `npm run db:generate` | Generate a migration after editing `src/db/schema.ts` |
| `npm run db:seed` | Reset + seed sample data |
| `npm run db:import <zip> -- --replace` | Restore a collection from an exported backup zip |
| `npm test` | Unit tests (vitest) |
| `npm run test:integration` | Browser E2E against an isolated DB (puppeteer) |
| `npm run typecheck` | `tsc --noEmit` (kept separate from `build`; see Requirements) |
| `npm run lint` | ESLint |

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

## Upscaling covers

Optional, and off unless configured. Most covers imported from a metadata
provider are around 600px wide — about half what a retina detail view wants —
so the detail modal offers **Upscale**: it runs the cover through a local
Real-ESRGAN model, shows the result against the current one with a draggable
divider, and commits nothing until you accept. The cover it replaces is kept, so
**Revert** is always available afterwards.

Every upscale converges on a 2400px ceiling rather than a raw multiple, so the
collection stays consistent and an already-large scan doesn't balloon. Sort by
the **Size** column in list view to find the covers actually worth doing.

Upstream Real-ESRGAN has no Homebrew formula; the easiest route on macOS is the
Upscayl app, whose bundled binary and models run standalone:

```bash
brew install --cask upscayl
```

Then in `.env` (see `.env.example` for the alternatives):

```
UPSCALER_BIN=/Applications/Upscayl.app/Contents/Resources/bin/upscayl-bin
UPSCALER_MODEL=digital-art-4x
UPSCALER_MODEL_DIR=/Applications/Upscayl.app/Contents/Resources/models
```

Leave `UPSCALER_BIN` unset and the action isn't rendered at all, the same way
`METRON_API_KEY` gates metadata autofill.

> These models **invent** plausible detail rather than recovering what was lost.
> On comic line art the result usually holds up, but for a cover you care about
> a real high-res scan through **Replace cover** beats any upscale.

## Backup & restore

The whole collection can be exported as a single zip — a `collection.json`
manifest plus every cover's `full.webp`. Grab one from the account menu
(**Export backup**) or `GET /api/export`; it's one click before any risky
operation.

To restore, point `db:import` at a backup zip. It's a **replace**: it wipes the
target account's comics, boards, and covers, then rebuilds them (regenerating
ids/thumbnails/blur placeholders via the normal upload pipeline). It refuses to
run without `--replace` so it can't clobber a collection by accident:

```bash
IMPORT_USER_EMAIL=you@example.com npm run db:import path/to/backup.zip -- --replace
```

The `--` is required so npm forwards `--replace` to the script. The target
account (`IMPORT_USER_EMAIL`, or `SEED_USER_EMAIL` as a fallback) must already
exist — import is a restore, not signup.

## Roadmap

See [`CHANGELOG.md`](./CHANGELOG.md) for what's shipped and
[`ROADMAP.md`](./ROADMAP.md) for what's planned next.
