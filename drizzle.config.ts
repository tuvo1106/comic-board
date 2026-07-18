import type { Config } from "drizzle-kit";

export default {
  schema: ["./src/db/schema.ts", "./src/db/auth-schema.ts"],
  out: "./src/db/migrations",
  dialect: "sqlite",
  dbCredentials: {
    url: process.env.DATABASE_PATH ?? "./data/comic-board.db",
  },
} satisfies Config;
