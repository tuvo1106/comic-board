/**
 * Next.js server-startup hook (auto-detected, no config flag needed as of
 * Next 15+). Runs once per server lifecycle — the natural place for
 * opportunistic maintenance work that doesn't belong on a request path.
 */
export async function register() {
  // Guard for the Node runtime only — better-sqlite3/fs don't work at the
  // edge, and this file also runs once for the edge runtime bundle.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { sweepDeletedComics, sweepOrphanedCovers } = await import("@/db/queries");
    const { logger } = await import("@/lib/logger");
    const swept = await sweepDeletedComics();
    // Order matters: hard-deleting first frees those comics' folders, so this
    // pass collects them in the same run rather than a restart later.
    const orphans = await sweepOrphanedCovers();
    if (swept > 0 || orphans > 0) {
      logger.info("startup sweep", { tag: "startup", sweptComics: swept, orphanedCovers: orphans });
    }
  }
}
