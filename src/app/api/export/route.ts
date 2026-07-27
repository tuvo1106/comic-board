import { backupFilename, buildBackupZip } from "@/lib/backup";
import { handle, unauthorized } from "@/lib/api";
import { getUserId } from "@/lib/session";

export const runtime = "nodejs";

/**
 * GET /api/export — download a zip backup of the signed-in user's collection
 * (see `src/lib/backup.ts`). Buffered response, matching the image route; a
 * personal collection is small enough not to need streaming.
 */
export async function GET(req: Request) {
  return handle(async () => {
    const userId = await getUserId(req);
    if (!userId) return unauthorized();

    const zip = await buildBackupZip(userId);
    return new Response(new Uint8Array(zip), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${backupFilename()}"`,
        "Cache-Control": "no-store",
      },
    });
  });
}
