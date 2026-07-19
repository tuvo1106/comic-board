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

  const imgs = () => p.$$eval("main img[src*='thumb.webp']", (e) => e.length);
  const sortLabel = () =>
    p.evaluate(() => [...document.querySelectorAll("button")].map((b) => b.textContent).find((t) => t && t.includes("Sort:")));

  // Authenticated fetches must run in the browser (which holds the session cookie).
  const apiJson = (path) => p.evaluate((pth) => fetch(pth).then((r) => r.json()), path);
  const N = (await apiJson("/api/comics")).length;

  await p.goto(BASE, { waitUntil: "networkidle0" });
  await sleep(800);
  ck((await imgs()) === N, `board renders all ${N} covers`);
  ck(/Cover date/.test(await sortLabel()), "My Comics defaults to Cover date sort");

  // Regression: client-side filter via click must render the subset (not 0).
  let [pub] = await p.$$("xpath/.//button[normalize-space(.)='Publisher']");
  await pub.click();
  await sleep(300);
  const [dc] = await p.$$("xpath/.//button[contains(., 'DC')]");
  await dc.click();
  await sleep(900);
  const dcCount = await imgs();
  ck(dcCount > 0 && dcCount < N, `clicking Publisher>DC renders a non-empty subset (${dcCount})`);
  // board-scoped facet count matches what renders (option text is like "DC14")
  const dcOptCount = await p.evaluate(() => {
    const btn = [...document.querySelectorAll("button")].find((b) =>
      /^DC\d+$/.test(b.textContent.replace(/\s+/g, "")),
    );
    const m = btn && btn.textContent.replace(/\s+/g, "").match(/(\d+)$/);
    return m ? Number(m[1]) : null;
  });
  ck(dcOptCount === dcCount, `facet dropdown count matches rendered subset (${dcOptCount} vs ${dcCount})`);

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
  const starBtns = await p.$$("button[aria-label$='stars']");
  await starBtns[7].click(); // 8th half-target = 4.0 stars
  await sleep(500);
  const afterRate = await apiJson(`/api/comics/${cid}`);
  ck(
    afterRate.rating === 4 && afterRate.artists.includes("Integration Tester"),
    `rating keeps other metadata (rating=${afterRate.rating}, artists kept=${afterRate.artists.includes("Integration Tester")})`,
  );

  await p.keyboard.press("Escape");
  await sleep(400);

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
  // Sortable list-view headers: clicking "Series" sorts A→Z; clicking again flips Z→A.
  const seriesInDom = async () =>
    p.evaluate(() => {
      const wrap = document.querySelector("main .overflow-x-auto > div");
      return [...wrap.children]
        .slice(1) // drop the header row
        .map((r) => r.children[1]?.textContent.trim() ?? "");
    });
  const monotonic = (arr, up) =>
    arr.every((s, i) => i === 0 || (up ? arr[i - 1].localeCompare(s) <= 0 : arr[i - 1].localeCompare(s) >= 0));

  await (await p.$$("button[title='Sort by Series']"))[0].click();
  await sleep(400);
  ck(monotonic(await seriesInDom(), true), "clicking Series header sorts rows A→Z");
  await (await p.$$("button[title='Sort by Series']"))[0].click();
  await sleep(400);
  ck(monotonic(await seriesInDom(), false), "clicking Series header again flips to Z→A");

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
