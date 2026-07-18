import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Optimistic auth gate: page routes require a session cookie, else redirect to
 * /login; a signed-in user visiting /login or /signup goes to the board. This
 * only checks cookie presence (edge-safe) — the API routes do real validation.
 */
export function middleware(req: NextRequest) {
  const hasSession = getSessionCookie(req);
  const { pathname } = req.nextUrl;
  const isAuthPage = pathname === "/login" || pathname === "/signup";

  if (!hasSession && !isAuthPage) {
    const url = new URL("/login", req.url);
    return NextResponse.redirect(url);
  }
  if (hasSession && isAuthPage) {
    return NextResponse.redirect(new URL("/", req.url));
  }
  return NextResponse.next();
}

export const config = {
  // Guard everything except API routes, Next internals, and served images.
  matcher: ["/((?!api|_next/static|_next/image|images|favicon.ico).*)"],
};
