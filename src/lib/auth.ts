import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { isNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { boards, comics } from "@/db/schema";
import * as authSchema from "@/db/auth-schema";

/**
 * better-auth instance: email/password, sessions in an HTTP-only cookie, backed
 * by the app's Drizzle/sqlite database.
 *
 * Set BETTER_AUTH_SECRET in production (see .env.example). The dev fallback keeps
 * `npm run dev` working with zero setup.
 */
export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "sqlite", schema: authSchema }),
  emailAndPassword: {
    enabled: true,
    autoSignIn: true, // sign in immediately after signup
    minPasswordLength: 8,
  },
  secret: process.env.BETTER_AUTH_SECRET || "dev-only-insecure-secret-change-me",
  databaseHooks: {
    user: {
      create: {
        after: async (createdUser) => {
          // The first account to sign up claims all pre-auth (unowned) data, so
          // the seeded/existing collection carries over to that owner.
          const { n } = db
            .select({ n: sql<number>`count(*)` })
            .from(authSchema.user)
            .get() ?? { n: 0 };
          if (n === 1) {
            db.update(comics).set({ userId: createdUser.id }).where(isNull(comics.userId)).run();
            db.update(boards).set({ userId: createdUser.id }).where(isNull(boards.userId)).run();
          }
        },
      },
    },
  },
  plugins: [nextCookies()], // must be last: writes Set-Cookie in route handlers
});

export type Session = typeof auth.$Infer.Session;
