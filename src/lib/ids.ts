import { customAlphabet } from "nanoid";

// URL-safe, unambiguous alphabet; 14 chars is plenty for a single-user app.
const alphabet = "0123456789abcdefghijklmnopqrstuvwxyz";
export const newId = customAlphabet(alphabet, 14);

/** Case-insensitive dedupe key for artist/character names. */
export function nameKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}
