import fs from "node:fs/promises";
import { storage } from "@/lib/storage";

export const runtime = "nodejs";

type Params = { params: Promise<{ path: string[] }> };

/**
 * Serve a stored cover. Keys look like /images/<comicId>/full.webp. Images are
 * never mutated in place (uploads create new ids), so they cache immutably.
 */
export async function GET(_req: Request, { params }: Params) {
  const { path: segments } = await params;
  const key = `covers/${segments.join("/")}`;

  let abs: string;
  try {
    abs = storage.resolve(key);
  } catch {
    return new Response("Bad path", { status: 400 });
  }

  try {
    const data = await fs.readFile(abs);
    return new Response(new Uint8Array(data), {
      headers: {
        "Content-Type": "image/webp",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
