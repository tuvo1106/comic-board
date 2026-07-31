import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";
import { user } from "./auth-schema";

/**
 * Indexes below are added per query, not per column. The join tables
 * (`comic_authors` etc.) deliberately get none: they're only ever entered by
 * `comic_id`, which is already the leading column of their composite primary
 * key, and nothing queries them by the name-side id.
 */

/**
 * A single comic cover + its metadata.
 *
 * `position` is the sort key on the virtual "My Comics" board. Custom-board
 * ordering lives in `boardComics.position` instead. `width`/`height` are the
 * original pixel dimensions, stored so the masonry can reserve aspect-ratio
 * space before the image loads (no layout shift).
 */
export const comics = sqliteTable("comics", {
  id: text("id").primaryKey(),
  // Owner. Nullable so pre-auth rows can be backfilled; the query layer scopes
  // every read/write by the current user.
  userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
  series: text("series").notNull(),
  issueNumber: text("issue_number"),
  // Normalized publisher (managed set); null = no publisher. Renaming the
  // publisher row updates every comic that references it.
  publisherId: text("publisher_id").references(() => publishers.id, {
    onDelete: "set null",
  }),
  coverDate: text("cover_date"), // ISO yyyy-mm-dd
  rating: real("rating"), // 0.5–5 stars in 0.5 steps; null = unrated
  imagePath: text("image_path").notNull(),
  thumbPath: text("thumb_path").notNull(),
  blurDataUrl: text("blur_data_url").notNull(),
  width: integer("width").notNull(),
  height: integer("height").notNull(),
  position: real("position").notNull(),
  createdAt: integer("created_at").notNull(),
  // Soft delete: set on delete, cleared on undo. Every read query filters
  // deletedAt IS NULL; actual row + file removal is deferred to a sweep of
  // rows deleted more than 24h ago (see sweepDeletedComics in queries.ts).
  deletedAt: integer("deleted_at"),
}, (t) => [
  // `listComics` — the app's hottest read: user's comics in board order
  // (WHERE user_id = ? AND deleted_at IS NULL ORDER BY position). Ordering
  // `position` second lets the index satisfy the sort, not just the filter.
  index("comics_user_position_idx").on(t.userId, t.position),
  // `sweepDeletedComics` — the only query that looks at deleted rows
  // (WHERE deleted_at IS NOT NULL AND deleted_at < ?), once per server start.
  index("comics_deleted_at_idx").on(t.deletedAt),
  // `renamePublisher` repoints every comic on a publisher row, and the
  // publisher name join in `loadRelations` reads this column per comic.
  index("comics_publisher_idx").on(t.publisherId),
]);

/** A user-created board. "My Comics" is virtual and never has a row here. */
export const boards = sqliteTable("boards", {
  id: text("id").primaryKey(),
  userId: text("user_id").references(() => user.id, { onDelete: "cascade" }), // owner

  name: text("name").notNull(),
  tabPosition: real("tab_position").notNull(),
  createdAt: integer("created_at").notNull(),
}, (t) => [
  // `listBoards` — WHERE user_id = ? ORDER BY tab_position, on every page load
  // that renders the tab strip.
  index("boards_user_tab_idx").on(t.userId, t.tabPosition),
]);

/** Membership of a comic in a custom board, with a per-board sort key. */
export const boardComics = sqliteTable(
  "board_comics",
  {
    boardId: text("board_id")
      .notNull()
      .references(() => boards.id, { onDelete: "cascade" }),
    comicId: text("comic_id")
      .notNull()
      .references(() => comics.id, { onDelete: "cascade" }),
    position: real("position").notNull(),
    addedAt: integer("added_at").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.boardId, t.comicId] }),
    // The one join table that *does* need an index. Its PK leads with
    // `board_id`, so the reverse lookup can't use it — and two hot paths do
    // exactly that: `loadRelations` reads a comic's board memberships
    // (WHERE comic_id IN (…)), and deleting a comic cascades here, which
    // SQLite resolves by scanning the child table without this.
    index("board_comics_comic_idx").on(t.comicId),
  ],
);

/**
 * Publishers are a managed, globally-shared set (like authors/artists/tags),
 * deduped case-insensitively by `nameKey`. A comic references one via
 * `comics.publisherId`, so renaming a row applies to every comic at once.
 */
export const publishers = sqliteTable("publishers", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  nameKey: text("name_key").notNull().unique(),
});

export const authors = sqliteTable("authors", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  nameKey: text("name_key").notNull().unique(),
});

export const artists = sqliteTable("artists", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  // case-insensitive dedupe key
  nameKey: text("name_key").notNull().unique(),
});

export const characters = sqliteTable("characters", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  nameKey: text("name_key").notNull().unique(),
});

export const tags = sqliteTable("tags", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  nameKey: text("name_key").notNull().unique(),
});

export const comicAuthors = sqliteTable(
  "comic_authors",
  {
    comicId: text("comic_id")
      .notNull()
      .references(() => comics.id, { onDelete: "cascade" }),
    authorId: text("author_id")
      .notNull()
      .references(() => authors.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.comicId, t.authorId] })],
);

export const comicArtists = sqliteTable(
  "comic_artists",
  {
    comicId: text("comic_id")
      .notNull()
      .references(() => comics.id, { onDelete: "cascade" }),
    artistId: text("artist_id")
      .notNull()
      .references(() => artists.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.comicId, t.artistId] })],
);

export const comicCharacters = sqliteTable(
  "comic_characters",
  {
    comicId: text("comic_id")
      .notNull()
      .references(() => comics.id, { onDelete: "cascade" }),
    characterId: text("character_id")
      .notNull()
      .references(() => characters.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.comicId, t.characterId] })],
);

export const comicTags = sqliteTable(
  "comic_tags",
  {
    comicId: text("comic_id")
      .notNull()
      .references(() => comics.id, { onDelete: "cascade" }),
    tagId: text("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.comicId, t.tagId] })],
);

export type ComicRow = typeof comics.$inferSelect;
