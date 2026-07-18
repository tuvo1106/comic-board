import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import path from "node:path";
import { db, DB_PATH } from "./client";

/**
 * Apply generated migrations. Run with `npm run db:migrate`.
 * Generate new migrations after schema changes with `npm run db:generate`.
 */
migrate(db, { migrationsFolder: path.join(process.cwd(), "src/db/migrations") });
console.log(`Migrations applied to ${DB_PATH}`);
