import { and, eq, inArray, isNotNull, isNull, lt, sql, type SQL } from "drizzle-orm";
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

function upsertNames(
  handle: DBOrTx,
  table: typeof artists | typeof characters | typeof authors | typeof tags,
  names: string[],
): string[] {
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
    imageUrl: storage.getUrl(row.imagePath),
    thumbUrl: storage.getUrl(row.thumbPath),
    blurDataUrl: row.blurDataUrl,
    width: row.width,
    height: row.height,
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
  const authorsByComic = new Map<string, string[]>();
  const artistsByComic = new Map<string, string[]>();
  const charsByComic = new Map<string, string[]>();
  const tagsByComic = new Map<string, string[]>();
  const boardsByComic = new Map<string, string[]>();
  const publisherByComic = new Map<string, string>();
  if (comicIds.length === 0) {
    return { authorsByComic, artistsByComic, charsByComic, tagsByComic, boardsByComic, publisherByComic };
  }

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

  // The four name-association tables share the same shape: a join row with a
  // comicId + a foreign key into a name table. Drive them from one config
  // instead of copy-pasting the join loop.
  const nameJoins: {
    joinTable: SQLiteTable;
    comicIdCol: SQLiteColumn;
    fkCol: SQLiteColumn;
    nameIdCol: SQLiteColumn;
    nameCol: SQLiteColumn;
    target: Map<string, string[]>;
  }[] = [
    { joinTable: comicAuthors, comicIdCol: comicAuthors.comicId, fkCol: comicAuthors.authorId, nameIdCol: authors.id, nameCol: authors.name, target: authorsByComic },
    { joinTable: comicArtists, comicIdCol: comicArtists.comicId, fkCol: comicArtists.artistId, nameIdCol: artists.id, nameCol: artists.name, target: artistsByComic },
    { joinTable: comicCharacters, comicIdCol: comicCharacters.comicId, fkCol: comicCharacters.characterId, nameIdCol: characters.id, nameCol: characters.name, target: charsByComic },
    { joinTable: comicTags, comicIdCol: comicTags.comicId, fkCol: comicTags.tagId, nameIdCol: tags.id, nameCol: tags.name, target: tagsByComic },
  ];

  for (const { joinTable, comicIdCol, fkCol, nameIdCol, nameCol, target } of nameJoins) {
    for (const r of handle
      .select({ comicId: comicIdCol, name: nameCol })
      .from(joinTable)
      .innerJoin(nameIdCol.table, eq(nameIdCol, fkCol))
      .where(inArray(comicIdCol, comicIds))
      .all())
      push(target, r.comicId as string, r.name as string);
  }

  for (const r of handle
    .select({ comicId: boardComics.comicId, boardId: boardComics.boardId })
    .from(boardComics)
    .where(inArray(boardComics.comicId, comicIds))
    .all())
    push(boardsByComic, r.comicId, r.boardId);

  return { authorsByComic, artistsByComic, charsByComic, tagsByComic, boardsByComic, publisherByComic };
}

const sortNames = (a: string[]) => [...a].sort((x, y) => x.localeCompare(y));

function attachRelations(rows: ComicRow[]): ComicDTO[] {
  const rel = loadRelations(db, rows.map((r) => r.id));
  return rows.map((row) =>
    rowToDTO(row, {
      publisher: rel.publisherByComic.get(row.id) ?? null,
      authors: sortNames(rel.authorsByComic.get(row.id) ?? []),
      artists: sortNames(rel.artistsByComic.get(row.id) ?? []),
      characters: sortNames(rel.charsByComic.get(row.id) ?? []),
      tags: sortNames(rel.tagsByComic.get(row.id) ?? []),
      boardIds: rel.boardsByComic.get(row.id) ?? [],
    }),
  );
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
        imagePath: input.image.imagePath,
        thumbPath: input.image.thumbPath,
        blurDataUrl: input.image.blurDataUrl,
        width: input.image.width,
        height: input.image.height,
        position,
        createdAt: now,
      })
      .run();

    for (const authorId of upsertNames(tx, authors, input.authors))
      tx.insert(comicAuthors).values({ comicId: id, authorId }).onConflictDoNothing().run();
    for (const artistId of upsertNames(tx, artists, input.artists))
      tx.insert(comicArtists).values({ comicId: id, artistId }).onConflictDoNothing().run();
    for (const characterId of upsertNames(tx, characters, input.characters))
      tx.insert(comicCharacters).values({ comicId: id, characterId }).onConflictDoNothing().run();
    for (const tagId of upsertNames(tx, tags, input.tags))
      tx.insert(comicTags).values({ comicId: id, tagId }).onConflictDoNothing().run();

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
    if (Object.keys(fields).length > 0) {
      tx.update(comics).set(fields).where(eq(comics.id, id)).run();
    }

    if (input.authors !== undefined) {
      tx.delete(comicAuthors).where(eq(comicAuthors.comicId, id)).run();
      for (const authorId of upsertNames(tx, authors, input.authors))
        tx.insert(comicAuthors).values({ comicId: id, authorId }).onConflictDoNothing().run();
    }
    if (input.artists !== undefined) {
      tx.delete(comicArtists).where(eq(comicArtists.comicId, id)).run();
      for (const artistId of upsertNames(tx, artists, input.artists))
        tx.insert(comicArtists).values({ comicId: id, artistId }).onConflictDoNothing().run();
    }
    if (input.characters !== undefined) {
      tx.delete(comicCharacters).where(eq(comicCharacters.comicId, id)).run();
      for (const characterId of upsertNames(tx, characters, input.characters))
        tx.insert(comicCharacters).values({ comicId: id, characterId }).onConflictDoNothing().run();
    }
    if (input.tags !== undefined) {
      tx.delete(comicTags).where(eq(comicTags.comicId, id)).run();
      for (const tagId of upsertNames(tx, tags, input.tags))
        tx.insert(comicTags).values({ comicId: id, tagId }).onConflictDoNothing().run();
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
    .select({ id: comics.id, imagePath: comics.imagePath })
    .from(comics)
    .where(and(isNotNull(comics.deletedAt), lt(comics.deletedAt, cutoff)))
    .all();
  for (const row of rows) {
    db.delete(comics).where(eq(comics.id, row.id)).run(); // cascades join rows
    await storage.deletePrefix(coverDir(row.imagePath)); // full.webp + thumb.webp + folder
  }
  return rows.length;
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
    .select({ imagePath: comics.imagePath, thumbPath: comics.thumbPath })
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
      })
      .where(eq(comics.id, id))
      .run();
    return getComicTx(tx, id)!;
  });

  // Best-effort cleanup of the previous cover's whole folder (leaves no empty
  // dir behind), now that the row points at the new one.
  const oldDir = coverDir(row.imagePath);
  if (oldDir !== coverDir(image.imagePath)) await storage.deletePrefix(oldDir).catch(() => {});
  return dto;
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

  // Facet name lists scoped to the user's comics via inner joins.
  const authorRows = db
    .select({ value: authors.name, count: sql<number>`count(*)` })
    .from(comicAuthors)
    .innerJoin(
      comics,
      and(eq(comics.id, comicAuthors.comicId), eq(comics.userId, userId), notDeleted()),
    )
    .innerJoin(authors, eq(authors.id, comicAuthors.authorId))
    .groupBy(authors.id)
    .orderBy(authors.name)
    .all();
  const artistRows = db
    .select({ value: artists.name, count: sql<number>`count(*)` })
    .from(comicArtists)
    .innerJoin(
      comics,
      and(eq(comics.id, comicArtists.comicId), eq(comics.userId, userId), notDeleted()),
    )
    .innerJoin(artists, eq(artists.id, comicArtists.artistId))
    .groupBy(artists.id)
    .orderBy(artists.name)
    .all();
  const characterRows = db
    .select({ value: characters.name, count: sql<number>`count(*)` })
    .from(comicCharacters)
    .innerJoin(
      comics,
      and(eq(comics.id, comicCharacters.comicId), eq(comics.userId, userId), notDeleted()),
    )
    .innerJoin(characters, eq(characters.id, comicCharacters.characterId))
    .groupBy(characters.id)
    .orderBy(characters.name)
    .all();
  const tagRows = db
    .select({ value: tags.name, count: sql<number>`count(*)` })
    .from(comicTags)
    .innerJoin(
      comics,
      and(eq(comics.id, comicTags.comicId), eq(comics.userId, userId), notDeleted()),
    )
    .innerJoin(tags, eq(tags.id, comicTags.tagId))
    .groupBy(tags.id)
    .orderBy(tags.name)
    .all();

  return {
    series,
    publishers: publisherRows.filter(
      (p): p is { value: string; count: number } => Boolean(p.value) && p.count > 0,
    ),
    authors: authorRows,
    artists: artistRows,
    characters: characterRows,
    tags: tagRows,
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
  const rel = loadRelations(tx, [id]);
  return rowToDTO(row, {
    publisher: rel.publisherByComic.get(id) ?? null,
    authors: sortNames(rel.authorsByComic.get(id) ?? []),
    artists: sortNames(rel.artistsByComic.get(id) ?? []),
    characters: sortNames(rel.charsByComic.get(id) ?? []),
    tags: sortNames(rel.tagsByComic.get(id) ?? []),
    boardIds: rel.boardsByComic.get(id) ?? [],
  });
}
