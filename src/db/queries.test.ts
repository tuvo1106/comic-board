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
    "publishers",
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

  it("another user cannot delete someone else's comic", () => {
    const c = makeComic(userA);
    expect(q.deleteComic(userB, c.id)).toBe(false);
    expect(q.getComic(userA, c.id)).not.toBeNull();
    expect(q.deleteComic(userA, c.id)).toBe(true);
    expect(q.getComic(userA, c.id)).toBeNull();
  });

  it("another user cannot reorder someone else's comic", () => {
    const c = makeComic(userA);
    expect(q.updateComicPosition(userB, c.id, 5)).toBe(false);
    expect(q.updateComicPosition(userA, c.id, 5)).toBe(true);
  });
});

describe("soft delete + undo", () => {
  it("delete stamps deletedAt instead of removing the row", () => {
    const c = makeComic(userA);
    expect(q.deleteComic(userA, c.id)).toBe(true);
    const row = sqlite.prepare("SELECT deleted_at FROM comics WHERE id = ?").get(c.id) as
      | { deleted_at: number | null }
      | undefined;
    expect(row).toBeDefined();
    expect(row!.deleted_at).not.toBeNull();
  });

  it("a soft-deleted comic disappears from listComics/getComic/getMeta", () => {
    const c = makeComic(userA, { series: "Deleted Series" });
    expect(q.listComics(userA)).toHaveLength(1);
    q.deleteComic(userA, c.id);
    expect(q.listComics(userA)).toHaveLength(0);
    expect(q.getComic(userA, c.id)).toBeNull();
    expect(q.getMeta(userA).series.map((s) => s.value)).not.toContain("Deleted Series");
  });

  it("deleting an already-deleted comic is a no-op", () => {
    const c = makeComic(userA);
    expect(q.deleteComic(userA, c.id)).toBe(true);
    expect(q.deleteComic(userA, c.id)).toBe(false);
  });

  it("restore clears deletedAt and the comic reappears", () => {
    const c = makeComic(userA);
    q.deleteComic(userA, c.id);
    expect(q.getComic(userA, c.id)).toBeNull();
    expect(q.restoreComic(userA, c.id)).toBe(true);
    expect(q.getComic(userA, c.id)).not.toBeNull();
    expect(q.listComics(userA)).toHaveLength(1);
  });

  it("restore fails for a comic that isn't deleted, or owned by another user", () => {
    const c = makeComic(userA);
    expect(q.restoreComic(userA, c.id)).toBe(false); // not deleted yet
    q.deleteComic(userA, c.id);
    expect(q.restoreComic(userB, c.id)).toBe(false); // not owned
  });

  it("sweep hard-deletes comics past the cutoff, leaves recent ones alone", async () => {
    const old = makeComic(userA);
    const recent = makeComic(userA);
    q.deleteComic(userA, old.id);
    q.deleteComic(userA, recent.id);
    // Backdate `old`'s deletedAt well past a 1000ms cutoff; `recent` stays now().
    sqlite.prepare("UPDATE comics SET deleted_at = ? WHERE id = ?").run(Date.now() - 5000, old.id);

    const swept = await q.sweepDeletedComics(1000);
    expect(swept).toBe(1);
    expect(sqlite.prepare("SELECT id FROM comics WHERE id = ?").get(old.id)).toBeUndefined();
    expect(sqlite.prepare("SELECT id FROM comics WHERE id = ?").get(recent.id)).toBeDefined();
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

describe("normalized publishers", () => {
  it("dedupes publishers case-insensitively into one shared row", () => {
    const a = makeComic(userA, { publisher: "Marvel" });
    const b = makeComic(userB, { publisher: "marvel" });
    // Both comics resolve to the same canonical display name (first writer wins).
    expect(q.getComic(userA, a.id)!.publisher).toBe("Marvel");
    expect(q.getComic(userB, b.id)!.publisher).toBe("Marvel");
  });

  it("updateComic re-links the publisher and blank clears it", () => {
    const c = makeComic(userA, { publisher: "Marvel" });
    q.updateComic(userA, c.id, { publisher: "Image" });
    expect(q.getComic(userA, c.id)!.publisher).toBe("Image");
    q.updateComic(userA, c.id, { publisher: null });
    expect(q.getComic(userA, c.id)!.publisher).toBeNull();
  });

  it("renaming a publisher applies to every comic that uses it", () => {
    const c1 = makeComic(userA, { publisher: "Marvel" });
    const c2 = makeComic(userA, { publisher: "Marvel" });
    expect(q.renamePublisher(userA, "Marvel", "Marvel Comics")).toBe(true);
    expect(q.getComic(userA, c1.id)!.publisher).toBe("Marvel Comics");
    expect(q.getComic(userA, c2.id)!.publisher).toBe("Marvel Comics");
    expect(q.getMeta(userA).publishers.map((p) => p.value)).toEqual(["Marvel Comics"]);
  });

  it("a user cannot rename a publisher they don't use", () => {
    const c = makeComic(userA, { publisher: "Marvel" });
    expect(q.renamePublisher(userB, "Marvel", "HACKED")).toBe(false);
    expect(q.getComic(userA, c.id)!.publisher).toBe("Marvel");
  });

  it("renaming onto an existing publisher merges them", () => {
    const c1 = makeComic(userA, { publisher: "Marvel" });
    const c2 = makeComic(userA, { publisher: "DC" });
    expect(q.renamePublisher(userA, "DC", "Marvel")).toBe(true);
    expect(q.getComic(userA, c1.id)!.publisher).toBe("Marvel");
    expect(q.getComic(userA, c2.id)!.publisher).toBe("Marvel");
    // One publisher remains for this user, with the combined count.
    const facet = q.getMeta(userA).publishers;
    expect(facet).toEqual([{ value: "Marvel", count: 2 }]);
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

describe("replaceComicCover", () => {
  it("swaps the image but keeps metadata + board membership", async () => {
    const comic = makeComic(userA, { series: "Batman", authors: ["Bob Kane"] });
    const board = q.createBoard(userA, "B", [comic.id]);
    const oldUrl = comic.imageUrl;

    const img = { ...fakeImage(), width: 999, height: 1500 };
    const updated = await q.replaceComicCover(userA, comic.id, img);

    expect(updated).not.toBeNull();
    expect(updated!.id).toBe(comic.id); // same comic
    expect(updated!.imageUrl).not.toBe(oldUrl); // new url → busts the immutable cache
    expect(updated!.imageUrl).toContain(img.id);
    expect(updated!.width).toBe(999);
    // metadata + boards preserved
    expect(updated!.series).toBe("Batman");
    expect(updated!.authors).toEqual(["Bob Kane"]);
    expect(updated!.boardIds).toContain(board.id);
  });

  it("returns null for a comic the user doesn't own", async () => {
    const comic = makeComic(userA);
    expect(await q.replaceComicCover(userB, comic.id, fakeImage())).toBeNull();
  });
});

describe("upscale accept / revert", () => {
  // revertUpscale re-reads the restored file's dimensions rather than storing
  // them twice; in tests there's no real file, so stub that read.
  const size = (w: number, h: number) => async () => ({
    width: w,
    height: h,
    blurDataUrl: "data:,restored",
  });

  it("accepting keeps the replaced cover so it can be restored", () => {
    const comic = makeComic(userA, { series: "Batman" });
    const original = comic.imageUrl;

    const bigger = { ...fakeImage(), width: 1200, height: 1820 };
    const updated = q.acceptUpscale(userA, comic.id, bigger)!;

    expect(updated.imageUrl).toContain(bigger.id);
    expect(updated.width).toBe(1200);
    expect(updated.upscaled).toBe(true); // the DTO flag the UI gates revert on
    expect(updated.series).toBe("Batman"); // metadata untouched
    expect(updated.imageUrl).not.toBe(original);
  });

  it("reverting restores the original image and clears the flag", async () => {
    const comic = makeComic(userA);
    const original = comic.imageUrl;
    q.acceptUpscale(userA, comic.id, { ...fakeImage(), width: 1200, height: 1820 });

    const reverted = await q.revertUpscale(userA, comic.id, size(600, 910))!;
    expect(reverted!.imageUrl).toBe(original);
    expect(reverted!.width).toBe(600); // re-read, not the upscaled 1200
    expect(reverted!.upscaled).toBe(false);
  });

  // The reason originalImagePath is written only when null: otherwise the
  // second upscale would record the first *generated* image as the "original",
  // and reverting would land on an upscale rather than the user's real cover.
  it("upscaling twice still reverts to the true original, not the first upscale", async () => {
    const comic = makeComic(userA);
    const original = comic.imageUrl;

    q.acceptUpscale(userA, comic.id, { ...fakeImage(), width: 1200, height: 1820 });
    q.acceptUpscale(userA, comic.id, { ...fakeImage(), width: 2400, height: 3640 });

    const reverted = await q.revertUpscale(userA, comic.id, size(600, 910))!;
    expect(reverted!.imageUrl).toBe(original);
    expect(reverted!.upscaled).toBe(false);
  });

  it("reverting a comic that was never upscaled returns null", async () => {
    const comic = makeComic(userA);
    expect(await q.revertUpscale(userA, comic.id, size(600, 910))).toBeNull();
  });

  it("won't accept or revert another user's comic", async () => {
    const comic = makeComic(userA);
    expect(q.acceptUpscale(userB, comic.id, fakeImage())).toBeNull();
    q.acceptUpscale(userA, comic.id, fakeImage());
    expect(await q.revertUpscale(userB, comic.id, size(600, 910))).toBeNull();
  });

  // isCoverReferenced is the authorization check for a client-supplied path:
  // a candidate is by definition unreferenced, so anything in use — including
  // another account's — must not be adoptable or deletable through it.
  it("treats live covers and kept originals as referenced, across users", () => {
    const mine = makeComic(userA);
    const theirs = makeComic(userB);
    const upscaled = { ...fakeImage(), width: 1200, height: 1820 };
    q.acceptUpscale(userA, mine.id, upscaled);

    const originalKey = `covers/${mine.id}/full.webp`;
    expect(q.isCoverReferenced(upscaled.imagePath)).toBe(true); // live cover
    expect(q.isCoverReferenced(originalKey)).toBe(true); // kept pre-upscale original
    expect(q.isCoverReferenced(`covers/${theirs.id}/full.webp`)).toBe(true); // another user's
    expect(q.isCoverReferenced("covers/never-existed/full.webp")).toBe(false);
  });
});
