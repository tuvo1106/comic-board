import { handle, ok } from "@/lib/api";
import { getMeta } from "@/db/queries";

export const runtime = "nodejs";

export async function GET() {
  return handle(() => ok(getMeta()));
}
