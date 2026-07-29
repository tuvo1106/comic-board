# Metadata provider reference

Captured from live API responses so we don't have to re-query (and burn rate
limit) to recall shapes. The provider is wrapped behind `MetadataProvider`
(`types.ts`) and normalized to `MetadataCandidate` / `MetadataDetail`.

The app uses **Metron exclusively** (Comic Vine was evaluated and dropped — its
search results were weaker). The provider abstraction remains so another source
could be added later. Key lives in `.env` (never sent to the client):
`METRON_API_KEY`.

---

## Metron — https://metron.cloud/api

- **Auth:** `Authorization: Bearer <token>` header. Tokens don't expire; managed
  at metron.cloud (revocable). (Older docs mention HTTP Basic — we use Bearer.)
- **Grain:** search is **issue**-level directly, so candidates are concrete
  issues. Detail fills in credits / covers / publisher.
- **Rate limit:** two token buckets, exposed on **every** response as headers:
  - `x-ratelimit-burst-limit: 20` + `-burst-remaining` + `-burst-reset` (epoch
    seconds) — short-term burst of 20.
  - `x-ratelimit-sustained-limit: 5000` + `-sustained-remaining` +
    `-sustained-reset` — 5000/day (reset ~24h out).
  Read these live and back off when `burst-remaining` is low; a 429 carries
  `Retry-After`.
- Paginated: `{ count, next, previous, results:[...] }`.

### Endpoints we use

1. Issue search — issue-level candidates:
   ```
   /issue/?series_name=<series>&number=<n>
   ```
   result item: `{ id, series:{ id, name, volume, year_began }, number,
   issue:"The Amazing Spider-Man (1963) #1", cover_date, store_date, image }`

2. Issue detail:
   ```
   /issue/<id>/
   ```
   - `series:{ name, year_began }`, `number`, `publisher:{ name }`.
   - **Dates:** `cover_date` (printed on cover) **and** `store_date` (actual
     release/on-sale date). The cover date runs ~2 months ahead of release.
   - `credits[]`: `{ creator:"Stan Lee", role:[{ name:"Script" }, ...] }`
     (role is an **array of objects**).
   - `image`: the primary cover URL (host `static.metron.cloud`).
   - `variants[]`: `{ name:"Second Printing Variant Cover", image, price, sku,
     upc }` — **labeled** variant covers, but with **no creator attribution**
     (can't tie a cover artist to a specific variant).
   - `characters[]`: present but **not used** — unreliable, so we don't autofill
     characters.

- Cover images (`image` + `variants[].image`) are on `static.metron.cloud`; the
  only host allowlisted in the cover proxy (`covers.ts`).

---

## Normalization (see `normalize.ts` + `metron.ts`)

- **Date field** = `store_date` (release) when present, else `cover_date`. The
  printed cover date runs ahead of release, so release date is what we surface.
- **Authors** = credits whose role matches `writer | script | plot` (Metron
  labels the writer "Script").
- **Cover artists** = intentionally **not** autofilled (Metron doesn't
  attribute covers to specific variants, so a "Cover"-role credit could
  belong to any variant, not the one the user is adding).
- **Characters** = intentionally **not** autofilled.
- **Covers** = primary `image` first (label "Main cover"), then `variants[]`
  (label = variant `name`, or "Variant N" when unnamed); de-duped by URL.
- **Cover date** → strict `yyyy-mm-dd`: `"1963-03-00"` (day 00) → `-01`;
  year-month or year-only → pad to `-01`; anything else → `null`.
- Name lists are trimmed and de-duplicated (case-insensitive, order preserved).
