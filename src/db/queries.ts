import { and, eq, inArray, sql } from "drizzle-orm";
import { newId, nameKey } from "@/lib/ids";
import { positionAfterMax } from "@/lib/fractional-index";
import { storage } from "@/lib/storage";
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
  tags,
  type ComicRow,
} from "./schema";

/** Either the top-level db handle or a transaction handle (same connection). */
type DBOrTx = typeof db | Parameters<Parameters<(typeof db)["transaction"]>[0]>[0];

// ---------------------------------------------------------------------------
// Artists / characters (normalized, deduped case-insensitively)
// ---------------------------------------------------------------------------

function upsertNames(
  table: typeof artists | typeof characters | typeof authors | typeof tags,
  names: string[],
): string[] {
  const ids: string[] = [];
  for (const raw of names) {
    const name = raw.trim();
    if (!name) continue;
    const key = nameKey(name);
    const existing = db
      .select({ id: table.id })
      .from(table)
      .where(eq(table.nameKey, key))
      .get();
    if (existing) {
      ids.push(existing.id);
    } else {
      const id = newId();
      db.insert(table).values({ id, name, nameKey: key }).run();
      ids.push(id);
    }
  }
  return ids;
}

// ---------------------------------------------------------------------------
// Mapping rows -> DTOs
// ---------------------------------------------------------------------------

function rowToDTO(
  row: ComicRow,
  names: {
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
    publisher: row.publisher,
    coverDate: row.coverDate,
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

/** Batch-load authors, artists, characters, and board memberships. */
function loadRelations(comicIds: string[]) {
  const authorsByComic = new Map<string, string[]>();
  const artistsByComic = new Map<string, string[]>();
  const charsByComic = new Map<string, string[]>();
  const tagsByComic = new Map<string, string[]>();
  const boardsByComic = new Map<string, string[]>();
  if (comicIds.length === 0) {
    return { authorsByComic, artistsByComic, charsByComic, tagsByComic, boardsByComic };
  }

  const au = db
    .select({ comicId: comicAuthors.comicId, name: authors.name })
    .from(comicAuthors)
    .innerJoin(authors, eq(authors.id, comicAuthors.authorId))
    .where(inArray(comicAuthors.comicId, comicIds))
    .all();
  for (const r of au) {
    const list = authorsByComic.get(r.comicId) ?? [];
    list.push(r.name);
    authorsByComic.set(r.comicId, list);
  }

  const ar = db
    .select({ comicId: comicArtists.comicId, name: artists.name })
    .from(comicArtists)
    .innerJoin(artists, eq(artists.id, comicArtists.artistId))
    .where(inArray(comicArtists.comicId, comicIds))
    .all();
  for (const r of ar) {
    const list = artistsByComic.get(r.comicId) ?? [];
    list.push(r.name);
    artistsByComic.set(r.comicId, list);
  }

  const ch = db
    .select({ comicId: comicCharacters.comicId, name: characters.name })
    .from(comicCharacters)
    .innerJoin(characters, eq(characters.id, comicCharacters.characterId))
    .where(inArray(comicCharacters.comicId, comicIds))
    .all();
  for (const r of ch) {
    const list = charsByComic.get(r.comicId) ?? [];
    list.push(r.name);
    charsByComic.set(r.comicId, list);
  }

  const tg = db
    .select({ comicId: comicTags.comicId, name: tags.name })
    .from(comicTags)
    .innerJoin(tags, eq(tags.id, comicTags.tagId))
    .where(inArray(comicTags.comicId, comicIds))
    .all();
  for (const r of tg) {
    const list = tagsByComic.get(r.comicId) ?? [];
    list.push(r.name);
    tagsByComic.set(r.comicId, list);
  }

  const bc = db
    .select({ comicId: boardComics.comicId, boardId: boardComics.boardId })
    .from(boardComics)
    .where(inArray(boardComics.comicId, comicIds))
    .all();
  for (const r of bc) {
    const list = boardsByComic.get(r.comicId) ?? [];
    list.push(r.boardId);
    boardsByComic.set(r.comicId, list);
  }

  return { authorsByComic, artistsByComic, charsByComic, tagsByComic, boardsByComic };
}

function attachRelations(rows: ComicRow[]): ComicDTO[] {
  const rel = loadRelations(rows.map((r) => r.id));
  return rows.map((row) =>
    rowToDTO(row, {
      authors: (rel.authorsByComic.get(row.id) ?? []).sort((a, b) =>
        a.localeCompare(b),
      ),
      artists: (rel.artistsByComic.get(row.id) ?? []).sort((a, b) =>
        a.localeCompare(b),
      ),
      characters: (rel.charsByComic.get(row.id) ?? []).sort((a, b) =>
        a.localeCompare(b),
      ),
      tags: (rel.tagsByComic.get(row.id) ?? []).sort((a, b) => a.localeCompare(b)),
      boardIds: rel.boardsByComic.get(row.id) ?? [],
    }),
  );
}

// ---------------------------------------------------------------------------
// Comics
// ---------------------------------------------------------------------------

export function listComics(boardId?: string | null): ComicDTO[] {
  if (boardId) {
    const rows = db
      .select({ comic: comics, pos: boardComics.position })
      .from(boardComics)
      .innerJoin(comics, eq(comics.id, boardComics.comicId))
      .where(eq(boardComics.boardId, boardId))
      .orderBy(boardComics.position)
      .all();
    // Override position with the per-board position for ordering on the client.
    const withBoardPos = rows.map((r) => ({ ...r.comic, position: r.pos }));
    return attachRelations(withBoardPos);
  }
  const rows = db.select().from(comics).orderBy(comics.position).all();
  return attachRelations(rows);
}

export function getComic(id: string): ComicDTO | null {
  const row = db.select().from(comics).where(eq(comics.id, id)).get();
  if (!row) return null;
  return attachRelations([row])[0];
}

export interface CreateComicInput {
  series: string;
  issueNumber?: string | null;
  publisher?: string | null;
  coverDate?: string | null;
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
      .get();
    const position = positionAfterMax(maxPos?.m ?? null);

    tx.insert(comics)
      .values({
        id,
        series: input.series,
        issueNumber: input.issueNumber ?? null,
        publisher: input.publisher ?? null,
        coverDate: input.coverDate ?? null,
        imagePath: input.image.imagePath,
        thumbPath: input.image.thumbPath,
        blurDataUrl: input.image.blurDataUrl,
        width: input.image.width,
        height: input.image.height,
        position,
        createdAt: now,
      })
      .run();

    const authorIds = upsertNames(authors, input.authors);
    for (const authorId of authorIds) {
      tx.insert(comicAuthors).values({ comicId: id, authorId }).onConflictDoNothing().run();
    }
    const artistIds = upsertNames(artists, input.artists);
    for (const artistId of artistIds) {
      tx.insert(comicArtists).values({ comicId: id, artistId }).onConflictDoNothing().run();
    }
    const characterIds = upsertNames(characters, input.characters);
    for (const characterId of characterIds) {
      tx.insert(comicCharacters)
        .values({ comicId: id, characterId })
        .onConflictDoNothing()
        .run();
    }
    const tagIds = upsertNames(tags, input.tags);
    for (const tagId of tagIds) {
      tx.insert(comicTags).values({ comicId: id, tagId }).onConflictDoNothing().run();
    }

    for (const boardId of input.boardIds) {
      addComicToBoardTx(tx, boardId, id, now);
    }

    return getComicTx(tx, id)!;
  });
}

export interface UpdateComicInput {
  series?: string;
  issueNumber?: string | null;
  publisher?: string | null;
  coverDate?: string | null;
  authors?: string[];
  artists?: string[];
  characters?: string[];
  tags?: string[];
}

export function updateComic(id: string, input: UpdateComicInput): ComicDTO | null {
  const exists = db.select({ id: comics.id }).from(comics).where(eq(comics.id, id)).get();
  if (!exists) return null;

  return db.transaction((tx) => {
    const fields: Partial<ComicRow> = {};
    if (input.series !== undefined) fields.series = input.series;
    if (input.issueNumber !== undefined) fields.issueNumber = input.issueNumber;
    if (input.publisher !== undefined) fields.publisher = input.publisher;
    if (input.coverDate !== undefined) fields.coverDate = input.coverDate;
    if (Object.keys(fields).length > 0) {
      tx.update(comics).set(fields).where(eq(comics.id, id)).run();
    }

    if (input.authors !== undefined) {
      tx.delete(comicAuthors).where(eq(comicAuthors.comicId, id)).run();
      for (const authorId of upsertNames(authors, input.authors)) {
        tx.insert(comicAuthors).values({ comicId: id, authorId }).onConflictDoNothing().run();
      }
    }
    if (input.artists !== undefined) {
      tx.delete(comicArtists).where(eq(comicArtists.comicId, id)).run();
      for (const artistId of upsertNames(artists, input.artists)) {
        tx.insert(comicArtists).values({ comicId: id, artistId }).onConflictDoNothing().run();
      }
    }
    if (input.characters !== undefined) {
      tx.delete(comicCharacters).where(eq(comicCharacters.comicId, id)).run();
      for (const characterId of upsertNames(characters, input.characters)) {
        tx.insert(comicCharacters)
          .values({ comicId: id, characterId })
          .onConflictDoNothing()
          .run();
      }
    }
    if (input.tags !== undefined) {
      tx.delete(comicTags).where(eq(comicTags.comicId, id)).run();
      for (const tagId of upsertNames(tags, input.tags)) {
        tx.insert(comicTags).values({ comicId: id, tagId }).onConflictDoNothing().run();
      }
    }
    return getComicTx(tx, id)!;
  });
}

export async function deleteComic(id: string): Promise<boolean> {
  const row = db.select().from(comics).where(eq(comics.id, id)).get();
  if (!row) return false;
  // Cascades remove join rows via FK ON DELETE CASCADE.
  db.delete(comics).where(eq(comics.id, id)).run();
  await storage.delete(row.imagePath);
  await storage.delete(row.thumbPath);
  return true;
}

export function updateComicPosition(
  comicId: string,
  position: number,
  boardId?: string | null,
): boolean {
  if (boardId) {
    const res = db
      .update(boardComics)
      .set({ position })
      .where(and(eq(boardComics.boardId, boardId), eq(boardComics.comicId, comicId)))
      .run();
    return res.changes > 0;
  }
  const res = db.update(comics).set({ position }).where(eq(comics.id, comicId)).run();
  return res.changes > 0;
}

// ---------------------------------------------------------------------------
// Boards
// ---------------------------------------------------------------------------

export function listBoards(): BoardDTO[] {
  const rows = db.select().from(boards).orderBy(boards.tabPosition).all();
  const counts = db
    .select({ boardId: boardComics.boardId, c: sql<number>`count(*)` })
    .from(boardComics)
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

export function createBoard(name: string, comicIds?: string[]): BoardDTO {
  const id = newId();
  const now = Date.now();
  return db.transaction((tx) => {
    const maxPos = tx
      .select({ m: sql<number>`max(${boards.tabPosition})` })
      .from(boards)
      .get();
    const tabPosition = positionAfterMax(maxPos?.m ?? null);
    tx.insert(boards).values({ id, name, tabPosition, createdAt: now }).run();

    if (comicIds && comicIds.length > 0) {
      // Preserve the given order as the board's initial ordering.
      let pos = 1;
      for (const comicId of comicIds) {
        const exists = tx
          .select({ id: comics.id })
          .from(comics)
          .where(eq(comics.id, comicId))
          .get();
        if (!exists) continue;
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
  id: string,
  fields: { name?: string; tabPosition?: number },
): boolean {
  const set: Record<string, unknown> = {};
  if (fields.name !== undefined) set.name = fields.name;
  if (fields.tabPosition !== undefined) set.tabPosition = fields.tabPosition;
  if (Object.keys(set).length === 0) return true;
  const res = db.update(boards).set(set).where(eq(boards.id, id)).run();
  return res.changes > 0;
}

export function deleteBoard(id: string): boolean {
  const res = db.delete(boards).where(eq(boards.id, id)).run();
  return res.changes > 0;
}

function addComicToBoardTx(
  tx: DBOrTx,
  boardId: string,
  comicId: string,
  now: number,
): void {
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

export function addComicToBoard(boardId: string, comicId: string): boolean {
  const board = db.select({ id: boards.id }).from(boards).where(eq(boards.id, boardId)).get();
  const comic = db.select({ id: comics.id }).from(comics).where(eq(comics.id, comicId)).get();
  if (!board || !comic) return false;
  addComicToBoardTx(db, boardId, comicId, Date.now());
  return true;
}

export function removeComicFromBoard(boardId: string, comicId: string): boolean {
  const res = db
    .delete(boardComics)
    .where(and(eq(boardComics.boardId, boardId), eq(boardComics.comicId, comicId)))
    .run();
  return res.changes > 0;
}

// ---------------------------------------------------------------------------
// Meta (distinct values + counts for filters)
// ---------------------------------------------------------------------------

export function getMeta(): MetaDTO {
  const series = db
    .select({ value: comics.series, count: sql<number>`count(*)` })
    .from(comics)
    .groupBy(comics.series)
    .orderBy(comics.series)
    .all();

  const publisherRows = db
    .select({ value: comics.publisher, count: sql<number>`count(*)` })
    .from(comics)
    .where(sql`${comics.publisher} is not null and ${comics.publisher} != ''`)
    .groupBy(comics.publisher)
    .orderBy(comics.publisher)
    .all();

  const authorRows = db
    .select({ value: authors.name, count: sql<number>`count(${comicAuthors.comicId})` })
    .from(authors)
    .leftJoin(comicAuthors, eq(comicAuthors.authorId, authors.id))
    .groupBy(authors.id)
    .orderBy(authors.name)
    .all();

  const artistRows = db
    .select({ value: artists.name, count: sql<number>`count(${comicArtists.comicId})` })
    .from(artists)
    .leftJoin(comicArtists, eq(comicArtists.artistId, artists.id))
    .groupBy(artists.id)
    .orderBy(artists.name)
    .all();

  const characterRows = db
    .select({
      value: characters.name,
      count: sql<number>`count(${comicCharacters.comicId})`,
    })
    .from(characters)
    .leftJoin(comicCharacters, eq(comicCharacters.characterId, characters.id))
    .groupBy(characters.id)
    .orderBy(characters.name)
    .all();

  const tagRows = db
    .select({ value: tags.name, count: sql<number>`count(${comicTags.comicId})` })
    .from(tags)
    .leftJoin(comicTags, eq(comicTags.tagId, tags.id))
    .groupBy(tags.id)
    .orderBy(tags.name)
    .all();

  return {
    series: series.filter((s) => s.count > 0),
    publishers: publisherRows
      .filter((p): p is { value: string; count: number } => Boolean(p.value) && p.count > 0),
    authors: authorRows.filter((a) => a.count > 0),
    artists: artistRows.filter((a) => a.count > 0),
    characters: characterRows.filter((c) => c.count > 0),
    tags: tagRows.filter((t) => t.count > 0),
  };
}

// ---------------------------------------------------------------------------
// Transaction-scoped read helpers
// ---------------------------------------------------------------------------

function getComicTx(tx: DBOrTx, id: string): ComicDTO | null {
  const row = tx.select().from(comics).where(eq(comics.id, id)).get();
  if (!row) return null;
  // Relations are read on the same connection; better-sqlite3 is synchronous so
  // this is consistent within the transaction.
  const rel = loadRelations([id]);
  return rowToDTO(row, {
    authors: (rel.authorsByComic.get(id) ?? []).sort((a, b) => a.localeCompare(b)),
    artists: (rel.artistsByComic.get(id) ?? []).sort((a, b) => a.localeCompare(b)),
    characters: (rel.charsByComic.get(id) ?? []).sort((a, b) => a.localeCompare(b)),
    tags: (rel.tagsByComic.get(id) ?? []).sort((a, b) => a.localeCompare(b)),
    boardIds: rel.boardsByComic.get(id) ?? [],
  });
}
