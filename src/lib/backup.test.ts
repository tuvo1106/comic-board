import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db, sqlite } from "@/db/client";
import * as q from "@/db/queries";
import { importBackup } from "@/db/import";
import { newId } from "@/lib/ids";
import type { ProcessedImage } from "@/lib/images";
import { storage } from "@/lib/storage";
import { BACKUP_VERSION, backupFilename, buildBackupZip, type BackupManifest } from "./backup";

let userA = "";
let userB = "";

/** Create a comic with a real (tiny, decodable) webp cover on disk. */
async function makeComicWithCover(userId: string, over: Partial<q.CreateComicInput> = {}) {
  const id = newId();
  const buf = await sharp({
    create: { width: 8, height: 12, channels: 3, background: { r: 90, g: 120, b: 150 } },
  })
    .webp()
    .toBuffer();
  const image: ProcessedImage = {
    id,
    imagePath: `covers/${id}/full.webp`,
    thumbPath: `covers/${id}/thumb.webp`,
    blurDataUrl: "data:,",
    width: 8,
    height: 12,
  };
  await storage.put(image.imagePath, buf);
  return q.createComic({
    userId,
    series: "Series",
    issueNumber: "1",
    authors: [],
    artists: [],
    characters: [],
    tags: [],
    boardIds: [],
    image,
    ...over,
  });
}

/**
 * Swap a comic's cover for a fresh image in its own folder, mirroring what the
 * replace-cover route does. Returns the new image so a test can assert against
 * the folder it actually landed in — which is *not* `covers/<comicId>`.
 */
async function replaceCoverWithNewImage(userId: string, comicId: string) {
  const id = newId();
  const buf = await sharp({
    create: { width: 10, height: 15, channels: 3, background: { r: 200, g: 30, b: 30 } },
  })
    .webp()
    .toBuffer();
  const image: ProcessedImage = {
    id,
    imagePath: `covers/${id}/full.webp`,
    thumbPath: `covers/${id}/thumb.webp`,
    blurDataUrl: "data:,",
    width: 10,
    height: 15,
  };
  await storage.put(image.imagePath, buf);
  await q.replaceComicCover(userId, comicId, image);
  return { image, buf };
}

/** True if a storage key's folder still exists on disk. */
async function dirExists(key: string): Promise<boolean> {
  return fs
    .stat(storage.resolve(key))
    .then(() => true)
    .catch(() => false);
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

describe("backupFilename", () => {
  it("stamps a sortable zip name", () => {
    const name = backupFilename(new Date(2026, 6, 26, 14, 30, 5));
    expect(name).toBe("comic-board-backup-20260726-143005.zip");
  });
});

describe("buildBackupZip", () => {
  it("includes a manifest and one full.webp per comic", async () => {
    const board = q.createBoard(userA, "Vault");
    await makeComicWithCover(userA, { series: "Batman", rating: 4.5 });
    await makeComicWithCover(userA, { series: "Spider-Man", boardIds: [board.id] });

    const zip = await buildBackupZip(userA);
    const files = unzipSync(zip);
    const manifest = JSON.parse(strFromU8(files["collection.json"])) as BackupManifest;

    expect(manifest.version).toBe(BACKUP_VERSION);
    expect(manifest.comics).toHaveLength(2);
    expect(manifest.boards).toHaveLength(1);
    // Every comic's cover file is present in the zip.
    for (const c of manifest.comics) {
      expect(files[c.coverFile]).toBeInstanceOf(Uint8Array);
      expect(files[c.coverFile].length).toBeGreaterThan(0);
    }
    // Membership + rating are captured in the manifest.
    const spidey = manifest.comics.find((c) => c.series === "Spider-Man")!;
    expect(spidey.boardIds).toEqual([board.id]);
    const bats = manifest.comics.find((c) => c.series === "Batman")!;
    expect(bats.rating).toBe(4.5);
  });

  it("scopes the backup to the requesting user", async () => {
    await makeComicWithCover(userA, { series: "Mine" });
    await makeComicWithCover(userB, { series: "Theirs" });

    const zip = await buildBackupZip(userA);
    const manifest = JSON.parse(strFromU8(unzipSync(zip)["collection.json"])) as BackupManifest;
    expect(manifest.comics.map((c) => c.series)).toEqual(["Mine"]);
  });

  it("exports a replaced cover from its new folder, not covers/<comicId>", async () => {
    const comic = await makeComicWithCover(userA, { series: "Batman" });
    const { buf } = await replaceCoverWithNewImage(userA, comic.id);

    // Before the fix this threw (covers/<comicId> was deleted by the replace).
    const files = unzipSync(await buildBackupZip(userA));
    const manifest = JSON.parse(strFromU8(files["collection.json"])) as BackupManifest;
    const coverFile = manifest.comics[0].coverFile;
    expect(files[coverFile].length).toBe(buf.length); // bytes are the new image's
  });
});

describe("importBackup (replace)", () => {
  it("round-trips comics, boards, memberships and fields with fresh ids", async () => {
    const board = q.createBoard(userA, "Vault");
    const original = await makeComicWithCover(userA, {
      series: "Batman",
      issueNumber: "156",
      publisher: "DC",
      rating: 5,
      tags: ["Facsimile"],
      boardIds: [board.id],
    });
    await makeComicWithCover(userA, { series: "Spider-Man" });

    const zip = await buildBackupZip(userA);
    const result = await importBackup(zip, userB, { replace: true });
    expect(result).toEqual({ comics: 2, boards: 1 });

    const comics = q.listComics(userB);
    expect(comics).toHaveLength(2);
    const boardsB = q.listBoards(userB);
    expect(boardsB).toHaveLength(1);

    const bats = comics.find((c) => c.series === "Batman")!;
    expect(bats.issueNumber).toBe("156");
    expect(bats.publisher).toBe("DC");
    expect(bats.rating).toBe(5);
    expect(bats.tags).toEqual(["Facsimile"]);
    // Membership survived, remapped to the new board id.
    expect(bats.boardIds).toEqual([boardsB[0].id]);
    // Import mints fresh ids rather than preserving originals.
    expect(bats.id).not.toBe(original.id);
    expect(boardsB[0].id).not.toBe(board.id);
  });

  it("is idempotent under replace (no duplication on re-run)", async () => {
    await makeComicWithCover(userA, { series: "Batman" });
    const zip = await buildBackupZip(userA);

    await importBackup(zip, userB, { replace: true });
    await importBackup(zip, userB, { replace: true });
    expect(q.listComics(userB)).toHaveLength(1);
  });

  it("deletes a replaced cover's real folder when wiping, leaving no orphan", async () => {
    // The wipe used to delete `covers/<comicId>`, which stops being where the
    // cover lives the moment it's replaced — so the live folder survived the
    // wipe and leaked on every restore. Sibling of the buildBackupZip case above.
    const comic = await makeComicWithCover(userB, { series: "Batman" });
    const { image } = await replaceCoverWithNewImage(userB, comic.id);
    expect(await dirExists(image.imagePath)).toBe(true);

    await makeComicWithCover(userA, { series: "Incoming" });
    await importBackup(await buildBackupZip(userA), userB, { replace: true });

    expect(await dirExists(image.imagePath)).toBe(false);
  });

  it("rejects an unsupported backup version", async () => {
    const bad = zipSync({
      "collection.json": strToU8(JSON.stringify({ version: 999, comics: [], boards: [] })),
    });
    await expect(importBackup(bad, userB, { replace: true })).rejects.toThrow(/version/i);
  });
});
