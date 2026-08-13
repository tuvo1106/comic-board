import { and, eq, inArray, isNotNull, isNull, lt, or, sql, type SQL } from "drizzle-orm";
import type { SQLiteColumn, SQLiteTable } from "drizzle-orm/sqlite-core";
import { newId, nameKey } from "@/lib/ids";
import { positionAfterMax } from "@/lib/positions";
import { coverDir, storage } from "@/lib/storage";
import type { BoardDTO, ComicDTO, MetaDTO } from "@/lib/types";
import type { ProcessedImage } from "@/lib/images";
import { db } from "./client";
import {
  artists,
  authors,
  boardComics,
  boards,
  characters,
  comicArtists,
  comicAuthors,
  comicCharacters,
  comicTags,
  comics,
  publishers,
  tags,
  type ComicRow,
} from "./schema";

/** Either the top-level db handle or a transaction handle (same connection). */
type DBOrTx = typeof db | Parameters<Parameters<(typeof db)["transaction"]>[0]>[0];

// Every exported query takes the current user's id and scopes reads/writes to
// it, so users never see or touch each other's comics and boards. A null userId
// means the "unowned" pool (seeded data before anyone signs up); the first
// account to sign up claims it (see auth databaseHooks).
function ownedBy(col: SQLiteColumn, userId: string | null): SQL {
  return userId == null ? isNull(col) : eq(col, userId);
}

// Every read of `comics` excludes soft-deleted rows (see `deleteComic`);
// `sweepDeletedComics` is the sole exception, by design.
function notDeleted(): SQL {
  return isNull(comics.deletedAt);
}

// ---------------------------------------------------------------------------
// Normalized name tables (authors/artists/characters/tags are shared globally;
// a comic's associations are user-scoped via the comic itself)
// ---------------------------------------------------------------------------

/** A name-bearing table: authors, artists, characters, or tags. */
type NameTable = typeof authors | typeof artists | typeof characters | typeof tags;

/** The four relation kinds, which are also their `ComicDTO`/`MetaDTO` keys. */
type NameKey = "authors" | "artists" | "characters" | "tags";

interface NameRelation {
  key: NameKey;
  nameTable: NameTable;
  joinTable: SQLiteTable;
  comicIdCol: SQLiteColumn;
  /** FK column into `nameTable`, for joins. */
  fkCol: SQLiteColumn;
  /**
   * The same FK as a TS property name. Needed because an insert row has to be
   * built dynamically (`{ comicId, authorId }` vs `{ comicId, tagId }`), and
   * `fkCol.name` is the *database* column (`author_id`), not the key Drizzle
   * expects in `.values()`.
   */
  fkKey: "authorId" | "artistId" | "characterId" | "tagId";
}

/**
 * The four name-association tables share one shape: a join row carrying a
 * comicId plus a foreign key into a globally-shared name table. Loading them,
 * writing them, and faceting them are all driven from this single list rather
 * than four copy-pasted blocks per operation — adding a fifth relation kind
 * (say, colorists) means adding one entry here, not editing four functions.
 */
const NAME_RELATIONS: NameRelation[] = [
  {
    key: "authors",
    nameTable: authors,
    joinTable: comicAuthors,
    comicIdCol: comicAuthors.comicId,
    fkCol: comicAuthors.authorId,
    fkKey: "authorId",
  },
  {
    key: "artists",
    nameTable: artists,
    joinTable: comicArtists,
    comicIdCol: comicArtists.comicId,
    fkCol: comicArtists.artistId,
    fkKey: "artistId",
  },
  {
    key: "characters",
    nameTable: characters,
    joinTable: comicCharacters,
    comicIdCol: comicCharacters.comicId,
    fkCol: comicCharacters.characterId,
    fkKey: "characterId",
  },
  {
    key: "tags",
    nameTable: tags,
    joinTable: comicTags,
    comicIdCol: comicTags.comicId,
    fkCol: comicTags.tagId,
    fkKey: "tagId",
  },
];

/** Empty per-kind accumulator, so callers never have to spell the four out. */
function emptyNameMaps(): Record<NameKey, Map<string, string[]>> {
  return { authors: new Map(), artists: new Map(), characters: new Map(), tags: new Map() };
}

/**
 * Point a comic at a set of names for one relation kind, creating any name rows
 * that don't exist yet. Callers that are *replacing* (rather than adding to) a
 * comic's names must delete the existing join rows first — see `updateComic`.
 */
function addAssociations(
  tx: DBOrTx,
  rel: NameRelation,
  comicId: string,
  names: string[],
): void {
  for (const nameId of upsertNames(tx, rel.nameTable, names)) {
    tx.insert(rel.joinTable)
      // Built dynamically from `fkKey`, so it can't be statically typed against
      // any one join table's row shape; every value here is a real column.
      .values({ comicId, [rel.fkKey]: nameId } as never)
      .onConflictDoNothing()
      .run();
  }
}

function upsertNames(handle: DBOrTx, table: NameTable, names: string[]): string[] {
  const ids: string[] = [];
  for (const raw of names) {
    const name = raw.trim();
    if (!name) continue;
    const key = nameKey(name);
    const existing = handle.select({ id: table.id }).from(table).where(eq(table.nameKey, key)).get();
    if (existing) {
      ids.push(existing.id);
    } else {
      const id = newId();
      handle.insert(table).values({ id, name, nameKey: key }).run();
      ids.push(id);
    }
  }
  return ids;
}

/** Resolve a publisher name to its (find-or-created) row id; null clears it. */
function upsertPublisher(handle: DBOrTx, name: string | null | undefined): string | null {
  if (name == null) return null;
  const trimmed = name.trim();
  if (!trimmed) return null;
  const key = nameKey(trimmed);
  const existing = handle
    .select({ id: publishers.id })
    .from(publishers)
    .where(eq(publishers.nameKey, key))
    .get();
  if (existing) return existing.id;
  const id = newId();
  handle.insert(publishers).values({ id, name: trimmed, nameKey: key }).run();
  return id;
}

// ---------------------------------------------------------------------------
// Mapping rows -> DTOs
// ---------------------------------------------------------------------------

function rowToDTO(
  row: ComicRow,
  names: {
    publisher: string | null;
    authors: string[];
    artists: string[];
    characters: string[];
    tags: string[];
    boardIds: string[];
  },
): ComicDTO {
  return {
    id: row.id,
    series: row.series,
    issueNumber: row.issueNumber,
    publisher: names.publisher,
    coverDate: row.coverDate,
    rating: row.rating,
    notes: row.notes,
    imageUrl: storage.getUrl(row.imagePath),
    thumbUrl: storage.getUrl(row.thumbPath),
    blurDataUrl: row.blurDataUrl,
    width: row.width,
    height: row.height,
    upscaled: row.originalImagePath != null,
    position: row.position,
    createdAt: row.createdAt,
    authors: names.authors,
    artists: names.artists,
    characters: names.characters,
    tags: names.tags,
    boardIds: names.boardIds,
  };
}

/** Batch-load authors, artists, characters, tags, and board memberships. */
function loadRelations(handle: DBOrTx, comicIds: string[]) {
  const names = emptyNameMaps();
  const boardsByComic = new Map<string, string[]>();
  const publisherByComic = new Map<string, string>();
  if (comicIds.length === 0) return { names, boardsByComic, publisherByComic };

  for (const r of handle
    .select({ comicId: comics.id, name: publishers.name })
    .from(comics)
    .innerJoin(publishers, eq(publishers.id, comics.publisherId))
    .where(inArray(comics.id, comicIds))
    .all())
    publisherByComic.set(r.comicId, r.name);

  const push = (m: Map<string, string[]>, k: string, v: string) => {
    const list = m.get(k) ?? [];
    list.push(v);
    m.set(k, list);
  };

  for (const rel of NAME_RELATIONS) {
    for (const r of handle
      .select({ comicId: rel.comicIdCol, name: rel.nameTable.name })
      .from(rel.joinTable)
      .innerJoin(rel.nameTable, eq(rel.nameTable.id, rel.fkCol))
      .where(inArray(rel.comicIdCol, comicIds))
      .all())
      push(names[rel.key], r.comicId as string, r.name as string);
  }

  for (const r of handle
    .select({ comicId: boardComics.comicId, boardId: boardComics.boardId })
    .from(boardComics)
    .where(inArray(boardComics.comicId, comicIds))
    .all())
    push(boardsByComic, r.comicId, r.boardId);

  return { names, boardsByComic, publisherByComic };
}

const sortNames = (a: string[]) => [...a].sort((x, y) => x.localeCompare(y));

/** Assemble one comic's DTO from a batch-loaded relation set. */
function toDTO(row: ComicRow, rel: ReturnType<typeof loadRelations>): ComicDTO {
  return rowToDTO(row, {
    publisher: rel.publisherByComic.get(row.id) ?? null,
    authors: sortNames(rel.names.authors.get(row.id) ?? []),
    artists: sortNames(rel.names.artists.get(row.id) ?? []),
    characters: sortNames(rel.names.characters.get(row.id) ?? []),
    tags: sortNames(rel.names.tags.get(row.id) ?? []),
    boardIds: rel.boardsByComic.get(row.id) ?? [],
  });
}

function attachRelations(rows: ComicRow[]): ComicDTO[] {
  const rel = loadRelations(db, rows.map((r) => r.id));
  return rows.map((row) => toDTO(row, rel));
}

// ---------------------------------------------------------------------------
// Comics
// ---------------------------------------------------------------------------

export function listComics(userId: string, boardId?: string | null): ComicDTO[] {
  if (boardId) {
    const rows = db
      .select({ comic: comics, pos: boardComics.position })
      .from(boardComics)
      .innerJoin(comics, eq(comics.id, boardComics.comicId))
      .where(and(eq(boardComics.boardId, boardId), eq(comics.userId, userId), notDeleted()))
      .orderBy(boardComics.position)
      .all();
    return attachRelations(rows.map((r) => ({ ...r.comic, position: r.pos })));
  }
  const rows = db
    .select()
    .from(comics)
    .where(and(eq(comics.userId, userId), notDeleted()))
    .orderBy(comics.position)
    .all();
  return attachRelations(rows);
}

export function getComic(userId: string, id: string): ComicDTO | null {
  const row = db
    .select()
    .from(comics)
    .where(and(eq(comics.id, id), eq(comics.userId, userId), notDeleted()))
    .get();
  if (!row) return null;
  return attachRelations([row])[0];
}

export interface CreateComicInput {
  userId: string | null; // null = unowned (seed); real id from the API
  series: string;
  issueNumber?: string | null;
  publisher?: string | null;
  coverDate?: string | null;
  rating?: number | null;
  notes?: string | null;
  authors: string[];
  artists: string[]; // cover artists
  characters: string[];
  tags: string[];
  boardIds: string[];
  image: ProcessedImage;
}

export function createComic(input: CreateComicInput): ComicDTO {
  const id = input.image.id;
  const now = Date.now();

  return db.transaction((tx) => {
    const maxPos = tx
      .select({ m: sql<number>`max(${comics.position})` })
      .from(comics)
      .where(and(ownedBy(comics.userId, input.userId), notDeleted()))
      .get();
    const position = positionAfterMax(maxPos?.m ?? null);

    tx.insert(comics)
      .values({
        id,
        userId: input.userId,
        series: input.series,
        issueNumber: input.issueNumber ?? null,
        publisherId: upsertPublisher(tx, input.publisher),
        coverDate: input.coverDate ?? null,
        rating: input.rating ?? null,
        notes: input.notes ?? null,
        imagePath: input.image.imagePath,
        thumbPath: input.image.thumbPath,
        blurDataUrl: input.image.blurDataUrl,
        width: input.image.width,
        height: input.image.height,
        position,
        createdAt: now,
      })
      .run();

    for (const rel of NAME_RELATIONS) addAssociations(tx, rel, id, input[rel.key]);

    for (const boardId of input.boardIds) {
      const owned = tx
        .select({ id: boards.id })
        .from(boards)
        .where(and(eq(boards.id, boardId), ownedBy(boards.userId, input.userId)))
        .get();
      if (owned) addComicToBoardTx(tx, boardId, id, now);
    }

    return getComicTx(tx, id)!;
  });
}

export interface UpdateComicInput {
  series?: string;
  issueNumber?: string | null;
  publisher?: string | null;
  coverDate?: string | null;
  rating?: number | null;
  notes?: string | null;
  authors?: string[];
  artists?: string[];
  characters?: string[];
  tags?: string[];
}

export function updateComic(
  userId: string,
  id: string,
  input: UpdateComicInput,
): ComicDTO | null {
  const owned = db
    .select({ id: comics.id })
    .from(comics)
    .where(and(eq(comics.id, id), eq(comics.userId, userId), notDeleted()))
    .get();
  if (!owned) return null;

  return db.transaction((tx) => {
    const fields: Partial<ComicRow> = {};
    if (input.series !== undefined) fields.series = input.series;
    if (input.issueNumber !== undefined) fields.issueNumber = input.issueNumber;
    if (input.publisher !== undefined) fields.publisherId = upsertPublisher(tx, input.publisher);
    if (input.coverDate !== undefined) fields.coverDate = input.coverDate;
    if (input.rating !== undefined) fields.rating = input.rating;
    if (input.notes !== undefined) fields.notes = input.notes;
    if (Object.keys(fields).length > 0) {
      tx.update(comics).set(fields).where(eq(comics.id, id)).run();
    }

    // An absent field means "leave unchanged"; a present one replaces the whole
    // set, so the existing join rows go first (see `comicUpdateSchema`, which
    // deliberately omits array defaults for exactly this reason).
    for (const rel of NAME_RELATIONS) {
      const names = input[rel.key];
      if (names === undefined) continue;
      tx.delete(rel.joinTable).where(eq(rel.comicIdCol, id)).run();
      addAssociations(tx, rel, id, names);
    }
    return getComicTx(tx, id)!;
  });
}

/** Soft delete: stamps `deletedAt`. Row + files are removed later by the
 *  sweep (`sweepDeletedComics`), not here — this is what makes undo possible. */
export function deleteComic(userId: string, id: string): boolean {
  const res = db
    .update(comics)
    .set({ deletedAt: Date.now() })
    .where(and(eq(comics.id, id), eq(comics.userId, userId), notDeleted()))
    .run();
  return res.changes > 0;
}

/** Undo: clears `deletedAt`. False if the comic isn't owned or isn't deleted. */
export function restoreComic(userId: string, id: string): boolean {
  const res = db
    .update(comics)
    .set({ deletedAt: null })
    .where(and(eq(comics.id, id), eq(comics.userId, userId), isNotNull(comics.deletedAt)))
    .run();
  return res.changes > 0;
}

/**
 * Hard-delete + clean up cover files for comics soft-deleted more than
 * `maxAgeMs` ago (default 24h). Not user-scoped — a maintenance sweep across
 * every account, meant to run opportunistically once per server start (see
 * `src/instrumentation.ts`), not on a per-request path.
 */
export async function sweepDeletedComics(maxAgeMs = 24 * 60 * 60 * 1000): Promise<number> {
  const cutoff = Date.now() - maxAgeMs;
  const rows = db
    .select({
      id: comics.id,
      imagePath: comics.imagePath,
      // An upscaled comic keeps its pre-upscale cover in a second folder. The
      // sweep is the only thing that ever collects cover files, so missing this
      // left that folder on disk forever once the row was gone.
      originalImagePath: comics.originalImagePath,
    })
    .from(comics)
    .where(and(isNotNull(comics.deletedAt), lt(comics.deletedAt, cutoff)))
    .all();
  for (const row of rows) {
    db.delete(comics).where(eq(comics.id, row.id)).run(); // cascades join rows
    const dirs = new Set([coverDir(row.imagePath)]);
    if (row.originalImagePath) dirs.add(coverDir(row.originalImagePath));
    for (const dir of dirs) await storage.deletePrefix(dir); // full.webp + thumb.webp + folder
  }
  return rows.length;
}

/**
 * Delete cover folders no comic references, last written more than `minAgeMs`
 * ago (default 6h). Returns how many were removed.
 *
 * The accept/discard pair handles the ordinary paths, but an upscale candidate
 * is written to disk *before* anyone decides its fate — so closing the dialog
 * mid-run, navigating away, a crash, or a restart all leave a real folder that
 * nothing will ever point at. Rather than chase each of those, this collects
 * anything unreferenced: self-healing regardless of how the orphan happened,
 * including ones predating this sweep.
 *
 * The age floor is the whole safety story. A candidate is unreferenced *by
 * design* between being generated and being accepted, so sweeping recent
 * folders would delete previews out from under the dialog showing them. Six
 * hours is far beyond any plausible decision, and this only runs at startup.
 *
 * Not user-scoped: it asks "does any row anywhere point at this folder?", and
 * scoping would make one account's covers look orphaned to another's sweep.
 */
export async function sweepOrphanedCovers(minAgeMs = 6 * 60 * 60 * 1000): Promise<number> {
  const dirs = await storage.listCoverDirs();
  if (dirs.length === 0) return 0;

  // Includes soft-deleted rows: those still own their files until the deleted
  // sweep hard-deletes them, and undo has to be able to bring them back.
  const referenced = new Set<string>();
  for (const row of db
    .select({ imagePath: comics.imagePath, originalImagePath: comics.originalImagePath })
    .from(comics)
    .all()) {
    referenced.add(coverDir(row.imagePath));
    if (row.originalImagePath) referenced.add(coverDir(row.originalImagePath));
  }

  const cutoff = Date.now() - minAgeMs;
  let removed = 0;
  for (const dir of dirs) {
    if (referenced.has(dir.key) || dir.modifiedAt > cutoff) continue;
    await storage.deletePrefix(dir.key).catch(() => {});
    removed += 1;
  }
  return removed;
}

/**
 * Swap a comic's cover to an already-processed image, keeping all metadata and
 * board memberships. The new image lives in its own `covers/<newId>/` folder, so
 * `imageUrl`/`thumbUrl` change — busting the `immutable` cache without a
 * per-comic version. The old folder is deleted afterward. Returns null if the
 * comic isn't owned by the user.
 */
export async function replaceComicCover(
  userId: string,
  id: string,
  image: ProcessedImage,
): Promise<ComicDTO | null> {
  const row = db
    .select({
      imagePath: comics.imagePath,
      thumbPath: comics.thumbPath,
      originalImagePath: comics.originalImagePath,
    })
    .from(comics)
    .where(and(eq(comics.id, id), eq(comics.userId, userId), notDeleted()))
    .get();
  if (!row) return null;

  const dto = db.transaction((tx) => {
    tx.update(comics)
      .set({
        imagePath: image.imagePath,
        thumbPath: image.thumbPath,
        blurDataUrl: image.blurDataUrl,
        width: image.width,
        height: image.height,
        // Deliberately cleared. A replacement supersedes any upscale history:
        // the kept original belonged to the cover being replaced, not to this
        // one. Leaving it set kept `upscaled: true` and the Revert action alive
        // for a cover that was never upscaled — and taking it would have
        // restored the stale original *and deleted the image just uploaded*.
        originalImagePath: null,
      })
      .where(eq(comics.id, id))
      .run();
    return getComicTx(tx, id)!;
  });

  // Best-effort cleanup of the folders nothing points at any more: the cover
  // being replaced, and any pre-upscale original now dropped above.
  const keep = coverDir(image.imagePath);
  for (const stale of [row.imagePath, row.originalImagePath]) {
    if (!stale) continue;
    const dir = coverDir(stale);
    if (dir !== keep) await storage.deletePrefix(dir).catch(() => {});
  }
  return dto;
}

/**
 * Commit an accepted upscale: repoint the comic at the new image and remember
 * the cover it replaced so it can be restored.
 *
 * Unlike `replaceComicCover` this does NOT delete the outgoing folder — that
 * folder *is* the backup. `originalImagePath` is written only if it's still
 * null, so upscaling an already-upscaled cover still reverts to the true
 * original rather than to a generated intermediate. Returns null if the comic
 * isn't owned by the user.
 */
export async function acceptUpscale(
  userId: string,
  id: string,
  image: ProcessedImage,
): Promise<ComicDTO | null> {
  const row = db
    .select({ imagePath: comics.imagePath, originalImagePath: comics.originalImagePath })
    .from(comics)
    .where(and(eq(comics.id, id), eq(comics.userId, userId), notDeleted()))
    .get();
  if (!row) return null;

  // Upscaling an already-upscaled cover: the outgoing image is itself a
  // generated one, and once we repoint away from it nothing references it —
  // `originalImagePath` stays pinned to the true original, revert only ever
  // deletes the *current* image, and the sweep only looks at deleted comics. So
  // it has to be collected here or it leaks a 2400px webp per repeat upscale.
  const supersededGenerated = row.originalImagePath ? row.imagePath : null;

  const dto = db.transaction((tx) => {
    tx.update(comics)
      .set({
        imagePath: image.imagePath,
        thumbPath: image.thumbPath,
        blurDataUrl: image.blurDataUrl,
        width: image.width,
        height: image.height,
        originalImagePath: row.originalImagePath ?? row.imagePath,
      })
      .where(eq(comics.id, id))
      .run();
    return getComicTx(tx, id)!;
  });

  if (supersededGenerated && coverDir(supersededGenerated) !== coverDir(image.imagePath)) {
    await storage.deletePrefix(coverDir(supersededGenerated)).catch(() => {});
  }
  return dto;
}

/**
 * Undo an accepted upscale, restoring the kept original and deleting the
 * generated cover. Dimensions are re-read from the restored file rather than
 * stored separately — one source of truth, and the masonry needs them exact.
 * Returns null if the comic isn't owned or was never upscaled.
 */
export async function revertUpscale(
  userId: string,
  id: string,
  readSize: (key: string) => Promise<{ width: number; height: number; blurDataUrl: string }>,
): Promise<ComicDTO | null> {
  const row = db
    .select({ imagePath: comics.imagePath, originalImagePath: comics.originalImagePath })
    .from(comics)
    .where(and(eq(comics.id, id), eq(comics.userId, userId), notDeleted()))
    .get();
  if (!row?.originalImagePath) return null;

  const original = row.originalImagePath;
  const meta = await readSize(original);

  const dto = db.transaction((tx) => {
    tx.update(comics)
      .set({
        imagePath: original,
        thumbPath: original.replace(/[^/]+$/, "thumb.webp"),
        blurDataUrl: meta.blurDataUrl,
        width: meta.width,
        height: meta.height,
        originalImagePath: null,
      })
      .where(eq(comics.id, id))
      .run();
    return getComicTx(tx, id)!;
  });

  // Only now that nothing points at it, drop the generated cover.
  if (coverDir(row.imagePath) !== coverDir(original)) {
    await storage.deletePrefix(coverDir(row.imagePath)).catch(() => {});
  }
  return dto;
}

/**
 * Is this cover key in use by any comic, as either its live cover or its kept
 * pre-upscale original?
 *
 * Not user-scoped on purpose. It's the authorization check for a path supplied
 * by the client (see the upscale route), and the question being asked is "is
 * this a free-floating candidate?" — a key belonging to *anyone* answers no.
 * Scoping it to the caller would let one account name another's cover and have
 * it treated as adoptable.
 */
export function isCoverReferenced(imagePath: string): boolean {
  const hit = db
    .select({ id: comics.id })
    .from(comics)
    .where(or(eq(comics.imagePath, imagePath), eq(comics.originalImagePath, imagePath)))
    .get();
  return Boolean(hit);
}

/** Discard a previewed-but-unaccepted upscale's files. */
export async function discardUpscale(imagePath: string): Promise<void> {
  await storage.deletePrefix(coverDir(imagePath)).catch(() => {});
}

export function updateComicPosition(
  userId: string,
  comicId: string,
  position: number,
  boardId?: string | null,
): boolean {
  if (boardId) {
    const owned = db
      .select({ id: boards.id })
      .from(boards)
      .where(and(eq(boards.id, boardId), eq(boards.userId, userId)))
      .get();
    if (!owned) return false;
    const res = db
      .update(boardComics)
      .set({ position })
      .where(and(eq(boardComics.boardId, boardId), eq(boardComics.comicId, comicId)))
      .run();
    return res.changes > 0;
  }
  const res = db
    .update(comics)
    .set({ position })
    .where(and(eq(comics.id, comicId), eq(comics.userId, userId), notDeleted()))
    .run();
  return res.changes > 0;
}

// ---------------------------------------------------------------------------
// Boards
// ---------------------------------------------------------------------------

export function listBoards(userId: string): BoardDTO[] {
  const rows = db
    .select()
    .from(boards)
    .where(eq(boards.userId, userId))
    .orderBy(boards.tabPosition)
    .all();
  const counts = db
    .select({ boardId: boardComics.boardId, c: sql<number>`count(*)` })
    .from(boardComics)
    .innerJoin(boards, and(eq(boards.id, boardComics.boardId), eq(boards.userId, userId)))
    .groupBy(boardComics.boardId)
    .all();
  const countMap = new Map(counts.map((c) => [c.boardId, c.c]));
  return rows.map((b) => ({
    id: b.id,
    name: b.name,
    tabPosition: b.tabPosition,
    count: countMap.get(b.id) ?? 0,
    createdAt: b.createdAt,
  }));
}

export function createBoard(
  userId: string | null,
  name: string,
  comicIds?: string[],
): BoardDTO {
  const id = newId();
  const now = Date.now();
  return db.transaction((tx) => {
    const maxPos = tx
      .select({ m: sql<number>`max(${boards.tabPosition})` })
      .from(boards)
      .where(ownedBy(boards.userId, userId))
      .get();
    const tabPosition = positionAfterMax(maxPos?.m ?? null);
    tx.insert(boards).values({ id, userId, name, tabPosition, createdAt: now }).run();

    if (comicIds && comicIds.length > 0) {
      let pos = 1;
      for (const comicId of comicIds) {
        const owned = tx
          .select({ id: comics.id })
          .from(comics)
          .where(and(eq(comics.id, comicId), ownedBy(comics.userId, userId)))
          .get();
        if (!owned) continue;
        tx.insert(boardComics)
          .values({ boardId: id, comicId, position: pos, addedAt: now })
          .onConflictDoNothing()
          .run();
        pos += 1;
      }
    }
    const count = tx
      .select({ c: sql<number>`count(*)` })
      .from(boardComics)
      .where(eq(boardComics.boardId, id))
      .get();
    return { id, name, tabPosition, count: count?.c ?? 0, createdAt: now };
  });
}

export function updateBoard(
  userId: string,
  id: string,
  fields: { name?: string; tabPosition?: number },
): boolean {
  const set: Record<string, unknown> = {};
  if (fields.name !== undefined) set.name = fields.name;
  if (fields.tabPosition !== undefined) set.tabPosition = fields.tabPosition;
  if (Object.keys(set).length === 0) return true;
  const res = db
    .update(boards)
    .set(set)
    .where(and(eq(boards.id, id), eq(boards.userId, userId)))
    .run();
  return res.changes > 0;
}

export function deleteBoard(userId: string, id: string): boolean {
  const res = db
    .delete(boards)
    .where(and(eq(boards.id, id), eq(boards.userId, userId)))
    .run();
  return res.changes > 0;
}

function addComicToBoardTx(tx: DBOrTx, boardId: string, comicId: string, now: number): void {
  const maxPos = tx
    .select({ m: sql<number>`max(${boardComics.position})` })
    .from(boardComics)
    .where(eq(boardComics.boardId, boardId))
    .get();
  const position = positionAfterMax(maxPos?.m ?? null);
  tx.insert(boardComics)
    .values({ boardId, comicId, position, addedAt: now })
    .onConflictDoNothing()
    .run();
}

export function addComicToBoard(
  userId: string | null,
  boardId: string,
  comicId: string,
): boolean {
  const board = db
    .select({ id: boards.id })
    .from(boards)
    .where(and(eq(boards.id, boardId), ownedBy(boards.userId, userId)))
    .get();
  const comic = db
    .select({ id: comics.id })
    .from(comics)
    .where(and(eq(comics.id, comicId), ownedBy(comics.userId, userId), notDeleted()))
    .get();
  if (!board || !comic) return false;
  addComicToBoardTx(db, boardId, comicId, Date.now());
  return true;
}

export function removeComicFromBoard(userId: string, boardId: string, comicId: string): boolean {
  const board = db
    .select({ id: boards.id })
    .from(boards)
    .where(and(eq(boards.id, boardId), eq(boards.userId, userId)))
    .get();
  if (!board) return false;
  const res = db
    .delete(boardComics)
    .where(and(eq(boardComics.boardId, boardId), eq(boardComics.comicId, comicId)))
    .run();
  return res.changes > 0;
}

// ---------------------------------------------------------------------------
// Meta (distinct values + counts, scoped to the user's comics) — form autocomplete
// ---------------------------------------------------------------------------

export function getMeta(userId: string): MetaDTO {
  const series = db
    .select({ value: comics.series, count: sql<number>`count(*)` })
    .from(comics)
    .where(and(eq(comics.userId, userId), notDeleted()))
    .groupBy(comics.series)
    .orderBy(comics.series)
    .all();

  const publisherRows = db
    .select({ value: publishers.name, count: sql<number>`count(*)` })
    .from(comics)
    .innerJoin(publishers, eq(publishers.id, comics.publisherId))
    .where(and(eq(comics.userId, userId), notDeleted()))
    .groupBy(publishers.id)
    .orderBy(publishers.name)
    .all();

  // Facet name lists, each scoped to the user's comics via the inner join.
  const facets = {} as Record<NameKey, { value: string; count: number }[]>;
  for (const rel of NAME_RELATIONS) {
    facets[rel.key] = db
      .select({ value: rel.nameTable.name, count: sql<number>`count(*)` })
      .from(rel.joinTable)
      .innerJoin(comics, and(eq(comics.id, rel.comicIdCol), eq(comics.userId, userId), notDeleted()))
      .innerJoin(rel.nameTable, eq(rel.nameTable.id, rel.fkCol))
      .groupBy(rel.nameTable.id)
      .orderBy(rel.nameTable.name)
      .all();
  }

  return {
    series,
    publishers: publisherRows.filter(
      (p): p is { value: string; count: number } => Boolean(p.value) && p.count > 0,
    ),
    ...facets,
  };
}

// ---------------------------------------------------------------------------
// Publishers (managed set)
// ---------------------------------------------------------------------------

/**
 * Rename a publisher. Because comics reference the publisher row, the new name
 * applies to every comic that uses it at once. If a publisher with the new name
 * already exists, the two are merged (comics repointed, the old row deleted).
 *
 * The user must actually use the publisher (own a comic with it) to rename it;
 * the mutation itself operates on the globally-shared row, consistent with how
 * authors/artists/tags are shared. Returns false if not found/authorized or the
 * new name is blank.
 */
export function renamePublisher(userId: string, currentName: string, newName: string): boolean {
  const trimmed = newName.trim();
  if (!trimmed) return false;
  const currentKey = nameKey(currentName);

  return db.transaction((tx) => {
    const target = tx
      .select({ id: publishers.id, nameKey: publishers.nameKey })
      .from(publishers)
      .where(eq(publishers.nameKey, currentKey))
      .get();
    if (!target) return false;

    // Authorization: the user must own at least one comic with this publisher.
    const used = tx
      .select({ id: comics.id })
      .from(comics)
      .where(and(eq(comics.publisherId, target.id), eq(comics.userId, userId)))
      .get();
    if (!used) return false;

    const newKey = nameKey(trimmed);
    if (newKey === target.nameKey) {
      // Same identity — just a display/case change.
      tx.update(publishers).set({ name: trimmed }).where(eq(publishers.id, target.id)).run();
      return true;
    }

    const collision = tx
      .select({ id: publishers.id })
      .from(publishers)
      .where(eq(publishers.nameKey, newKey))
      .get();
    if (collision) {
      // Merge: repoint every comic onto the existing row, drop the orphan.
      tx.update(comics)
        .set({ publisherId: collision.id })
        .where(eq(comics.publisherId, target.id))
        .run();
      tx.delete(publishers).where(eq(publishers.id, target.id)).run();
    } else {
      tx.update(publishers)
        .set({ name: trimmed, nameKey: newKey })
        .where(eq(publishers.id, target.id))
        .run();
    }
    return true;
  });
}

// ---------------------------------------------------------------------------
// Transaction-scoped read helper
// ---------------------------------------------------------------------------

function getComicTx(tx: DBOrTx, id: string): ComicDTO | null {
  const row = tx.select().from(comics).where(eq(comics.id, id)).get();
  if (!row) return null;
  return toDTO(row, loadRelations(tx, [id]));
}
