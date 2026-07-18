import { auth } from "./auth";

/** Current user's id from the request's session cookie, or null. */
export async function getUserId(req: Request): Promise<string | null> {
  const session = await auth.api.getSession({ headers: req.headers });
  return session?.user.id ?? null;
}
