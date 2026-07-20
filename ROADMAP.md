# Roadmap

What to build after the bug-fix pass (see `CODE_REVIEW.md` for the fixes
themselves). Ordered by recommended sequence: data safety first, then the
biggest UX win, then collection features, then sharing. Effort estimates are
rough single-dev figures.

---

## 1. Data safety *(do first — protects everything else)*

### 1a. Export / backup — ~1 day
The whole collection is one sqlite file plus `data/covers/`. Add:

- `GET /api/export` — streams a zip: `collection.json` (comics, boards,
  memberships, in DTO form) + every cover's `full.webp`.
- An import path (CLI script is enough to start: `npm run db:import <zip>`)
  that recreates comics via the existing `createComic`, so ids/thumbs/blurs
  regenerate cleanly.

Also defuses the standing "reseed wiped my edits" failure mode — a backup is
one click before any risky operation.

### 1b. Undo delete — ~half a day
Delete is confirm-dialog-or-nothing. Replace with soft delete:

- Add `deletedAt` to `comics`; scope every query in `src/db/queries.ts` to
  `deletedAt IS NULL` (they already all go through a few list/get functions).
- Toast "Cover deleted — Undo" for ~6s (toast system already exists); undo
  clears `deletedAt`.
- Defer file deletion (`storage.delete`) to a sweep of rows deleted >24h ago,
  run opportunistically at startup.

## 2. Integration suite in CI — ~1 hour
`.github/workflows/ci.yml` runs typecheck + unit tests only. The integration
suite (`npm run test:integration`) — where the real regression coverage lives,
including the modal-animation specs — never runs automatically.
`tests/integration.mjs` already isolates its DB and honors `CHROME_PATH`;
ubuntu runners ship Chrome. Add it as a second job (or step) so it gates
merges. Expect to bump some `sleep`-based waits if the runner is slow — the
file already documents that pattern.

## 3. Metadata autofill — ~2–4 days *(biggest UX win)*
Manual entry is the app's dominant friction; the batch-upload flow carries
series/publisher/artists forward precisely because typing is tedious.

- Wire the upload form to a comics database API — Comic Vine (free API key),
  or Metron / Grand Comics Database as alternatives.
- Flow: type series + issue → server-side proxy route queries the API (keeps
  the key off the client, adds caching) → prefill publisher, cover date,
  creators, characters → user confirms/edits. `ComicFormValue` maps ~1:1 to
  what these APIs return.
- Stretch: match against the uploaded cover image itself (Comic Vine returns
  cover URLs; a perceptual-hash comparison picks the right variant).

## 4. Collection features *(independent; pick by taste)*

### 4a. Multi-select + bulk actions — ~1–2 days
Select several covers (click-drag or shift-click) → add to board / tag / set
publisher / delete. All the mutations exist; this is selection UI plus a
small action bar. The board-membership list extraction from the review
(finding #15) is a natural prerequisite.

### 4b. Duplicate detection at upload — ~1 day
Store a perceptual hash (dHash off an 9×8 grayscale downsample — sharp does
this in one pipeline step) per comic. On upload, compare against the user's
hashes and warn "this looks like a cover you already have" with a
side-by-side. Pure additive: one column, one comparison, one dialog.

### 4c. Stats page — ~1 day
Counts by publisher / decade / artist, rating distribution, growth over time.
`getMeta` already computes most aggregates; cover-date decades and
`createdAt` growth are simple additions. One page of charts; makes the
collection browsable in a new way.

### 4d. Collector fields — ~1 day
`purchasePrice`, `currentValue`, `grade` (CGC-style), `condition` on comics.
Schema migration + form fields + optional list-view columns + a total-value
stat. This is what turns "cover gallery" into "collection tracker."

## 5. Sharing — bigger; decide deliberately
Public read-only board links are the natural evolution of boards, but they
force two review findings to be resolved first:

- `/images/**` auth (review #7): shared boards need cover access for
  anonymous viewers — likely signed URLs or a per-board access check.
- The globally-shared publisher/tag namespace (review #10): renames currently
  have cross-user effects; real multi-user needs per-user or copy-on-write
  name tables.

Sequence this after the data-safety work, not before.

---

## Suggested order

1. Export/backup (1a) — everything else becomes safe to try.
2. CI integration job (2) — cheap, compounds immediately.
3. Undo delete (1b).
4. Metadata autofill (3) — the headline feature.
5. Then 4a–4d by appetite; sharing (5) only with its prerequisites.
