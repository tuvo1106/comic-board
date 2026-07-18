import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // better-sqlite3 and sharp are native; keep them external to the server bundle.
  serverExternalPackages: ["better-sqlite3", "sharp"],
  // Let the integration test server use its own build dir so it doesn't clash
  // with a dev server already running on the default `.next`.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // Next 16's in-build TypeScript check worker crashes on this Node version
  // ("id argument must be of type string"); we run `tsc --noEmit` separately.
  typescript: { ignoreBuildErrors: true },
};

export default nextConfig;
