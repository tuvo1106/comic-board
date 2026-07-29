import { BASE } from "../env.mjs";

// Everything is gated behind auth; log in with the seed account (which owns
// the seeded collection) before exercising the board.
export async function loginAsSeed({ p, ck, sleep, env }) {
  await p.goto(`${BASE}/login`, { waitUntil: "networkidle0" });
  await sleep(600);
  await p.type("input[type='email']", env.SEED_USER_EMAIL);
  await p.type("input[type='password']", env.SEED_USER_PASSWORD);
  await Promise.all([
    p.waitForNavigation({ waitUntil: "networkidle0" }).catch(() => {}),
    p.click("button[type='submit']"),
  ]);
  await sleep(1200);
  ck(new URL(p.url()).pathname === "/", "login with seed account lands on the board");
}

// Sign-up: creates a new, independent account with an empty collection —
// every other test in this suite logs in via the seed account instead. Ends
// signed back in as the seed user, since every later feature assumes that.
export async function signUpFlow({ p, ck, sleep, env, openAccountMenu, clickButtonByText }) {
  // The middleware redirects an already-signed-in user straight from /signup
  // back to the board (middleware.ts) — sign out first.
  await openAccountMenu(env.SEED_USER_EMAIL);
  await sleep(500);
  await clickButtonByText("Sign out");
  await sleep(800);

  const newEmail = `newuser-${Date.now()}@example.com`;
  await p.goto(`${BASE}/signup`, { waitUntil: "networkidle0" });
  await sleep(500);
  await p.type("input[type='email']", newEmail);
  await p.type("input[type='password']", "newuserpass123");
  await Promise.all([
    p.waitForNavigation({ waitUntil: "networkidle0" }).catch(() => {}),
    p.click("button[type='submit']"),
  ]);
  await sleep(1000);
  ck(new URL(p.url()).pathname === "/", "sign-up lands on the board");
  const newUserComics = await p.evaluate(() => fetch("/api/comics").then((r) => r.json()));
  ck(
    Array.isArray(newUserComics) && newUserComics.length === 0,
    "the new account starts with an empty collection, not the seed data",
  );

  // Sign back in as the seed user for the rest of the suite.
  await openAccountMenu(newEmail);
  await sleep(500);
  await clickButtonByText("Sign out");
  await sleep(800);
  await p.goto(`${BASE}/login`, { waitUntil: "networkidle0" });
  await sleep(500);
  await p.type("input[type='email']", env.SEED_USER_EMAIL);
  await p.type("input[type='password']", env.SEED_USER_PASSWORD);
  await Promise.all([
    p.waitForNavigation({ waitUntil: "networkidle0" }).catch(() => {}),
    p.click("button[type='submit']"),
  ]);
  await sleep(1000);
  ck(
    new URL(p.url()).pathname === "/",
    "signs back in as the seed account for the rest of the suite",
  );
}

// A present-but-invalid session cookie must NOT loop / ⇄ /login (item 21).
// The middleware gate only checks cookie *presence*; the API validates it. A
// stale cookie (after a BETTER_AUTH_SECRET rotation, a session revocation, or
// a DB reset) passes the gate, 401s at the API, and — unless the 401 path
// clears it — the redirect to /login bounces straight back to "/", forever.
// Simulate a stale cookie with a garbage token under the real cookie name;
// this must settle on a usable /login instead of a redirect storm.
export async function staleCookieLoop({ p, ck, sleep }) {
  await p.setCookie({
    name: "better-auth.session_token",
    value: "invalid.stale-token",
    domain: "localhost",
    path: "/",
    httpOnly: true,
  });
  let navs = 0;
  const onNav = (frame) => {
    if (frame === p.mainFrame()) navs++;
  };
  p.on("framenavigated", onNav);
  await p.goto(BASE, { waitUntil: "networkidle0" }).catch(() => {});
  await sleep(2500); // let the 401 → sign-out → /login settle (or expose a loop)
  p.off("framenavigated", onNav);
  const landedOnLogin = new URL(p.url()).pathname === "/login";
  const hasLoginForm = (await p.$("input[type='password']")) !== null;
  ck(landedOnLogin && hasLoginForm, "stale session cookie lands on a usable /login");
  ck(navs < 8, `stale session cookie doesn't loop / ⇄ /login (${navs} navigations)`);
}
