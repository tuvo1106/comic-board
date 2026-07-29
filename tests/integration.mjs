/**
 * Integration tests: drive the real app in a headless browser against an
 * ISOLATED test database (never the dev/user data). Covers the flows that unit
 * tests can't — the ones behind the bugs we actually hit: client-side filter
 * rendering, board-scoped facet counts, drag-reorder persistence, the detail
 * modal, edit persistence, per-board sort defaults, and portal'd overlays.
 *
 *   npm run test:integration
 *
 * Spins up its own Next dev server on port 3940 with a throwaway sqlite db under
 * ./data/test, seeded from ./images, and tears it all down at the end.
 */
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const ROOT = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const PORT = 3940;
const BASE = `http://localhost:${PORT}`;
const CHROME =
  process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const DATA_DIR = path.join(ROOT, "data", "test");
const DB_PATH = path.join(DATA_DIR, "test.db");
const DIST_DIR = ".next-itest"; // separate build dir so a running dev server isn't disturbed
const env = {
  ...process.env,
  DATA_DIR,
  DATABASE_PATH: DB_PATH,
  NEXT_DIST_DIR: DIST_DIR,
  // Auth origin must match this test server, not the dev server's .env value.
  BETTER_AUTH_URL: BASE,
  BETTER_AUTH_SECRET: "integration-test-secret",
  // Known seed account to log in with.
  SEED_USER_EMAIL: "itest@example.com",
  SEED_USER_PASSWORD: "integration123",
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fails = [];
const ck = (cond, msg) => {
  console.log(`${cond ? "PASS" : "FAIL"}: ${msg}`);
  if (!cond) fails.push(msg);
};

function run(cmd, args) {
  const r = spawnSync(cmd, args, { cwd: ROOT, env, stdio: "inherit" });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(" ")} failed`);
}

async function waitForServer() {
  for (let i = 0; i < 120; i++) {
    try {
      const res = await fetch(BASE);
      if (res.ok) return;
    } catch {
      /* not up yet */
    }
    await sleep(500);
  }
  throw new Error("server did not become ready");
}

// --- setup: isolated db + production build ---
fs.rmSync(DATA_DIR, { recursive: true, force: true });
fs.mkdirSync(DATA_DIR, { recursive: true });
console.log("• migrating + seeding isolated test db…");
run("npm", ["run", "db:migrate"]);
run("npm", ["run", "db:seed"]);

// Run against a production build (next start), not next dev: dev compiles routes
// on demand, and those unpredictable cold-compile times make the browser waits
// flaky on slow CI runners. A prebuilt server responds instantly.
console.log("• building the app…");
run("npx", ["next", "build"]);
const server = spawn("npx", ["next", "start", "-p", String(PORT)], { cwd: ROOT, env });
let browser;
try {
  await waitForServer();
  browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
    defaultViewport: { width: 1440, height: 1000 },
  });
  const p = await browser.newPage();

  // Everything is gated behind auth; log in with the seed account (which owns
  // the seeded collection) before exercising the board.
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

  // Account settings (item 6): change email/password via the account menu.
  // Both round-trip back to the seed values — nothing later in this run
  // re-authenticates, but staying self-contained is cheap and safer if test
  // order ever changes.
  {
    await p.click(`button[title='${env.SEED_USER_EMAIL}']`);
    await sleep(300);
    const [settingsItem] = await p.$$("xpath/.//button[normalize-space(.)='Account settings']");
    await settingsItem.click();
    await sleep(400);

    const clickSubmit = async (label) => {
      const [btn] = await p.$$(`xpath/.//button[normalize-space(.)='${label}']`);
      await btn.click();
    };
    const toastSays = (text) =>
      p.evaluate((t) => document.body.textContent.includes(t), text);

    // Email: seed -> temp -> back to seed.
    await p.type("[role='dialog'] input[type='email']", "temp@example.com");
    await clickSubmit("Update email");
    await sleep(500);
    ck(await toastSays("Email updated"), "change-email shows a success toast");
    await p.type("[role='dialog'] input[type='email']", env.SEED_USER_EMAIL);
    await clickSubmit("Update email");
    await sleep(500);

    // Password: seed -> temp -> back to seed. "Current password" is the
    // password input with no placeholder; "New password" has one.
    const tempPassword = "temp-pass-456";
    await p.type("[role='dialog'] input[type='password']:not([placeholder])", env.SEED_USER_PASSWORD);
    await p.type("[role='dialog'] input[placeholder='At least 8 characters']", tempPassword);
    await clickSubmit("Update password");
    await sleep(500);
    ck(await toastSays("Password updated"), "change-password shows a success toast");
    await p.type("[role='dialog'] input[type='password']:not([placeholder])", tempPassword);
    await p.type("[role='dialog'] input[placeholder='At least 8 characters']", env.SEED_USER_PASSWORD);
    await clickSubmit("Update password");
    await sleep(500);

    await p.keyboard.press("Escape");
    await sleep(300);
  }

  // Export backup: GET /api/export streams a zip attachment. The account
  // menu's "Export backup" item triggers this via `window.location.href =
  // "/api/export"` — a real page navigation to a binary response, which
  // crashed the whole suite in headless Chrome (no download-behavior
  // configured here) when clicked through the UI. The actual gap was route
  // coverage (auth + headers + content), not proving that assignment line
  // runs, so verify the route directly instead.
  {
    const exportRes = await p.evaluate(async () => {
      const r = await fetch("/api/export");
      return { status: r.status, disposition: r.headers.get("content-disposition") ?? "" };
    });
    ck(exportRes.status === 200, `GET /api/export streams the zip (status ${exportRes.status})`);
    ck(
      /attachment/.test(exportRes.disposition) && /\.zip/.test(exportRes.disposition),
      `response is a downloadable zip attachment (got "${exportRes.disposition}")`,
    );
  }

  // Sign-up: creates a new, independent account with an empty collection —
  // every other test in this suite logs in via the seed account instead.
  {
    // The middleware redirects an already-signed-in user straight from
    // /signup back to the board (middleware.ts) — sign out first. Native DOM
    // clicks (not Puppeteer's ElementHandle.click) for both steps, same
    // robustness fix as the animated-popover clicks earlier in this file.
    // The trigger's visible text is just an initial letter — it's the
    // `title` attribute that holds the email.
    const openAccountMenu = (email) =>
      p.evaluate((e) => document.querySelector(`button[title='${e}']`)?.click(), email);
    const clickByText = (text) =>
      p.evaluate((t) => {
        [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === t)?.click();
      }, text);
    await openAccountMenu(env.SEED_USER_EMAIL);
    await sleep(500);
    await clickByText("Sign out");
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
    // apiJson isn't defined until later in this file — inline the same fetch here.
    const newUserComics = await p.evaluate(() => fetch("/api/comics").then((r) => r.json()));
    ck(
      Array.isArray(newUserComics) && newUserComics.length === 0,
      "the new account starts with an empty collection, not the seed data",
    );

    // Sign back in as the seed user for the rest of the suite.
    await openAccountMenu(newEmail);
    await sleep(500);
    await clickByText("Sign out");
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

  const imgs = () => p.$$eval("main img[src*='thumb.webp']", (e) => e.length);
  // The board's "N covers" counter reflects the full (filtered) dataset, unlike
  // the mounted <img> count, which is a windowed subset now that the masonry is
  // virtualized. Use it whenever we mean "how much data is on this board".
  const coverCount = () =>
    p.evaluate(() => {
      const el = [...document.querySelectorAll("p")].find((n) =>
        /^\d+\s+covers?$/.test(n.textContent.trim()),
      );
      return el ? Number(el.textContent.trim().match(/^(\d+)/)[1]) : null;
    });
  const sortLabel = () =>
    p.evaluate(() => [...document.querySelectorAll("button")].map((b) => b.textContent).find((t) => t && t.includes("Sort:")));

  // Authenticated fetches must run in the browser (which holds the session cookie).
  const apiJson = (path) => p.evaluate((pth) => fetch(pth).then((r) => r.json()), path);
  const N = (await apiJson("/api/comics")).length;

  await p.goto(BASE, { waitUntil: "networkidle0" });
  await sleep(800);
  ck((await coverCount()) === N, `board reports all ${N} covers`);
  // The "My Comics" tab shows a count badge like custom board tabs (item 23).
  const myComicsTabCount = await p.evaluate(() => {
    const btn = [...document.querySelectorAll("button")].find((b) =>
      b.textContent.trim().startsWith("My Comics"),
    );
    const m = btn && btn.textContent.trim().match(/My Comics\s*(\d+)/);
    return m ? Number(m[1]) : null;
  });
  ck(myComicsTabCount === N, `My Comics tab shows the collection count (${myComicsTabCount})`);
  // Virtualization: only a viewport-sized window of cards is mounted, so the
  // rendered <img> count is a non-empty subset of the full board.
  const mounted = await imgs();
  ck(mounted > 0 && mounted < N, `masonry virtualizes (mounted ${mounted} of ${N})`);
  ck(/Cover date/.test(await sortLabel()), "My Comics defaults to Cover date sort");

  // Regression: client-side filter via click must render the subset (not 0).
  let [pub] = await p.$$("xpath/.//button[normalize-space(.)='Publisher']");
  await pub.click();
  await sleep(300);
  const [dc] = await p.$$("xpath/.//button[contains(., 'DC')]");
  await dc.click();
  await sleep(900);
  const dcCount = await coverCount();
  ck(dcCount > 0 && dcCount < N, `clicking Publisher>DC filters to a subset (${dcCount})`);
  ck((await imgs()) > 0, "filtered board still renders its (windowed) covers");
  // board-scoped facet count matches what renders (option text is like "DC14")
  const dcOptCount = await p.evaluate(() => {
    const btn = [...document.querySelectorAll("button")].find((b) =>
      /^DC\d+$/.test(b.textContent.replace(/\s+/g, "")),
    );
    const m = btn && btn.textContent.replace(/\s+/g, "").match(/(\d+)$/);
    return m ? Number(m[1]) : null;
  });
  ck(dcOptCount === dcCount, `facet dropdown count matches board count (${dcOptCount} vs ${dcCount})`);

  // Rename a publisher inline (pencil) — the new name applies to every comic
  // that used it (normalized publishers). The dropdown is still open here.
  await p.evaluate(() => document.querySelector("button[aria-label='Rename DC']").click());
  await sleep(200);
  await p.evaluate(() => {
    document.activeElement.value = "";
  });
  await p.keyboard.type("DC Comics");
  await p.keyboard.press("Enter");
  await sleep(900);
  const metaAfter = await apiJson("/api/meta");
  const renamed = metaAfter.publishers.find((x) => x.value === "DC Comics");
  ck(
    !!renamed && renamed.count === dcCount,
    `renaming DC -> "DC Comics" applies to all ${dcCount} comics (got ${renamed?.count})`,
  );
  ck(!metaAfter.publishers.some((x) => x.value === "DC"), 'old "DC" publisher is gone');
  // Restore the name (via the API) so later DC-filter checks still have data.
  await p.evaluate(() =>
    fetch("/api/publishers", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ from: "DC Comics", to: "DC" }),
    }).then((r) => r.json()),
  );
  await sleep(300);

  // Drag-reorder persists (Manual sort). Go to a fresh board in manual order.
  await p.goto(`${BASE}/?sort=manual`, { waitUntil: "networkidle0" });
  await sleep(800);
  const before = await p.$$eval("main img[src*='thumb.webp']", (els) => els.map((e) => e.getAttribute("alt")));
  const boxes = await p.$$eval("main img[src*='thumb.webp']", (els) =>
    els.slice(0, 3).map((e) => {
      const r = e.getBoundingClientRect();
      return { cx: r.x + r.width / 2, cy: r.y + r.height / 2 };
    }),
  );
  await p.mouse.move(boxes[2].cx, boxes[2].cy);
  await p.mouse.down();
  for (let i = 1; i <= 14; i++) {
    await p.mouse.move(boxes[2].cx + ((boxes[0].cx - boxes[2].cx) * i) / 14, boxes[2].cy + ((boxes[0].cy - boxes[2].cy) * i) / 14);
    await sleep(20);
  }
  await sleep(200);
  // Wait for the position PATCH to actually persist before reloading (the CI
  // runner is slow enough that a fixed sleep can race the request).
  const posPersisted = p
    .waitForResponse(
      (r) => /\/api\/comics\/[^/]+\/position/.test(r.url()) && r.request().method() === "PATCH",
      { timeout: 10000 },
    )
    .catch(() => null);
  await p.mouse.up();
  await posPersisted;
  await sleep(300);
  const after = await p.$$eval("main img[src*='thumb.webp']", (els) => els.map((e) => e.getAttribute("alt")));
  ck(JSON.stringify(before) !== JSON.stringify(after), "drag changes order");
  await p.goto(`${BASE}/?sort=manual`, { waitUntil: "networkidle0" });
  await sleep(700);
  const reload = await p.$$eval("main img[src*='thumb.webp']", (els) => els.map((e) => e.getAttribute("alt")));
  ck(JSON.stringify(reload) === JSON.stringify(after), "reorder persists across reload");

  // Regression: opening a comic must not reshuffle the board underneath — the
  // board's filter/sort params are carried into the modal URL.
  await p.goto(`${BASE}/?publisher=DC&sort=series`, { waitUntil: "networkidle0" });
  await sleep(700);
  const filteredCount = await imgs();
  await (await p.$$("main img[src*='thumb.webp']"))[0].click();
  await sleep(700);
  ck(
    /[?&]publisher=DC/.test(p.url()) && /[?&]sort=series/.test(p.url()),
    "opening a comic keeps the board's filter+sort in the URL",
  );
  ck(
    (await imgs()) === filteredCount,
    `board underneath keeps its filtered subset, not reshuffled (${await imgs()} vs ${filteredCount})`,
  );
  await p.keyboard.press("Escape");
  await p.goto(BASE, { waitUntil: "networkidle0" }); // reset to a clean board URL
  await sleep(500);

  // Detail modal opens with the full-size cover (shared element).
  // Regression: opening the modal must NOT scroll the board underneath (the
  // fixed overlay used to drag the page to its DOM position, the bottom).
  // Scroll down first, then open a still-visible card via a real DOM click
  // (evaluate, so puppeteer doesn't auto-scroll the element into view).
  await p.evaluate(() => window.scrollTo(0, 500));
  await sleep(150);
  const scrollBefore = await p.evaluate(() => window.scrollY);
  await p.evaluate(() => {
    const vh = window.innerHeight;
    const img = [...document.querySelectorAll("main img[src*='thumb.webp']")].find((im) => {
      const r = im.getBoundingClientRect();
      return r.top >= 0 && r.bottom <= vh;
    });
    (img.closest("button") ?? img).click();
  });
  await sleep(700);
  ck(/\/comic\//.test(p.url()), "clicking a card opens a comic route");
  const scrollAfter = await p.evaluate(() => window.scrollY);
  ck(
    Math.abs(scrollAfter - scrollBefore) < 50,
    `modal open keeps the board scroll position (${scrollBefore} -> ${scrollAfter})`,
  );
  ck(
    await p.evaluate(() => getComputedStyle(document.body).overflow === "hidden"),
    "background scroll is locked while the modal is open",
  );
  // First navigation to the modal route can cold-compile; wait for the image.
  const gotFull = await p
    .waitForSelector("img[src*='full.webp']", { timeout: 8000 })
    .then(() => true)
    .catch(() => false);
  ck(gotFull, "modal shows full-size cover");
  const cid = p.url().split("/comic/")[1].split("?")[0];

  // Edit persists + modal reflects it immediately.
  const [edit] = await p.$$("xpath/.//button[contains(.,'Edit')]");
  await edit.click();
  await p.waitForSelector("input[type='date']", { timeout: 8000 }); // edit form mounted
  const ai = await p.evaluateHandle(() => {
    const l = [...document.querySelectorAll("label")].find((x) => x.textContent.trim().startsWith("Cover Artists"));
    return l.parentElement.querySelector("input");
  });
  await ai.asElement().click();
  await ai.asElement().type("Integration Tester");
  await p.keyboard.press("Enter");
  await sleep(150);
  const [save] = await p.$$("xpath/.//button[contains(.,'Save')]");
  await save.click();
  await sleep(800);
  ck(await p.evaluate(() => document.body.innerText.includes("Integration Tester")), "edit shows immediately in the modal");
  const persisted = await apiJson(`/api/comics/${cid}`);
  ck(persisted.artists.includes("Integration Tester"), "edit persisted server-side");

  // Regression: rating a comic (a partial { rating } patch) must NOT wipe its
  // other metadata (authors/artists/characters/tags).
  // Target the 4-star button by its exact label — indexing into a filtered
  // list is brittle (the singular "1 star" label drops out of a $='stars'
  // match, and coarse pointers render 5 targets instead of 10).
  await (await p.$("button[aria-label='4 stars']")).click();
  await sleep(500);
  const afterRate = await apiJson(`/api/comics/${cid}`);
  ck(
    afterRate.rating === 4 && afterRate.artists.includes("Integration Tester"),
    `rating keeps other metadata (rating=${afterRate.rating}, artists kept=${afterRate.artists.includes("Integration Tester")})`,
  );

  // Click-to-edit-per-field: clicking a display field (not the global Edit
  // button) enters edit mode with that specific field focused.
  await p.evaluate(() => {
    document.querySelector("h2").closest("button").click();
  });
  await sleep(400);
  const seriesFocused = await p.evaluate(() => {
    const label = [...document.querySelectorAll("label")].find((l) =>
      l.textContent.trim().startsWith("Series"),
    );
    const input = label?.parentElement.querySelector("input");
    return !!input && document.activeElement === input;
  });
  ck(seriesFocused, "clicking the series title enters edit mode with the Series field focused");
  await p.keyboard.press("Escape"); // back to display mode (cancelEdit), not closing the modal
  await sleep(400);

  // Arrow-key prev/next navigation follows the board's visible order (navOrder).
  const beforeArrowUrl = p.url();
  await p.keyboard.press("ArrowRight");
  await sleep(500);
  const afterArrowUrl = p.url();
  ck(
    afterArrowUrl !== beforeArrowUrl && /\/comic\//.test(afterArrowUrl),
    "ArrowRight navigates the modal to the next comic",
  );
  await p.keyboard.press("ArrowLeft");
  await sleep(500);
  ck(p.url() === beforeArrowUrl, "ArrowLeft navigates back to the previous comic");

  // Replace cover: upload path only — the Metron-search tab needs a live
  // provider API key, same reason the Metron autofill UI isn't exercised
  // elsewhere in this suite.
  {
    const tmpPngPath = path.join(DATA_DIR, "replace-cover-test.png");
    fs.writeFileSync(
      tmpPngPath,
      Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
        "base64",
      ),
    );
    const beforeImage = (await apiJson(`/api/comics/${cid}`)).imageUrl;
    const [replaceBtn] = await p.$$("xpath/.//button[normalize-space(.)='Replace cover']");
    await replaceBtn.click();
    await sleep(400);
    const fileInput = await p.$("input[type='file']");
    await fileInput.uploadFile(tmpPngPath);
    await sleep(1200);
    const afterReplace = await apiJson(`/api/comics/${cid}`);
    ck(afterReplace.imageUrl !== beforeImage, "replacing the cover changes the comic's image URL");
    ck(
      await p.evaluate(() => document.body.textContent.includes("Cover replaced")),
      "replace cover shows a success toast",
    );
    fs.rmSync(tmpPngPath, { force: true });
  }

  await p.keyboard.press("Escape");
  await sleep(400);

  // Regression (issue #1): during the modal-open fly-in the cover must render
  // at full opacity from its first frame — the shared-layout crossfade used to
  // fade it 0->1 over the black backdrop, showing a darkened cover for ~150ms.
  // And a cold open (full image never prefetched) must still get a real fly-in
  // with decoded pixels: the undecoded <img> used to measure 0x0, skipping the
  // flight entirely. Sample every rAF while opening and assert on the frames.
  const sampleModalOpen = async (open) => {
    await p.evaluate(() => {
      window.__flight = [];
      const t0 = performance.now();
      const tick = () => {
        const t = performance.now() - t0;
        const root = [...document.querySelectorAll("div.fixed")].find((d) =>
          d.className.includes("z-[70]"),
        );
        const img = root && root.querySelector("img");
        if (img) {
          const r = img.getBoundingClientRect();
          window.__flight.push({
            t,
            opacity: getComputedStyle(img).opacity,
            naturalWidth: img.naturalWidth,
            w: Math.round(r.width),
          });
        }
        if (t < 1200) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    await open();
    await sleep(1400);
    return p.evaluate(() => window.__flight);
  };

  // Warm open: hover first (preloads + decodes the full image), then click.
  await p.goto(BASE, { waitUntil: "networkidle0" });
  await sleep(700);

  // The grid hover label surfaces the rating (invisible in grid view otherwise).
  // The comic just rated 4 stars is the only rated one, so its card's label
  // (rendered in the DOM even at rest, just visually hidden) must read "4.0".
  const rated = await apiJson(`/api/comics/${cid}`);
  const gridRating = await p.evaluate((alt) => {
    const img = [...document.querySelectorAll("main img")].find(
      (i) => i.alt.trim() === alt,
    );
    const card = img && img.closest(".group");
    return card ? card.querySelector(".text-amber-400")?.textContent.trim() : null;
  }, `${rated.series} ${rated.issueNumber ? `#${rated.issueNumber}` : ""}`.trim());
  ck(gridRating === "4.0", `grid hover label shows the rating (got ${gridRating})`);

  const warmBox = await p.evaluate(() => {
    const img = document.querySelector("main img[src*='thumb.webp']");
    const r = img.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  await p.mouse.move(warmBox.x, warmBox.y);
  await sleep(500);
  let flight = await sampleModalOpen(() => p.mouse.click(warmBox.x, warmBox.y));
  ck(
    flight.length > 5 && flight.every((f) => f.opacity === "1"),
    `warm open: cover stays at full opacity through the fly-in (${flight.length} frames)`,
  );
  ck(flight[0]?.naturalWidth > 0, "warm open: cover has decoded pixels from the first frame");
  await p.keyboard.press("Escape");
  await sleep(600);

  // Cold open: keyboard-activate a card that was never hovered, so full.webp
  // was never requested. The thumbnail fallback must give the shared element
  // real dimensions immediately, so the fly-in runs (width grows over frames).
  await p.goto(BASE, { waitUntil: "networkidle0" });
  await sleep(700);
  await p.evaluate(() => {
    const thumbs = [...document.querySelectorAll("main img[src*='thumb.webp']")];
    thumbs[thumbs.length - 1].closest("[role='button']").focus();
  });
  flight = await sampleModalOpen(() => p.keyboard.press("Enter"));
  ck(
    flight.length > 5 && flight[0]?.naturalWidth > 0,
    "cold open: cover renders decoded (thumbnail) pixels from the first frame",
  );
  ck(
    flight.length > 5 && flight[0].w < flight[flight.length - 1].w - 40,
    `cold open: fly-in actually runs (cover grows ${flight[0]?.w}px -> ${flight[flight.length - 1]?.w}px)`,
  );
  ck(
    flight.every((f) => f.opacity === "1"),
    "cold open: cover stays at full opacity through the fly-in",
  );
  await p.keyboard.press("Escape");
  await sleep(600);

  // Add-to-board / remove-from-board via the card menu (BoardMembershipList) —
  // shared by the grid card menu and the detail modal, tested once here.
  {
    const boardsForMenu = await apiJson("/api/boards");
    const targetBoard = boardsForMenu[0];
    if (targetBoard) {
      const cardLabel = await p.evaluate(() => document.querySelector("main img[src*='thumb.webp']").alt);
      await p.evaluate(() => {
        const img = document.querySelector("main img[src*='thumb.webp']");
        img.closest(".group.relative").querySelector("div.absolute.right-2 button").click();
      });
      await sleep(300);
      const findCard = async () => {
        const all = await apiJson("/api/comics");
        return all.find(
          (c) => `${c.series} ${c.issueNumber ? `#${c.issueNumber}` : ""}`.trim() === cardLabel,
        );
      };
      // A native DOM click (not Puppeteer's ElementHandle.click, which needs
      // a real CDP clickable-point) re-queried fresh each time — robust
      // against both the popover's own open animation and the toggle
      // mutation's refetch potentially replacing the button's DOM node.
      const clickBoardItem = () =>
        p.evaluate((name) => {
          [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === name)?.click();
        }, targetBoard.name);
      await clickBoardItem();
      await sleep(500);
      const afterAdd = await findCard();
      ck(
        !!afterAdd?.boardIds.includes(targetBoard.id),
        "card menu 'Add to board' adds the comic to that board",
      );
      // Same button toggles it back off — the menu doesn't close between
      // clicks (BoardMembershipList's toggle doesn't call a close()).
      await clickBoardItem();
      await sleep(500);
      const afterRemove = await findCard();
      ck(
        !afterRemove?.boardIds.includes(targetBoard.id),
        "clicking it again removes the comic from that board",
      );
      await p.keyboard.press("Escape");
      await sleep(300);
    }
  }

  // Upload: POST /api/comics (multipart) creates a comic owned by the user, with
  // a generated thumbnail + dimensions; empty series is rejected.
  const PNG =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
  const beforeUpload = (await apiJson("/api/comics")).length;
  const up = await p.evaluate(async (b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const form = new FormData();
    form.append("file", new File([bytes], "t.png", { type: "image/png" }));
    form.append(
      "meta",
      JSON.stringify({ series: "Uploaded Test", issueNumber: "99", publisher: "TestPub", authors: ["Test Author"], tags: ["uploaded"] }),
    );
    const r = await fetch("/api/comics", { method: "POST", body: form });
    return { status: r.status, body: await r.json() };
  }, PNG);
  ck(up.status === 201 && up.body.series === "Uploaded Test", `upload API creates a comic (status ${up.status})`);
  ck(
    !!up.body.thumbUrl && up.body.width > 0 && up.body.authors.includes("Test Author"),
    "uploaded comic has generated thumb + dimensions + metadata",
  );
  ck((await apiJson("/api/comics")).length === beforeUpload + 1, "comic count +1 after upload");
  const badStatus = await p.evaluate(async (b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const form = new FormData();
    form.append("file", new File([bytes], "t.png", { type: "image/png" }));
    form.append("meta", JSON.stringify({ series: "" })); // empty series is invalid
    return (await fetch("/api/comics", { method: "POST", body: form })).status;
  }, PNG);
  ck(badStatus === 400, `empty series is rejected with 400 (got ${badStatus})`);
  // A non-image file (valid meta) is a client error -> 400, not a sharp 500 (item 6).
  const notImage = await p.evaluate(async () => {
    const form = new FormData();
    form.append("file", new File(["this is plain text, not an image"], "t.txt", { type: "text/plain" }));
    form.append("meta", JSON.stringify({ series: "Not An Image" }));
    const r = await fetch("/api/comics", { method: "POST", body: form });
    return { status: r.status, body: await r.json() };
  });
  ck(
    notImage.status === 400 && /valid image/i.test(notImage.body.error ?? ""),
    `non-image upload rejected with 400 (got ${notImage.status})`,
  );
  // Undo delete: deleting via the card menu shows an actionable "Undo" toast
  // (soft delete, not a hard remove); clicking it restores the comic. Search
  // down to just this card — it has no coverDate, so under the default sort
  // it can sink below the virtualization window and never mount.
  await p.goto(`${BASE}/?q=${encodeURIComponent("Uploaded Test")}`, { waitUntil: "networkidle0" });
  await sleep(700);
  const cardLabel = "Uploaded Test #99";
  await p.evaluate((label) => {
    const img = [...document.querySelectorAll("main img")].find((i) => i.alt === label);
    img.closest(".group").querySelector("div.absolute.right-2 button").click();
  }, cardLabel);
  await sleep(300);
  const [deleteMenuItem] = await p.$$("xpath/.//button[normalize-space(.)='Delete comic']");
  await deleteMenuItem.click();
  await sleep(300);
  const deletePersisted = p
    .waitForResponse(
      (r) => r.url().endsWith(`/api/comics/${up.body.id}`) && r.request().method() === "DELETE",
      { timeout: 10000 },
    )
    .catch(() => null);
  const [confirmDeleteBtn] = await p.$$("xpath/.//button[normalize-space(.)='Delete']");
  await confirmDeleteBtn.click();
  await deletePersisted;
  await sleep(400);

  const cardGoneAfterDelete = await p.evaluate(
    (label) => ![...document.querySelectorAll("main img")].some((i) => i.alt === label),
    cardLabel,
  );
  ck(cardGoneAfterDelete, "deleted comic disappears from the board immediately");
  const toastHasUndo = await p.evaluate(() =>
    [...document.querySelectorAll("button")].some((b) => b.textContent.trim() === "Undo"),
  );
  ck(toastHasUndo, "delete shows an actionable 'Undo' toast");

  const restorePersisted = p
    .waitForResponse(
      (r) => r.url().endsWith(`/api/comics/${up.body.id}/restore`) && r.request().method() === "POST",
      { timeout: 10000 },
    )
    .catch(() => null);
  const [undoBtn] = await p.$$("xpath/.//button[normalize-space(.)='Undo']");
  await undoBtn.click();
  await restorePersisted;
  await sleep(500);

  const cardBackAfterUndo = await p.evaluate(
    (label) => [...document.querySelectorAll("main img")].some((i) => i.alt === label),
    cardLabel,
  );
  ck(cardBackAfterUndo, "clicking Undo restores the comic");

  await p.evaluate((id) => fetch(`/api/comics/${id}`, { method: "DELETE" }), up.body.id);

  // List view: grid⇄list toggle renders rows; inline editing persists a field
  // without wiping the row's other metadata.
  await p.goto(BASE, { waitUntil: "networkidle0" });
  await sleep(500);
  await (await p.$$("button[aria-label='List view']"))[0].click();
  await sleep(700);
  ck((await imgs()) === N, `list view renders all ${N} rows`);
  const rows = await apiJson("/api/comics");
  rows.sort((a, b) => (b.coverDate || "").localeCompare(a.coverDate || ""));
  const row0 = rows[0];
  await p.evaluate((pub) => {
    const cell = [...document.querySelectorAll("main button[title='Click to edit']")].find(
      (b) => b.textContent.trim() === pub,
    );
    cell?.click();
  }, row0.publisher);
  await sleep(300);
  await p.evaluate(() => {
    document.activeElement.value = "";
  });
  await p.keyboard.type("ListEdited");
  await p.keyboard.press("Enter");
  await sleep(700);
  const rowAfter = await apiJson(`/api/comics/${row0.id}`);
  ck(rowAfter.publisher === "ListEdited", "list view inline edit persists");
  ck(
    JSON.stringify(rowAfter.artists) === JSON.stringify(row0.artists),
    "list view inline edit keeps the row's other metadata",
  );
  // List-view date cell commits on blur, not per keystroke (item 7): editing the
  // value fires no PATCH; blurring fires exactly one.
  let datePatches = 0;
  const countDatePatch = (req) => {
    if (/\/api\/comics\/[^/]+$/.test(req.url()) && req.method() === "PATCH") datePatches++;
  };
  p.on("request", countDatePatch);
  await p.evaluate(() => {
    const el = document.querySelector("main input[type='date']");
    el.focus();
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    setter.call(el, "2019-07-04");
    el.dispatchEvent(new Event("input", { bubbles: true })); // React onChange -> setDraft only
  });
  await sleep(400);
  ck(datePatches === 0, `editing a date fires no PATCH before blur (got ${datePatches})`);
  await p.evaluate(() => document.querySelector("main input[type='date']").blur());
  await sleep(600);
  ck(datePatches === 1, `blurring the date commits exactly one PATCH (got ${datePatches})`);
  p.off("request", countDatePatch);

  // Sortable list-view headers: clicking "Series" sorts A→Z; clicking again flips Z→A.
  const seriesInDom = async () =>
    p.evaluate(() => {
      const wrap = document.querySelector("main .overflow-x-auto > div");
      return [...wrap.children]
        .slice(1) // drop the header row
        .map((r) => r.children[2]?.textContent.trim() ?? ""); // [checkbox, thumbnail, series]
    });
  const monotonic = (arr, up) =>
    arr.every((s, i) => i === 0 || (up ? arr[i - 1].localeCompare(s) <= 0 : arr[i - 1].localeCompare(s) >= 0));

  await (await p.$$("button[title='Sort by Series']"))[0].click();
  await sleep(400);
  ck(monotonic(await seriesInDom(), true), "clicking Series header sorts rows A→Z");
  await (await p.$$("button[title='Sort by Series']"))[0].click();
  await sleep(400);
  ck(monotonic(await seriesInDom(), false), "clicking Series header again flips to Z→A");

  // Multi-select + bulk actions (item 2a), list view only. `labels[0]` is the
  // header "select all"; labels[1..] are each row's checkbox, DOM order.
  {
    const labels = await p.$$("main .overflow-x-auto label");
    await labels[1].click();
    await p.keyboard.down("Shift");
    await labels[3].click(); // range-select rows 0-2
    await p.keyboard.up("Shift");
    await sleep(300);
    const selectedText = await p.evaluate(() => document.body.textContent.match(/(\d+) selected/)?.[1]);
    ck(selectedText === "3", `shift-click range-selects 3 rows (got ${selectedText})`);

    // Aggregate counts, not per-row identity — the seed data has duplicate
    // series names (e.g. two "Absolute Batman" issues), so matching DOM rows
    // back to specific API records by name would be ambiguous. Counting a
    // pre-existing tag before/after is still a real regression check: if the
    // bulk action overwrote each comic's tags instead of unioning into them
    // (item 2a's tag-union decision), any selected comic that already had
    // this tag would lose it, and the count would drop.
    const countWithTag = (comics, tag) => comics.filter((c) => c.tags.includes(tag)).length;
    const before = await apiJson("/api/comics");
    const variantBefore = countWithTag(before, "Variant");

    const [addTagBtn] = await p.$$("xpath/.//button[normalize-space(.)='Add tag']");
    await addTagBtn.click();
    await sleep(300);
    await p.keyboard.type("BulkTagXYZ");
    await p.keyboard.press("Enter");
    await sleep(600);
    const after = await apiJson("/api/comics");
    ck(countWithTag(after, "BulkTagXYZ") === 3, "bulk 'Add tag' applies the new tag to all 3 selected");
    ck(
      countWithTag(after, "Variant") === variantBefore,
      "bulk 'Add tag' doesn't wipe an existing tag on comics that already had one (union, not overwrite)",
    );

    // Bulk add-to-board / remove-from-board. Counts, not per-row identity —
    // same reasoning as the tag check above. `boards[i].count` already
    // exists on the API response, so this doesn't need its own lookup.
    const boardsList = await apiJson("/api/boards");
    const targetBoard = boardsList[0];
    if (targetBoard) {
      const countBefore = boardsList.find((b) => b.id === targetBoard.id).count;
      // A later test ("custom board defaults to Manual sort") reuses this
      // same board and needs it non-empty — BoardView shows an EmptyBoard
      // state (no toolbar, no sort selector) once a board hits 0 comics
      // (BoardView.tsx:128). Capture original membership so it can be
      // restored after this test empties the board.
      const originalMemberIds = (await apiJson("/api/comics"))
        .filter((c) => c.boardIds.includes(targetBoard.id))
        .map((c) => c.id);

      const boardLabels1 = await p.$$("main .overflow-x-auto label");
      await boardLabels1[1].click();
      await p.keyboard.down("Shift");
      await boardLabels1[3].click();
      await p.keyboard.up("Shift");
      await sleep(300);

      const [addToBoardBtn] = await p.$$("xpath/.//button[normalize-space(.)='Add to board']");
      await addToBoardBtn.click();
      await sleep(300);
      // Native DOM click (not Puppeteer's ElementHandle.click) — this button
      // is inside an animated popover, same clickable-point flakiness as the
      // card-menu case above.
      await p.evaluate((name) => {
        [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === name)?.click();
      }, targetBoard.name);
      await sleep(600);
      const countAfterAdd = (await apiJson("/api/boards")).find((b) => b.id === targetBoard.id).count;
      ck(
        countAfterAdd === countBefore + 3,
        `bulk 'Add to board' adds all 3 selected (count ${countBefore} -> ${countAfterAdd})`,
      );

      // "Remove from board" only shows while viewing that specific board (not
      // My Comics) — go there, select everything on it, and clear it out.
      await p.goto(`${BASE}/board/${targetBoard.id}`, { waitUntil: "networkidle0" });
      await sleep(600);
      await (await p.$$("button[aria-label='List view']"))[0].click();
      await sleep(600);
      const boardLabels2 = await p.$$("main .overflow-x-auto label");
      await boardLabels2[0].click(); // header "select all"
      await sleep(300);
      const [removeBtn] = await p.$$("xpath/.//button[normalize-space(.)='Remove from board']");
      await removeBtn.click();
      await sleep(700);
      const countAfterRemove = (await apiJson("/api/boards")).find((b) => b.id === targetBoard.id).count;
      ck(countAfterRemove === 0, `bulk 'Remove from board' clears the board (count -> ${countAfterRemove})`);

      // Restore original membership (see comment above) via direct API calls
      // — this is cleanup, not the thing under test, so no need to go
      // through the UI again.
      for (const id of originalMemberIds) {
        await p.evaluate(
          ({ boardId, comicId }) =>
            fetch(`/api/boards/${boardId}/comics/${comicId}`, { method: "PUT" }),
          { boardId: targetBoard.id, comicId: id },
        );
      }
      const countAfterRestore = (await apiJson("/api/boards")).find((b) => b.id === targetBoard.id).count;
      ck(
        countAfterRestore === countBefore,
        `restores the board's original ${countBefore} members after the test (got ${countAfterRestore})`,
      );

      await p.goto(BASE, { waitUntil: "networkidle0" });
      await sleep(500);
      await (await p.$$("button[aria-label='List view']"))[0].click();
      await sleep(600);
    }

    // A successful bulk action clears the selection (onDone), so the bar from
    // "Add tag" above is already gone — re-select before testing Delete.
    const labels2 = await p.$$("main .overflow-x-auto label");
    await labels2[1].click();
    await p.keyboard.down("Shift");
    await labels2[3].click();
    await p.keyboard.up("Shift");
    await sleep(300);

    // Bulk delete (soft) + Undo restores all of them, mirroring single-delete.
    // The bar's own "Delete" trigger stays mounted behind the confirm dialog,
    // so a second query for "Delete" matches both — the dialog's button (in
    // a document.body portal) comes last in document order, so take the last
    // match rather than the first.
    const beforeCount = (await apiJson("/api/comics")).length;
    const [deleteBtn] = await p.$$("xpath/.//button[normalize-space(.)='Delete']");
    await deleteBtn.click();
    await sleep(300);
    const deleteMatches = await p.$$("xpath/.//button[normalize-space(.)='Delete']");
    await deleteMatches[deleteMatches.length - 1].click();
    await sleep(600);
    ck(
      (await apiJson("/api/comics")).length === beforeCount - 3,
      "bulk delete removes all 3 selected comics",
    );
    const toastHasUndo = await p.evaluate(() =>
      [...document.querySelectorAll("button")].some((b) => b.textContent.trim() === "Undo"),
    );
    ck(toastHasUndo, "bulk delete shows an actionable 'Undo' toast");
    const [undoBtn] = await p.$$("xpath/.//button[normalize-space(.)='Undo']");
    await undoBtn.click();
    await sleep(600);
    ck(
      (await apiJson("/api/comics")).length === beforeCount,
      "clicking Undo restores all 3 bulk-deleted comics",
    );
  }

  await (await p.$$("button[aria-label='Grid view']"))[0].click();
  await sleep(400);

  // Custom board defaults to Manual sort.
  const boards = await apiJson("/api/boards");
  if (boards[0]) {
    await p.goto(`${BASE}/board/${boards[0].id}`, { waitUntil: "networkidle0" });
    await sleep(700);
    ck(/Manual order/.test(await sortLabel()), "custom board defaults to Manual sort");

    // Tab "…" menu renders in a portal (not clipped).
    await p.evaluate((name) => {
      const t = [...document.querySelectorAll("div")].find(
        (d) => d.className.includes("group") && d.textContent.includes(name) && d.querySelector("button svg"),
      );
      const dot = [...t.querySelectorAll("button")].find((b) => b.querySelector("svg") && !b.textContent.includes(name));
      dot.click();
    }, boards[0].name);
    await sleep(300);
    const menuItems = await p.evaluate(() =>
      [...document.querySelectorAll("button")]
        .filter((b) => /Rename|Delete/.test(b.textContent) && b.offsetParent !== null)
        .map((b) => b.textContent.trim()),
    );
    ck(menuItems.includes("Rename") && menuItems.includes("Delete"), "tab menu shows Rename + Delete (portal, unclipped)");

    // Delete-board dialog is centered in the viewport (portal), not clipped.
    const [del] = await p.$$("xpath/.//button[normalize-space(.)='Delete']");
    await del.click();
    await sleep(400);
    const box = await p.evaluate(() => {
      const h = [...document.querySelectorAll("h2")].find((x) => /Delete board/.test(x.textContent));
      const panel = h.closest("div.relative");
      const r = panel.getBoundingClientRect();
      return { top: r.top, centeredOffset: Math.abs((r.top + r.bottom) / 2 - window.innerHeight / 2) };
    });
    ck(box.top > 0 && box.centeredOffset < 60, `delete-board dialog centered, not cut off (top ${Math.round(box.top)})`);

    // A failed rename shows an error toast and leaves the dialog open (item 4).
    // Re-navigate to reset overlay state, then stub the board PATCH as a 500.
    await p.goto(`${BASE}/board/${boards[0].id}`, { waitUntil: "networkidle0" });
    await sleep(600);
    await p.setRequestInterception(true);
    const stub500 = (req) => {
      if (/\/api\/boards\/[^/]+$/.test(req.url()) && req.method() === "PATCH") {
        req.respond({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ error: "Stubbed board failure" }),
        });
      } else {
        req.continue();
      }
    };
    p.on("request", stub500);

    // Open the tab "…" menu → Rename.
    await p.evaluate((name) => {
      const t = [...document.querySelectorAll("div")].find(
        (d) => d.className.includes("group") && d.textContent.includes(name) && d.querySelector("button svg"),
      );
      const dot = [...t.querySelectorAll("button")].find((b) => b.querySelector("svg") && !b.textContent.includes(name));
      dot.click();
    }, boards[0].name);
    await sleep(300);
    const [rename] = await p.$$("xpath/.//button[normalize-space(.)='Rename']");
    await rename.click();
    await sleep(300);

    // Edit the name and Save → hits the stubbed 500.
    await p.keyboard.type(" Renamed");
    const [save] = await p.$$("xpath/.//button[normalize-space(.)='Save']");
    await save.click();
    await sleep(600);

    const renameStillOpen = await p.evaluate(() =>
      [...document.querySelectorAll("h2")].some((x) => /Rename board/.test(x.textContent)),
    );
    const errToast = await p.evaluate(() => document.body.textContent.includes("Stubbed board failure"));
    ck(renameStillOpen, "failed rename leaves the rename dialog open");
    ck(errToast, "failed rename shows an error toast");

    p.off("request", stub500);
    await p.setRequestInterception(false);
  }

  // Drag tabs to reorder boards — same swap semantics as card reorder (above),
  // just on boards.tabPosition instead of comics.position.
  if (boards[0] && boards[1]) {
    await p.goto(BASE, { waitUntil: "networkidle0" });
    await sleep(700);
    const tabBox = async (name) =>
      p.evaluate((n) => {
        const t = [...document.querySelectorAll("div")].find(
          (d) => d.className.includes("group") && d.textContent.includes(n) && d.querySelector("button svg"),
        );
        const r = t.getBoundingClientRect();
        return { cx: r.x + r.width / 2, cy: r.y + r.height / 2 };
      }, name);
    const boxA = await tabBox(boards[0].name);
    const boxB = await tabBox(boards[1].name);
    const beforeAFirst = boxA.cx < boxB.cx;

    await p.mouse.move(boxA.cx, boxA.cy);
    await p.mouse.down();
    for (let i = 1; i <= 14; i++) {
      await p.mouse.move(boxA.cx + ((boxB.cx - boxA.cx) * i) / 14, boxA.cy + ((boxB.cy - boxA.cy) * i) / 14);
      await sleep(20);
    }
    await sleep(200);
    const tabPosPersisted = p
      .waitForResponse(
        (r) => /\/api\/boards\/[^/]+$/.test(r.url()) && r.request().method() === "PATCH",
        { timeout: 10000 },
      )
      .catch(() => null);
    await p.mouse.up();
    await tabPosPersisted;
    await sleep(400);

    const afterA = await tabBox(boards[0].name);
    const afterB = await tabBox(boards[1].name);
    const afterAFirst = afterA.cx < afterB.cx;
    ck(afterAFirst !== beforeAFirst, "dragging a tab onto another swaps their order");

    await p.goto(BASE, { waitUntil: "networkidle0" });
    await sleep(700);
    const reloadA = await tabBox(boards[0].name);
    const reloadB = await tabBox(boards[1].name);
    ck((reloadA.cx < reloadB.cx) === afterAFirst, "tab reorder persists across reload");
  }

  // A present-but-invalid session cookie must NOT loop / ⇄ /login (item 21).
  // The middleware gate only checks cookie *presence*; the API validates it. A
  // stale cookie (after a BETTER_AUTH_SECRET rotation, a session revocation, or
  // a DB reset) passes the gate, 401s at the API, and — unless the 401 path
  // clears it — the redirect to /login bounces straight back to "/", forever.
  // Simulate a stale cookie with a garbage token under the real cookie name;
  // this must settle on a usable /login instead of a redirect storm.
  {
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

  console.log(`\n==== INTEGRATION: ${fails.length ? `${fails.length} FAILED` : "ALL PASSED"} ====`);
} catch (e) {
  console.error("ERROR:", e.message);
  fails.push("exception: " + e.message);
} finally {
  if (browser) await browser.close();
  server.kill("SIGTERM");
  await sleep(500);
  fs.rmSync(DATA_DIR, { recursive: true, force: true });
  fs.rmSync(path.join(ROOT, DIST_DIR), { recursive: true, force: true });
}

process.exit(fails.length ? 1 : 0);
