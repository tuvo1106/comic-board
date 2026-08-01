import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import puppeteer from "puppeteer-core";
import { ROOT, PORT, BASE, CHROME, DATA_DIR, DIST_DIR, env, sleep } from "./env.mjs";
import { writeFakeUpscaler } from "./fake-upscaler.mjs";

function run(cmd, args) {
  const r = spawnSync(cmd, args, { cwd: ROOT, env, stdio: "inherit" });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(" ")} failed`);
}

/**
 * Refuse to start if anything is already listening on the test port.
 *
 * This is the guard that was missing behind a long-running "flaky suite"
 * mystery. `waitForServer` only ever checked "does BASE answer 200?" — which a
 * *leftover* next-server from an interrupted run answers perfectly well. And
 * because that leftover keeps its `better-sqlite3` file descriptors open, it
 * goes on serving the previous run's database even after this run has deleted
 * `data/test` and re-seeded a brand-new one (POSIX keeps an unlinked inode
 * alive for as long as an fd references it). The suite then tests a stale,
 * progressively-more-mutated database while the freshly-seeded one sits
 * unused — so assertions drift run over run, while re-running the seed step in
 * isolation looks perfectly deterministic. Fail loudly here instead.
 */
function assertPortFree(port) {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once("error", (err) => {
      if (err.code !== "EADDRINUSE") return reject(err);
      reject(
        new Error(
          `port ${port} is already in use.\n` +
            `  Almost always a leftover 'next start' from an interrupted run. Without this\n` +
            `  check the suite would silently test THAT server — which may still be serving\n` +
            `  an already-deleted copy of the test database — instead of the one just seeded.\n` +
            `  Find it:  lsof -nP -iTCP:${port} -sTCP:LISTEN\n` +
            `  Kill it:  kill $(lsof -t -nP -iTCP:${port} -sTCP:LISTEN)`,
        ),
      );
    });
    probe.once("listening", () => probe.close(() => resolve()));
    probe.listen(port);
  });
}

// Deliberately unguarded (matches the original single-file script): if
// migrate/seed/build fails, let it throw and crash the run rather than
// reporting a soft FAIL — there's no browser session yet to clean up.
export async function buildAndSeed() {
  // Before the expensive build, not after — a port conflict should cost a
  // second, not a full build cycle.
  await assertPortFree(PORT);

  fs.rmSync(DATA_DIR, { recursive: true, force: true });
  fs.mkdirSync(DATA_DIR, { recursive: true });
  // Must exist before the server starts: `UPSCALER_BIN` points at it, and the
  // upscale UI renders only when that path is set.
  writeFakeUpscaler();
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
  // `detached` puts the server in its own process group so teardown can signal
  // the whole tree (`npx` -> `npm exec` -> `next-server`). Killing only the
  // direct child can leave the actual server behind as an orphan.
  const server = spawn("npx", ["next", "start", "-p", String(PORT)], {
    cwd: ROOT,
    env,
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });

  // Always DRAIN the pipes. Node's default `stdio: 'pipe'` with no reader
  // attached will deadlock the child once it writes ~64KB and the buffer
  // fills. Keep a bounded tail purely for diagnostics — the server is
  // normally silent, so this stays quiet unless something goes wrong.
  server.logTail = [];
  const keep = (buf) => {
    server.logTail.push(buf.toString());
    if (server.logTail.length > 40) server.logTail.shift();
  };
  server.stdout.on("data", keep);
  server.stderr.on("data", keep);
  return server;
}

async function waitForServer(server) {
  for (let i = 0; i < 120; i++) {
    // A server that died (bad build, crash on boot) will never answer — bail
    // with its output instead of burning the full 60s and reporting a bare
    // "did not become ready".
    if (server.exitCode !== null) {
      throw new Error(
        `server exited early with code ${server.exitCode}:\n${server.logTail.join("")}`,
      );
    }
    try {
      const res = await fetch(BASE);
      if (res.ok) return;
    } catch {
      /* not up yet */
    }
    await sleep(500);
  }
  throw new Error(`server did not become ready:\n${server.logTail.join("")}`);
}

export async function launchBrowser(server) {
  await waitForServer(server);
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
    defaultViewport: { width: 1440, height: 1000 },
  });
  const p = await browser.newPage();
  return { browser, p };
}

function killServerTree(server) {
  if (!server || server.exitCode !== null) return;
  try {
    process.kill(-server.pid, "SIGTERM"); // negative pid => the whole group
  } catch {
    try {
      server.kill("SIGTERM");
    } catch {
      /* already gone */
    }
  }
}

export async function teardown({ server, browser }) {
  if (browser) await browser.close().catch(() => {});
  killServerTree(server);
  await sleep(500);
  fs.rmSync(DATA_DIR, { recursive: true, force: true });
  fs.rmSync(path.join(ROOT, DIST_DIR), { recursive: true, force: true });
}

/**
 * `try/finally` covers exceptions but NOT signals: a Ctrl-C (or an editor/CI
 * killing the runner) skips the finally block entirely, orphaning the server
 * with its database fds still open — which is exactly how the stale-server
 * situation above gets created in the first place. Interrupting an iteration
 * on a failing test is a completely routine thing to do, so make it safe.
 */
export function installSignalTeardown(getState) {
  for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"]) {
    process.once(sig, () => {
      console.log(`\n• ${sig} — tearing down the test server before exiting…`);
      const { server, browser } = getState();
      if (browser) browser.close().catch(() => {});
      killServerTree(server);
      // Reap the process group before the runner exits; a full async teardown
      // isn't reliable inside a signal handler.
      setTimeout(() => {
        // Same cleanup teardown() does, so an interrupted run doesn't leave a
        // stale db dir or a multi-hundred-MB build dir behind. Safe now that
        // the server holding their fds has been signalled.
        fs.rmSync(DATA_DIR, { recursive: true, force: true });
        fs.rmSync(path.join(ROOT, DIST_DIR), { recursive: true, force: true });
        process.exit(130);
      }, 700);
    });
  }
}
