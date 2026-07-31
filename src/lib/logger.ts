import path from "node:path";
import winston from "winston";
import DailyRotateFile from "winston-daily-rotate-file";
import { DATA_DIR } from "@/db/client";

/**
 * App-wide logger: one JSON line per event, one file per calendar day under
 * `DATA_DIR/logs`, 7 days kept before the oldest file is deleted.
 *
 * `DATA_DIR` is the app's existing convention for local runtime state (the
 * sqlite db, stored covers both live under it) — logs follow the same
 * convention rather than a new location, and inherit its `.gitignore` entry.
 *
 * Every line carries a `tag` so a specific event type is one `grep` away:
 * `api` (one per request), `api.error`, `auth`, `startup`, `metron.detail`,
 * `metron.budget`.
 *
 * **Everything server-side goes here — no `console.*` diagnostics.** The Metron
 * provider log was the exception for a day, on the reasoning that a live
 * development diagnostic doesn't need retention. That was backwards: the
 * question it exists to answer (roadmap 4h — "variants aren't coming back
 * *recently*, can we check the logs?") is retrospective and spans days, while
 * terminal scrollback dies with the next server restart. Metron calls are also
 * the scarcest events in the app (a 20-call burst bucket), so they're the last
 * ones worth dropping, and `burstRemaining` is only meaningful as a trend.
 *
 * The dev console transport below is why that exception was never needed: file
 * and terminal are not either/or.
 *
 * The one thing deliberately NOT routed here is the `src/db/*` CLI scripts
 * (`db:migrate`, `db:seed`, `db:import`). Their stdout *is* their user
 * interface — you run them to read the output — so it stays on the console, and
 * a one-shot CLI invocation doesn't quietly create and rotate log files.
 */
export const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
  transports: [
    new DailyRotateFile({
      dirname: path.join(DATA_DIR, "logs"),
      filename: "%DATE%.log",
      datePattern: "YYYY-MM-DD",
      maxFiles: "7d",
      zippedArchive: false,
    }),
    // Outside production, mirror to the terminal so moving off `console.*`
    // doesn't cost the at-a-glance visibility of a running dev server. Silent
    // under NODE_ENV=test so the unit suite doesn't print a wall of JSON.
    new winston.transports.Console({
      silent: process.env.NODE_ENV === "test" || process.env.NODE_ENV === "production",
    }),
  ],
});
