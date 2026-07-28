import fs from "node:fs/promises";
import { zipSync, strToU8, type Zippable } from "fflate";
import { listBoards, listComics } from "@/db/queries";
import { storage } from "@/lib/storage";

/**
 * Backup format for the collection export/import (see ROADMAP 1a). A backup is a
 * zip of a `collection.json` manifest plus every cover's `full.webp`:
 *
 *   collection.json
 *   covers/<comicId>/full.webp   (one per comic)
 *
 * Thumbnails and blur placeholders are intentionally NOT stored — import
 * regenerates them from the full image via `processUpload`, so ids/thumbs/blurs
 * come out clean. Covers are already-compressed webp, so the zip is store-only
 * (no deflate) to stay fast and memory-cheap.
 */
export const BACKUP_VERSION = 1;

export interface ComicExport {
  id: string; // original id (pre-import); import mints a fresh one
  series: string;
  issueNumber: string | null;
  publisher: string | null;
  coverDate: string | null;
  rating: number | null;
  authors: string[];
  artists: string[]; // cover artists
  characters: string[];
  tags: string[];
  boardIds: string[]; // original board ids; import remaps to new ids
  coverFile: string; // zip path, "covers/<id>/full.webp"
}

export interface BoardExport {
  id: string;
  name: string;
  tabPosition: number;
  createdAt: number;
}

export interface BackupManifest {
  version: number;
  exportedAt: number; // ms epoch
  comics: ComicExport[];
  boards: BoardExport[];
}

/** Filename for a fresh backup, e.g. comic-board-backup-20260726-143005.zip. */
export function backupFilename(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  const stamp =
    `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}` +
    `-${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`;
  return `comic-board-backup-${stamp}.zip`;
}

/**
 * Assemble a backup zip for one user's collection: comics (in My-Comics order,
 * so append-on-import preserves ordering) + boards + each full-size cover.
 */
export async function buildBackupZip(userId: string): Promise<Uint8Array> {
  const comics = listComics(userId);
  const boards = listBoards(userId);

  const files: Zippable = {};
  const comicExports: ComicExport[] = [];

  for (const c of comics) {
    // Zip entry keyed by comic id (stable for import), but read the bytes from
    // the comic's *actual* image path — a replaced cover lives in a different
    // folder than covers/<comicId>.
    const coverFile = `covers/${c.id}/full.webp`;
    const bytes = await fs.readFile(storage.resolve(storage.keyFromUrl(c.imageUrl)));
    files[coverFile] = new Uint8Array(bytes);
    comicExports.push({
      id: c.id,
      series: c.series,
      issueNumber: c.issueNumber,
      publisher: c.publisher,
      coverDate: c.coverDate,
      rating: c.rating,
      authors: c.authors,
      artists: c.artists,
      characters: c.characters,
      tags: c.tags,
      boardIds: c.boardIds,
      coverFile,
    });
  }

  const manifest: BackupManifest = {
    version: BACKUP_VERSION,
    exportedAt: Date.now(),
    comics: comicExports,
    boards: boards.map((b) => ({
      id: b.id,
      name: b.name,
      tabPosition: b.tabPosition,
      createdAt: b.createdAt,
    })),
  };
  files["collection.json"] = strToU8(JSON.stringify(manifest, null, 2));

  return zipSync(files, { level: 0 });
}
