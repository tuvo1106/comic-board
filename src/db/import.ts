/**
 * Restore a collection from a backup zip produced by `GET /api/export`
 * (see `src/lib/backup.ts`). Rebuilds via the same `createComic` / `createBoard`
 * the app uses, so ids/thumbs/blurs regenerate cleanly.
 *
 * Run with `npm run db:import <backup.zip> --replace`. This is a **restore**:
 * `--replace` wipes the target user's comics, boards, and covers first, then
 * recreates everything from the backup. It refuses to run without `--replace`
 * so it can never clobber a collection by accident. The target account is
 * chosen by IMPORT_USER_EMAIL (falling back to SEED_USER_EMAIL) and must
 * already exist.
 */
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { eq } from "drizzle-orm";
import { unzipSync, strFromU8 } from "fflate";
import { db } from "./client";
import { boards, comics } from "./schema";
import { user } from "./auth-schema";
import { createBoard, createComic } from "./queries";
import { coverDir, storage } from "@/lib/storage";
import { processUpload } from "@/lib/images";
import { BACKUP_VERSION, type BackupManifest } from "@/lib/backup";

export interface ImportResult {
  comics: number;
  boards: number;
}

/** Delete a user's comics, boards, and cover files. Joins cascade via FKs. */
async function wipeUser(userId: string) {
  // Select `imagePath`, not just the id: a replaced cover lives in a folder
  // named after its *image* id, which stops matching the comic id from the
  // first replace onward (see `coverDir`). Deleting by comic id orphaned those
  // folders on disk.
  const owned = db
    .select({ imagePath: comics.imagePath })
    .from(comics)
    .where(eq(comics.userId, userId))
    .all();
  db.delete(comics).where(eq(comics.userId, userId)).run(); // cascades comic_* + board_comics
  db.delete(boards).where(eq(boards.userId, userId)).run(); // cascades any remaining board_comics
  for (const { imagePath } of owned) {
    await storage.deletePrefix(coverDir(imagePath));
  }
}

/**
 * Import a backup into `userId`. With `replace`, the user's existing collection
 * is wiped first (a true restore); otherwise comics are appended.
 */
export async function importBackup(
  zipBytes: Uint8Array,
  userId: string,
  opts: { replace: boolean },
): Promise<ImportResult> {
  const files = unzipSync(zipBytes);
  const manifestBytes = files["collection.json"];
  if (!manifestBytes) throw new Error("collection.json not found in backup zip");
  const manifest = JSON.parse(strFromU8(manifestBytes)) as BackupManifest;
  if (manifest.version !== BACKUP_VERSION) {
    throw new Error(
      `Unsupported backup version ${manifest.version} (this build reads v${BACKUP_VERSION})`,
    );
  }

  if (opts.replace) await wipeUser(userId);

  // Recreate boards in tab order first, so createComic can attach memberships.
  // createBoard mints fresh ids, so map old -> new to remap comic.boardIds.
  const boardMap = new Map<string, string>();
  const orderedBoards = [...manifest.boards].sort((a, b) => a.tabPosition - b.tabPosition);
  for (const b of orderedBoards) {
    boardMap.set(b.id, createBoard(userId, b.name).id);
  }

  for (const c of manifest.comics) {
    const coverBytes = files[c.coverFile];
    if (!coverBytes) {
      throw new Error(`Missing cover ${c.coverFile} for ${c.series} #${c.issueNumber ?? "?"}`);
    }
    const image = await processUpload(Buffer.from(coverBytes));
    createComic({
      userId,
      series: c.series,
      issueNumber: c.issueNumber,
      publisher: c.publisher,
      coverDate: c.coverDate,
      rating: c.rating,
      authors: c.authors,
      artists: c.artists,
      characters: c.characters,
      tags: c.tags,
      boardIds: c.boardIds
        .map((id) => boardMap.get(id))
        .filter((id): id is string => id !== undefined),
      image,
    });
  }

  return { comics: manifest.comics.length, boards: orderedBoards.length };
}

async function main() {
  const args = process.argv.slice(2);
  const replace = args.includes("--replace");
  const zipPath = args.find((a) => !a.startsWith("--"));
  // IMPORT_USER_EMAIL is the clear name for a restore; SEED_USER_EMAIL is
  // accepted as a fallback so the seed/throwaway workflow's env still works.
  const email = process.env.IMPORT_USER_EMAIL ?? process.env.SEED_USER_EMAIL;

  if (!zipPath) {
    console.error("Usage: IMPORT_USER_EMAIL=<email> npm run db:import <backup.zip> -- --replace");
    process.exit(1);
  }
  if (!email) {
    console.error("Set IMPORT_USER_EMAIL (or SEED_USER_EMAIL) to the account to restore into.");
    process.exit(1);
  }
  if (!replace) {
    console.error(
      "Refusing to import without --replace.\n" +
        "This is a restore: it wipes the target user's comics, boards, and covers,\n" +
        "then rebuilds them from the backup. Re-run with --replace to confirm.",
    );
    process.exit(1);
  }

  const targetUser = db.select({ id: user.id }).from(user).where(eq(user.email, email)).get();
  if (!targetUser) {
    console.error(
      `No account with email ${email}. Import is a restore, not signup — create the account first.`,
    );
    process.exit(1);
  }

  const zipBytes = new Uint8Array(await fs.readFile(zipPath));
  const result = await importBackup(zipBytes, targetUser.id, { replace });
  console.log(`Imported ${result.comics} comics and ${result.boards} boards into ${email}.`);
}

// Only run when invoked directly (`tsx src/db/import.ts`), not when imported.
const isEntrypoint = process.argv[1] === fileURLToPath(import.meta.url);
if (isEntrypoint) {
  main()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
