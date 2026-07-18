import fs from "node:fs/promises";
import path from "node:path";
import { DATA_DIR } from "@/db/client";

/**
 * Storage abstraction. v1 writes to the local filesystem under DATA_DIR/covers.
 * Swap this implementation for S3/R2 later without touching callers: keep the
 * same `put` / `delete` / `getUrl` shape.
 *
 * `key` is a repo-relative-ish path like "covers/<id>/orig.webp". `getUrl`
 * returns the client-facing URL served by /images/[...path].
 */
export interface StorageAdapter {
  put(key: string, data: Buffer): Promise<void>;
  delete(key: string): Promise<void>;
  getUrl(key: string): string;
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

  getUrl(key: string): string {
    // key is "covers/<id>/orig.webp" -> served under /images/<id>/orig.webp
    const rel = key.startsWith("covers/") ? key.slice("covers/".length) : key;
    return `/images/${rel}`;
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
