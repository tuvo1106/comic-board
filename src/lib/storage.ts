import fs from "node:fs/promises";
import path from "node:path";
import { DATA_DIR } from "@/db/client";

/**
 * Storage abstraction. v1 writes to the local filesystem under DATA_DIR/covers.
 * Swap this implementation for S3/R2 later without touching callers: keep the
 * same `put` / `delete` / `getUrl` shape.
 *
 * `key` is a repo-relative-ish path like "covers/<id>/full.webp". `getUrl`
 * returns the client-facing URL served by /images/[...path].
 */
export interface StorageAdapter {
  put(key: string, data: Buffer): Promise<void>;
  delete(key: string): Promise<void>;
  /** Delete everything under a prefix (e.g. a whole `covers/<id>` folder). */
  deletePrefix(prefix: string): Promise<void>;
  /**
   * Every stored cover folder, with when it was last written. Used by the
   * orphan sweep to find folders no comic references — which is the only way to
   * catch a candidate whose owner never accepted or discarded it (a mid-upscale
   * close, an unmount, a crash, a restart).
   */
  listCoverDirs(): Promise<{ key: string; modifiedAt: number }[]>;
  getUrl(key: string): string;
  /** Inverse of `getUrl`: map a client image URL back to its storage key. */
  keyFromUrl(url: string): string;
  /** Absolute filesystem path for a key, used by the image-serving route. */
  resolve(key: string): string;
}

const COVERS_ROOT = path.join(DATA_DIR, "covers");

class LocalStorage implements StorageAdapter {
  async put(key: string, data: Buffer): Promise<void> {
    const abs = this.resolve(key);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, data);
  }

  async delete(key: string): Promise<void> {
    const abs = this.resolve(key);
    await fs.rm(abs, { force: true });
  }

  async deletePrefix(prefix: string): Promise<void> {
    const abs = this.resolve(prefix);
    await fs.rm(abs, { recursive: true, force: true });
  }

  async listCoverDirs(): Promise<{ key: string; modifiedAt: number }[]> {
    // Missing root just means nothing has been uploaded yet.
    const entries = await fs.readdir(COVERS_ROOT, { withFileTypes: true }).catch(() => []);
    const out: { key: string; modifiedAt: number }[] = [];
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      const stat = await fs.stat(path.join(COVERS_ROOT, e.name)).catch(() => null);
      if (stat) out.push({ key: `covers/${e.name}`, modifiedAt: stat.mtimeMs });
    }
    return out;
  }

  getUrl(key: string): string {
    // key is "covers/<id>/full.webp" -> served under /images/<id>/full.webp
    const rel = key.startsWith("covers/") ? key.slice("covers/".length) : key;
    return `/images/${rel}`;
  }

  keyFromUrl(url: string): string {
    // "/images/<id>/full.webp" -> "covers/<id>/full.webp"
    return url.startsWith("/images/") ? `covers/${url.slice("/images/".length)}` : url;
  }

  resolve(key: string): string {
    const rel = key.startsWith("covers/") ? key.slice("covers/".length) : key;
    // Prevent path traversal.
    const abs = path.normalize(path.join(COVERS_ROOT, rel));
    if (!abs.startsWith(COVERS_ROOT)) {
      throw new Error("Invalid storage key");
    }
    return abs;
  }
}

export const storage: StorageAdapter = new LocalStorage();
export { COVERS_ROOT };

/**
 * Folder of a cover key: "covers/<id>/full.webp" -> "covers/<id>".
 *
 * Always derive a comic's cover folder from its stored `imagePath`, never from
 * its comic id. The two match only until the cover is replaced: a new comic's
 * id *is* its original image id, but `replaceComicCover` writes to a fresh
 * `covers/<newImageId>/` folder and leaves the comic id alone. Deleting by
 * comic id therefore misses the live folder and orphans it on disk.
 */
export function coverDir(imagePath: string): string {
  return imagePath.replace(/\/[^/]+$/, "");
}
