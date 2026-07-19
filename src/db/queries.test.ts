import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import path from "node:path";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db, sqlite } from "./client";
import * as q from "./queries";
import { newId } from "@/lib/ids";
import type { ProcessedImage } from "@/lib/images";

/** Fake processed image so we don't need sharp / real files in the DB. */
function fakeImage(): ProcessedImage {
  const id = newId();
  return {
    id,
    imagePath: `covers/${id}/full.webp`,
    thumbPath: `covers/${id}/thumb.webp`,
    blurDataUrl: "data:,",
    width: 660,
    height: 1014,
  };
}

let userA = "";
let userB = "";

function makeComic(userId: string, over: Partial<q.CreateComicInput> = {}) {
  return q.createComic({
    userId,
    series: "Series",
    issueNumber: "1",
    authors: [],
    artists: [],
    characters: [],
    tags: [],
    boardIds: [],
    image: fakeImage(),
    ...over,
  });
}

beforeAll(() => {
  migrate(db, { migrationsFolder: path.join(process.cwd(), "src/db/migrations") });
});

beforeEach(() => {
  sqlite.pragma("foreign_keys = OFF");
  for (const t of [
    "comic_authors",
    "comic_artists",
    "comic_characters",
    "comic_tags",
    "board_comics",
    "comics",
    "boards",
    "authors",
    "artists",
    "characters",
    "tags",
    "session",
    "account",
    "verification",
    "user",
  ]) {
    sqlite.exec(`DELETE FROM ${t}`);
  }
  sqlite.pragma("foreign_keys = ON");

  const now = Date.now();
  userA = newId();
  userB = newId();
  const ins = sqlite.prepare(
    "INSERT INTO user (id,name,email,email_verified,created_at,updated_at) VALUES (?,?,?,?,?,?)",
  );
  ins.run(userA, "A", "a@example.com", 0, now, now);
  ins.run(userB, "B", "b@example.com", 0, now, now);
});

describe("comic ownership scoping", () => {
  it("listComics / getComic only return the caller's comics", () => {
    const c = makeComic(userA);
    expect(q.listComics(userA)).toHaveLength(1);
    expect(q.listComics(userB)).toHaveLength(0);
    expect(q.getComic(userA, c.id)).not.toBeNull();
    expect(q.getComic(userB, c.id)).toBeNull();
  });

  it("another user cannot update someone else's comic", () => {
    const c = makeComic(userA, { series: "Batman" });
    expect(q.updateComic(userB, c.id, { series: "HACKED" })).toBeNull();
    expect(q.getComic(userA, c.id)!.series).toBe("Batman");
    expect(q.updateComic(userA, c.id, { series: "Detective Comics" })).not.toBeNull();
    expect(q.getComic(userA, c.id)!.series).toBe("Detective Comics");
  });

  it("another user cannot delete someone else's comic", async () => {
    const c = makeComic(userA);
    expect(await q.deleteComic(userB, c.id)).toBe(false);
    expect(q.getComic(userA, c.id)).not.toBeNull();
    expect(await q.deleteComic(userA, c.id)).toBe(true);
    expect(q.getComic(userA, c.id)).toBeNull();
  });

  it("another user cannot reorder someone else's comic", () => {
    const c = makeComic(userA);
    expect(q.updateComicPosition(userB, c.id, 5)).toBe(false);
    expect(q.updateComicPosition(userA, c.id, 5)).toBe(true);
  });
});

describe("board ownership scoping", () => {
  it("listBoards only returns the caller's boards; update/delete are scoped", () => {
    const b = q.createBoard(userA, "McFarlane");
    expect(q.listBoards(userA).map((x) => x.id)).toContain(b.id);
    expect(q.listBoards(userB)).toHaveLength(0);
    expect(q.updateBoard(userB, b.id, { name: "HACKED" })).toBe(false);
    expect(q.deleteBoard(userB, b.id)).toBe(false);
    expect(q.deleteBoard(userA, b.id)).toBe(true);
  });

  it("membership changes require owning both the board and the comic", () => {
    const boardA = q.createBoard(userA, "A's board");
    const comicA = makeComic(userA);
    const comicB = makeComic(userB);
    // B cannot add to A's board; A cannot add B's comic to A's board.
    expect(q.addComicToBoard(userB, boardA.id, comicA.id)).toBe(false);
    expect(q.addComicToBoard(userA, boardA.id, comicB.id)).toBe(false);
    // A adding A's comic to A's board works.
    expect(q.addComicToBoard(userA, boardA.id, comicA.id)).toBe(true);
    expect(q.listComics(userA, boardA.id)).toHaveLength(1);
    // B cannot remove from A's board.
    expect(q.removeComicFromBoard(userB, boardA.id, comicA.id)).toBe(false);
    expect(q.removeComicFromBoard(userA, boardA.id, comicA.id)).toBe(true);
  });

  it("createComic only joins boards the caller owns", () => {
    const boardA = q.createBoard(userA, "A");
    const boardB = q.createBoard(userB, "B");
    const c = makeComic(userA, { boardIds: [boardA.id, boardB.id] });
    expect(c.boardIds).toEqual([boardA.id]); // not boardB
  });
});

describe("getMeta is scoped to the caller", () => {
  it("only reflects the caller's comics", () => {
    makeComic(userA, { artists: ["Jim Lee"], publisher: "Marvel" });
    makeComic(userB, { artists: ["Frank Miller"], publisher: "DC" });
    const metaA = q.getMeta(userA);
    expect(metaA.artists.map((a) => a.value)).toEqual(["Jim Lee"]);
    expect(metaA.publishers.map((p) => p.value)).toEqual(["Marvel"]);
    const metaB = q.getMeta(userB);
    expect(metaB.artists.map((a) => a.value)).toEqual(["Frank Miller"]);
  });
});

describe("partial update preserves untouched associations (rating regression)", () => {
  it("setting only the rating keeps authors/artists/characters/tags", () => {
    const c = makeComic(userA, {
      authors: ["Chris Claremont"],
      artists: ["Jim Lee"],
      characters: ["Psylocke", "Wolverine"],
      tags: ["Key Issue"],
    });
    q.updateComic(userA, c.id, { rating: 4.5 });
    const after = q.getComic(userA, c.id)!;
    expect(after.rating).toBe(4.5);
    expect(after.authors).toEqual(["Chris Claremont"]);
    expect(after.artists).toEqual(["Jim Lee"]);
    expect(after.characters).toEqual(["Psylocke", "Wolverine"]);
    expect(after.tags).toEqual(["Key Issue"]);
  });

  it("explicitly passing an empty array does clear that association", () => {
    const c = makeComic(userA, { tags: ["Variant"] });
    q.updateComic(userA, c.id, { tags: [] });
    expect(q.getComic(userA, c.id)!.tags).toEqual([]);
  });
});
