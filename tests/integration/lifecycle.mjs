import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";
import { ROOT, PORT, BASE, CHROME, DATA_DIR, DIST_DIR, env, sleep } from "./env.mjs";

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

// Deliberately unguarded (matches the original single-file script): if
// migrate/seed/build fails, let it throw and crash the run rather than
// reporting a soft FAIL — there's no browser session yet to clean up.
export function buildAndSeed() {
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
}

export function startServer() {
  return spawn("npx", ["next", "start", "-p", String(PORT)], { cwd: ROOT, env });
}

export async function launchBrowser() {
  await waitForServer();
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
    defaultViewport: { width: 1440, height: 1000 },
  });
  const p = await browser.newPage();
  return { browser, p };
}

export async function teardown({ server, browser }) {
  if (browser) await browser.close();
  if (server) server.kill("SIGTERM");
  await sleep(500);
  fs.rmSync(DATA_DIR, { recursive: true, force: true });
  fs.rmSync(path.join(ROOT, DIST_DIR), { recursive: true, force: true });
}
