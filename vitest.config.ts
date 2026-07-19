import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Backend tests run against an isolated in-memory SQLite DB.
    env: {
      DATABASE_PATH: ":memory:",
      DATA_DIR: "/tmp/comic-board-vitest",
    },
  },
});
