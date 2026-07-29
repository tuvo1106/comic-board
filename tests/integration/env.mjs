import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
export const PORT = 3940;
export const BASE = `http://localhost:${PORT}`;
export const CHROME =
  process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
export const DATA_DIR = path.join(ROOT, "data", "test");
export const DB_PATH = path.join(DATA_DIR, "test.db");
export const DIST_DIR = ".next-itest"; // separate build dir so a running dev server isn't disturbed
export const env = {
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

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const fails = [];
export const ck = (cond, msg) => {
  console.log(`${cond ? "PASS" : "FAIL"}: ${msg}`);
  if (!cond) fails.push(msg);
};
