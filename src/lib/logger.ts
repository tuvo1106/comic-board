import path from "node:path";
import winston from "winston";
import DailyRotateFile from "winston-daily-rotate-file";
import { DATA_DIR } from "@/db/client";

/**
 * App-wide request logger: one JSON line per event, one file per calendar
 * day under `DATA_DIR/logs`, 7 days kept before the oldest file is deleted.
 *
 * `DATA_DIR` is the app's existing convention for local runtime state (the
 * sqlite db, stored covers both live under it) — logs follow the same
 * convention rather than a new location, and inherit its `.gitignore` entry.
 *
 * Every line carries a `tag` so a specific event type is one `grep` away
 * (`grep '"tag":"api"'`), matching the convention the Metron provider log
 * (`src/lib/metadata/metron.ts`) already established — that one stays a
 * separate plain `console.log`, since it's a live diagnostic checked during
 * development, not a persisted historical record.
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
  ],
});
